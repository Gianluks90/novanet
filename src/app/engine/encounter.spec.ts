import { describe, expect, it } from 'vitest';
import { apply, legalCommands, strengthOf } from './engine';
import { TEST_CATALOG as CAT, Setup, cardsIn, findCommand, play, scenario } from './testing';
import { Z, obj, zone } from './zones';

const filler = (card: string, n: number) => Array.from({ length: n }, () => card);

/** Runner turn, a run on R&D (agenda on top) behind the given ice. */
const runOn = (ice: string[], extra: Setup = {}) =>
  play(
    scenario({
      active: 'runner',
      runner: { rig: ['fracter'], hand: filler('event-0', 3), credits: 5, ...extra.runner },
      corp: { credits: 5, deck: ['agenda-3-2'], servers: { rd: { ice } }, ...extra.corp },
    }),
    'run',
    { server: 'rd' },
  );

describe('rezzing ice during the approach', () => {
  it('opens a window for the Corp when the approached ice can be rezzed', () => {
    const s = runOn(['barrier-2']);
    expect(s.pending).toEqual({ player: 'corp', kind: 'rez' });
    expect(s.run?.phase).toBe('approach');
  });

  it('passing leaves the ice unrezzed and the Runner moves on without an encounter', () => {
    let s = runOn(['barrier-2']);
    s = play(s, 'pass');
    expect(s.pending).toEqual({ player: 'runner', kind: 'movement' });
    expect(s.run?.passedIce).toBe(true);
  });

  it('there is no window when the Corp cannot afford the ice', () => {
    const s = runOn(['barrier-2'], { corp: { credits: 2 } });
    expect(s.pending).toEqual({ player: 'runner', kind: 'movement' });
  });

  it('rezzing pays the rez cost, turns the ice faceup and starts the encounter', () => {
    let s = runOn(['barrier-2']);
    s = play(s, 'rez', { card: 'barrier-2' });
    expect(s.players.corp.credits).toBe(2);
    expect(obj(s, zone(s, Z.ice('rd'))[0]).faceUp).toBe(true);
    expect(s.run?.phase).toBe('encounter');
    expect(s.pending).toEqual({ player: 'runner', kind: 'encounter' });
  });

  it('only the approached ice can be rezzed, not the other ice of the server', () => {
    const s = runOn(['barrier-2', 'gate-1']);
    const rez = legalCommands(s, CAT).filter((c) => c.type === 'rez');
    expect(rez).toHaveLength(1);
    expect(obj(s, (rez[0] as { objectId: number }).objectId).cardId).toBe('barrier-2');
  });

  it('the Corp can still rez an asset in the same window, then pass', () => {
    let s = play(
      scenario({
        active: 'runner',
        corp: { credits: 5, servers: { remote1: { root: ['asset-t3'], ice: ['barrier-2'] } } },
      }),
      'run',
      { server: 'remote1' },
    );
    // at initiation only the asset can be rezzed (ice only at its own approach)
    expect(legalCommands(s, CAT).filter((c) => c.type === 'rez')).toHaveLength(1);
    s = play(s, 'pass');
    expect(legalCommands(s, CAT).filter((c) => c.type === 'rez')).toHaveLength(2);
    s = play(s, 'rez', { card: 'asset-t3' });
    expect(s.pending).toEqual({ player: 'corp', kind: 'rez' });
    expect(s.players.corp.credits).toBe(3);
  });
});

describe('encounter without a breaker', () => {
  it('unbroken "end the run" resolves and the run ends unsuccessfully with no breach', () => {
    let s = runOn(['gate-1'], { runner: { rig: [] } });
    s = play(s, 'rez', { card: 'gate-1' });
    expect(s.run).toBeNull();
    expect(cardsIn(s, Z.runnerScore)).toEqual([]);
    expect(s.pending).toEqual({ player: 'runner', kind: 'action' });
  });

  it('ice with no subroutines is passed at once', () => {
    let s = runOn(['ice-blank']);
    s = play(s, 'rez', { card: 'ice-blank' });
    expect(s.pending).toEqual({ player: 'runner', kind: 'movement' });
  });

  it('a breaker of the wrong type gives the Runner no options: the subroutines resolve', () => {
    let s = runOn(['gate-1']);
    s = play(s, 'rez', { card: 'gate-1' });
    expect(s.run).toBeNull();
  });

  it('subroutines resolve in order: end the run stops the rest', () => {
    let s = runOn(['barrier-2'], { runner: { rig: [], hand: ['event-0'] } });
    s = play(s, 'rez', { card: 'barrier-2' });
    // the first subroutine ends the run: the net damage never happens
    expect(s.run).toBeNull();
    expect(zone(s, Z.grip)).toHaveLength(1);
  });
});

describe('breaking subroutines', () => {
  it('needs enough strength: a 1-strength fracter cannot break a 2-strength barrier until boosted', () => {
    let s = runOn(['barrier-2']);
    s = play(s, 'rez', { card: 'barrier-2' });
    expect(findCommand(s, { type: 'break' })).toBeUndefined();
    expect(findCommand(s, { type: 'boost' })).toBeDefined();
    s = play(s, 'boost', { card: 'fracter' });
    expect(s.players.runner.credits).toBe(4);
    expect(strengthOf(s, CAT, zone(s, Z.rig)[0])).toBe(2);
    expect(findCommand(s, { type: 'break', subroutine: 0 })).toBeDefined();
    // no further boost is offered once the strength is enough
    expect(findCommand(s, { type: 'boost' })).toBeUndefined();
  });

  it('breaking the end-the-run subroutine leaves only the net damage to resolve', () => {
    let s = runOn(['barrier-2']);
    s = play(s, 'rez', { card: 'barrier-2' });
    s = play(s, 'boost', { card: 'fracter' });
    s = play(s, 'break', { card: 'fracter', subroutine: 0 });
    expect(s.players.runner.credits).toBe(3);
    s = play(s, 'continue');
    expect(zone(s, Z.grip)).toHaveLength(2); // 1 net damage
    expect(s.pending).toEqual({ player: 'runner', kind: 'movement' });
  });

  it('breaking every subroutine passes the ice with no effect; the run succeeds', () => {
    let s = runOn(['barrier-2']);
    s = play(s, 'rez', { card: 'barrier-2' });
    s = play(s, 'boost', { card: 'fracter' });
    s = play(s, 'break', { card: 'fracter', subroutine: 0 });
    s = play(s, 'break', { card: 'fracter', subroutine: 1 });
    expect(s.pending).toEqual({ player: 'runner', kind: 'movement' });
    expect(zone(s, Z.grip)).toHaveLength(3);
    s = play(s, 'continue');
    expect(cardsIn(s, Z.runnerScore)).toEqual(['agenda-3-2']);
  });

  it('boosts last until the end of the encounter only', () => {
    let s = runOn(['barrier-2', 'ice-blank']);
    s = play(s, 'rez', { card: 'barrier-2' });
    s = play(s, 'boost', { card: 'fracter' });
    s = play(s, 'break', { card: 'fracter', subroutine: 0 });
    s = play(s, 'break', { card: 'fracter', subroutine: 1 });
    expect(strengthOf(s, CAT, zone(s, Z.rig)[0])).toBe(1);
  });

  it('an AI-style "break all" pays once and the ice is fully broken', () => {
    let s = runOn(['barrier-2'], { runner: { rig: ['ai-all'] } });
    s = play(s, 'rez', { card: 'barrier-2' });
    s = play(s, 'break', { card: 'ai-all' });
    expect(s.players.runner.credits).toBe(3);
    expect(s.pending).toEqual({ player: 'runner', kind: 'movement' });
    expect(zone(s, Z.grip)).toHaveLength(3);
  });

  it('cannot break without the credits', () => {
    let s = runOn(['barrier-2'], { runner: { credits: 1 } });
    s = play(s, 'rez', { card: 'barrier-2' });
    s = play(s, 'boost', { card: 'fracter' });
    expect(findCommand(s, { type: 'break' })).toBeUndefined();
  });

  it('the Runner may decline to break and let the subroutines resolve', () => {
    let s = runOn(['barrier-2']);
    s = play(s, 'rez', { card: 'barrier-2' });
    s = play(s, 'continue');
    expect(s.run).toBeNull(); // the first subroutine ends the run
  });

  it('bad publicity fund credits pay for breaking', () => {
    let s = runOn(['barrier-2'], { runner: { credits: 0 }, corp: { badPublicity: 2 } });
    s = play(s, 'rez', { card: 'barrier-2' });
    s = play(s, 'boost', { card: 'fracter' });
    s = play(s, 'break', { card: 'fracter', subroutine: 0 });
    expect(s.players.runner.fund).toBe(0);
  });
});

describe('subroutine damage and runs through several ice', () => {
  it('net damage from a subroutine can flatline the Runner', () => {
    let s = runOn(['barrier-2'], { runner: { hand: [] } });
    s = play(s, 'rez', { card: 'barrier-2' });
    s = play(s, 'boost', { card: 'fracter' });
    s = play(s, 'break', { card: 'fracter', subroutine: 0 });
    s = play(s, 'continue');
    expect(s).toMatchObject({ status: 'ended', winner: 'corp', winReason: 'flatline' });
  });

  it('with several ice the Runner approaches the next one after passing the first', () => {
    let s = runOn(['ice-blank', 'gate-1']);
    s = play(s, 'rez', { card: 'ice-blank' });
    expect(s.run).toMatchObject({ phase: 'movement', position: 0 });
    s = play(s, 'continue');
    expect(s.run).toMatchObject({ phase: 'approach', position: 1 });
    expect(s.pending).toEqual({ player: 'corp', kind: 'rez' });
  });

  it('rezzed ice stays rezzed for later runs and is encountered without a rez window', () => {
    let s = runOn(['ice-blank']);
    s = play(s, 'rez', { card: 'ice-blank' });
    s = play(s, 'jackOut');
    s = play(s, 'run', { server: 'rd' });
    expect(s.pending).toEqual({ player: 'runner', kind: 'movement' });
  });
});

describe('rezzing assets and upgrades', () => {
  it('the Corp is offered windows at initiation and before the Runner approaches the server', () => {
    let s = play(
      scenario({
        active: 'runner',
        corp: { credits: 5, servers: { remote1: { root: ['asset-t3'] } } },
      }),
      'run',
      { server: 'remote1' },
    );
    expect(s.pending).toEqual({ player: 'corp', kind: 'rez' }); // initiation
    s = play(s, 'pass');
    expect(s.pending).toEqual({ player: 'runner', kind: 'movement' });
    s = play(s, 'continue');
    expect(s.pending).toEqual({ player: 'corp', kind: 'rez' }); // approach the server
    s = play(s, 'rez', { card: 'asset-t3' });
    // nothing else to rez: the window closes by itself
    expect(s.pending).toEqual({ player: 'runner', kind: 'trash' });
  });

  it('in its own turn the Corp rezzes an asset as a free action', () => {
    let s = scenario({ corp: { servers: { remote1: { root: ['asset-t3'] } } } });
    s = play(s, 'rez', { card: 'asset-t3' });
    expect(s.players.corp.credits).toBe(3);
    expect(s.players.corp.clicks).toBe(3);
  });

  it('ice cannot be rezzed in the Corp action phase', () => {
    const s = scenario({ corp: { servers: { hq: { ice: ['barrier-2'] } } } });
    expect(findCommand(s, { type: 'rez' })).toBeUndefined();
  });

  it('agendas can never be rezzed', () => {
    const s = scenario({ corp: { servers: { remote1: { root: ['agenda-3-2'] } } } });
    expect(findCommand(s, { type: 'rez' })).toBeUndefined();
  });

  it('the Runner cannot act in the Corp window', () => {
    const s = runOn(['barrier-2']);
    expect(apply(s, { type: 'continue', player: 'runner' }, CAT).ok).toBe(false);
  });
});
