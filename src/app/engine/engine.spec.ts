import { describe, expect, it } from 'vitest';
import {
  agendaPoints,
  apply,
  createGame,
  dealDamage,
  legalCommands,
  memoryUsed,
  mutate,
} from './engine';
import { TEST_CATALOG as CAT, cardsIn, findCommand, play, scenario } from './testing';
import { GameEvent } from './types';
import { Z, obj, zone } from './zones';

const filler = (card: string, n: number) => Array.from({ length: n }, () => card);

const newGame = (seed = 1) =>
  createGame(CAT, {
    seed,
    corp: { identity: 'corp-id', cards: [...filler('op-0', 20), 'agenda-3-2', 'asset-t3'] },
    runner: { identity: 'runner-id', cards: [...filler('event-0', 20), 'prog-1', 'hw'] },
  });

describe('setup', () => {
  it('deals 5 cards and 5 credits and asks the Corp for a mulligan first', () => {
    const s = newGame();
    expect(s.status).toBe('mulligan');
    expect(zone(s, Z.hq)).toHaveLength(5);
    expect(zone(s, Z.grip)).toHaveLength(5);
    expect(s.players.corp.credits).toBe(5);
    expect(s.players.runner.credits).toBe(5);
    expect(s.pending).toEqual({ player: 'corp', kind: 'mulligan' });
  });

  it('keeping both hands starts the Corp turn: 3 clicks and a drawn card', () => {
    let s = newGame();
    s = play(s, 'mulligan', { player: 'corp', keep: true });
    expect(s.pending).toEqual({ player: 'runner', kind: 'mulligan' });
    s = play(s, 'mulligan', { player: 'runner', keep: true });
    expect(s.status).toBe('playing');
    expect(s.turn).toMatchObject({ number: 1, active: 'corp', phase: 'action' });
    expect(s.players.corp.clicks).toBe(3);
    expect(zone(s, Z.hq)).toHaveLength(6);
    expect(s.pending).toEqual({ player: 'corp', kind: 'action' });
  });

  it('a mulligan puts the hand back, reshuffles and draws 5 new cards', () => {
    let s = newGame();
    const before = [...zone(s, Z.hq)].map((id) => obj(s, id).cardId);
    s = play(s, 'mulligan', { player: 'corp', keep: false });
    expect(zone(s, Z.hq)).toHaveLength(5);
    expect(zone(s, Z.rd)).toHaveLength(17);
    expect(s.players.corp.mulliganDone).toBe(true);
    expect(before.length).toBe(5);
  });

  it('is deterministic for a given seed', () => {
    const a = newGame(42);
    const b = newGame(42);
    const c = newGame(43);
    expect(b).toEqual(a);
    expect(cardsIn(c, Z.rd)).not.toEqual(cardsIn(a, Z.rd));
  });
});

describe('apply', () => {
  it('rejects illegal commands and never mutates the input state', () => {
    const s = scenario({ corp: { clicks: 0, hand: ['op-0'] } });
    const snapshot = structuredClone(s);
    const r = apply(s, { type: 'gainCredit', player: 'corp' }, CAT);
    expect(r.ok).toBe(false);
    const ok = apply(scenario(), { type: 'gainCredit', player: 'corp' }, CAT);
    expect(ok.ok).toBe(true);
    expect(s).toEqual(snapshot);
  });

  it('does not let the other player act', () => {
    const s = scenario({});
    const r = apply(s, { type: 'gainCredit', player: 'runner' }, CAT);
    expect(r.ok).toBe(false);
  });
});

describe('basic actions and turn structure', () => {
  it('credit and draw cost one click each', () => {
    let s = scenario({ corp: { deck: ['op-0', 'op-2'] } });
    s = play(s, 'gainCredit');
    s = play(s, 'drawCard');
    expect(s.players.corp.credits).toBe(6);
    expect(s.players.corp.clicks).toBe(1);
    expect(cardsIn(s, Z.hq)).toEqual(['op-0']);
  });

  it('the turn passes to the Runner after the last click, who has 4 clicks and does not draw', () => {
    let s = scenario({ corp: { deck: ['op-0'] }, runner: { deck: ['event-0'] } });
    s = play(s, 'gainCredit');
    s = play(s, 'gainCredit');
    expect(s.turn).toMatchObject({ active: 'corp', phase: 'action' });
    s = play(s, 'gainCredit');
    expect(s.turn).toMatchObject({ number: 2, active: 'runner' });
    expect(s.players.runner.clicks).toBe(4);
    expect(zone(s, Z.grip)).toHaveLength(0);
    expect(s.pending).toEqual({ player: 'runner', kind: 'action' });
  });

  it('the Corp draws at the start of its turn', () => {
    let s = scenario({ active: 'runner', corp: { deck: ['op-0'] } });
    s = play(s, 'endTurn');
    expect(s.turn.active).toBe('corp');
    expect(cardsIn(s, Z.hq)).toEqual(['op-0']);
    expect(s.players.corp.clicks).toBe(3);
  });

  it('forces a discard down to 5 cards and Corp discards go to Archives facedown', () => {
    let s = scenario({ corp: { hand: filler('op-0', 7) } });
    s = play(s, 'endTurn');
    expect(s.pending).toEqual({ player: 'corp', kind: 'discard' });
    s = play(s, 'discard');
    expect(s.pending).toEqual({ player: 'corp', kind: 'discard' });
    s = play(s, 'discard');
    expect(s.turn.active).toBe('runner');
    expect(zone(s, Z.hq)).toHaveLength(5);
    expect(zone(s, Z.archives).map((id) => obj(s, id).faceUp)).toEqual([false, false]);
  });

  it('with no clicks and nothing to score the action phase ends by itself', () => {
    let s = scenario({ corp: { clicks: 1 } });
    s = play(s, 'gainCredit');
    expect(s.turn.active).toBe('runner');
  });

  it('with no clicks left the Corp still gets to score before the turn ends', () => {
    const s = scenario({
      corp: { clicks: 0, servers: { remote1: { root: [{ cardId: 'agenda-3-2', advancement: 3 }] } } },
    });
    expect(s.turn.active).toBe('corp');
    expect(findCommand(s, { type: 'score' })).toBeDefined();
  });
});

describe('Corp: install, advance, score', () => {
  it('installs an agenda in a new remote server facedown at no cost', () => {
    let s = scenario({ corp: { hand: ['agenda-3-2'] } });
    s = play(s, 'install', { card: 'agenda-3-2', server: 'new' });
    expect(cardsIn(s, Z.root('remote1'))).toEqual(['agenda-3-2']);
    expect(obj(s, zone(s, Z.root('remote1'))[0]).faceUp).toBe(false);
    expect(s.players.corp.credits).toBe(5);
    expect(s.players.corp.clicks).toBe(2);
  });

  it('cannot install agendas or assets in a central server', () => {
    const s = scenario({ corp: { hand: ['agenda-3-2', 'asset-t3'] } });
    const targets = legalCommands(s, CAT)
      .filter((c) => c.type === 'install')
      .map((c) => (c as { server?: string }).server);
    expect(targets).toEqual(['new', 'new']);
  });

  it('can install an upgrade in a central server', () => {
    let s = scenario({ corp: { hand: ['upgrade-t2'] } });
    s = play(s, 'install', { card: 'upgrade-t2', server: 'hq' });
    expect(cardsIn(s, Z.root('hq'))).toEqual(['upgrade-t2']);
  });

  it('a new agenda/asset replaces the one already in that server (trash like cards)', () => {
    let s = scenario({
      corp: { hand: ['asset-t3'], servers: { remote1: { root: ['agenda-3-2'] } } },
    });
    s = play(s, 'install', { card: 'asset-t3', server: 'remote1' });
    expect(cardsIn(s, Z.root('remote1'))).toEqual(['asset-t3']);
    expect(cardsIn(s, Z.archives)).toEqual(['agenda-3-2']);
    expect(obj(s, zone(s, Z.archives)[0]).faceUp).toBe(false);
  });

  it('installing ice costs 1 credit per ice already protecting the server, outermost first', () => {
    let s = scenario({
      corp: { hand: ['ice-a'], servers: { hq: { ice: ['ice-b', 'ice-b'] } } },
    });
    s = play(s, 'install', { card: 'ice-a', server: 'hq' });
    expect(s.players.corp.credits).toBe(3);
    expect(cardsIn(s, Z.ice('hq'))).toEqual(['ice-a', 'ice-b', 'ice-b']);
  });

  it('cannot afford ice on a server with more ice than credits, but a new server is free', () => {
    const s = scenario({
      corp: { credits: 1, hand: ['ice-a'], servers: { hq: { ice: ['ice-b', 'ice-b'] } } },
    });
    const dest = legalCommands(s, CAT)
      .filter((c) => c.type === 'install')
      .map((c) => (c as { server?: string }).server);
    expect(dest).toContain('new');
    expect(dest).not.toContain('hq');
  });

  it('advances a card for 1 click and 1 credit, and scores an agenda at its requirement', () => {
    let s = scenario({
      corp: { servers: { remote1: { root: [{ cardId: 'agenda-3-2', advancement: 2 }] } } },
    });
    expect(findCommand(s, { type: 'score' })).toBeUndefined();
    s = play(s, 'advance', { card: 'agenda-3-2' });
    expect(s.players.corp.credits).toBe(4);
    s = play(s, 'score', { card: 'agenda-3-2' });
    expect(cardsIn(s, Z.corpScore)).toEqual(['agenda-3-2']);
    expect(agendaPoints(s, CAT, 'corp')).toBe(2);
    expect(zone(s, Z.root('remote1'))).toHaveLength(0);
    expect(obj(s, zone(s, Z.corpScore)[0]).counters.advancement).toBe(0);
  });

  it('plays an operation: pays its cost and trashes it', () => {
    let s = scenario({ corp: { hand: ['op-2'] } });
    s = play(s, 'play', { card: 'op-2' });
    expect(s.players.corp.credits).toBe(3);
    expect(cardsIn(s, Z.archives)).toEqual(['op-2']);
    expect(s.players.corp.clicks).toBe(2);
  });

  it('cannot play an operation it cannot afford', () => {
    const s = scenario({ corp: { credits: 1, hand: ['op-2'] } });
    expect(findCommand(s, { type: 'play' })).toBeUndefined();
  });

  it('wins with 7 agenda points', () => {
    let s = scenario({
      corp: {
        score: ['agenda-3-2', 'agenda-4-3'],
        servers: { remote1: { root: [{ cardId: 'agenda-3-2', advancement: 3 }] } },
      },
    });
    s = play(s, 'score', { card: 'agenda-3-2' });
    expect(s.status).toBe('ended');
    expect(s.winner).toBe('corp');
    expect(s.winReason).toBe('agenda');
  });

  it('trashes a resource only if the Runner is tagged, paying 2 credits', () => {
    const untagged = scenario({ runner: { rig: ['res'] } });
    expect(findCommand(untagged, { type: 'trashResource' })).toBeUndefined();
    let s = scenario({ runner: { tags: 1, rig: ['res'] } });
    s = play(s, 'trashResource', { card: 'res' });
    expect(s.players.corp.credits).toBe(3);
    expect(cardsIn(s, Z.heap)).toEqual(['res']);
  });

  it('purge costs 3 clicks and removes virus counters', () => {
    let s = scenario({ runner: { rig: ['prog-1'] } });
    obj(s, zone(s, Z.rig)[0]).counters.virus = 3;
    s = play(s, 'purge');
    expect(obj(s, zone(s, Z.rig)[0]).counters.virus).toBe(0);
    expect(s.turn.active).toBe('runner');
  });
});

describe('Runner: install, events, tags, memory', () => {
  it('installs a program faceup paying its cost', () => {
    let s = scenario({ active: 'runner', runner: { hand: ['prog-1'] } });
    s = play(s, 'install', { card: 'prog-1' });
    expect(cardsIn(s, Z.rig)).toEqual(['prog-1']);
    expect(s.players.runner.credits).toBe(4);
    expect(memoryUsed(s, CAT)).toBe(1);
  });

  it('exceeding memory forces trashing programs until it fits', () => {
    let s = scenario({ active: 'runner', runner: { rig: ['prog-2', 'prog-1'], hand: ['prog-3'] } });
    s = play(s, 'install', { card: 'prog-3' });
    expect(s.pending).toEqual({ player: 'runner', kind: 'memory' });
    expect(memoryUsed(s, CAT)).toBe(6);
    s = play(s, 'trashProgram', { card: 'prog-2' });
    expect(s.pending).toEqual({ player: 'runner', kind: 'action' });
    expect(cardsIn(s, Z.heap)).toEqual(['prog-2']);
  });

  it('plays an event and removes a tag for 1 click and 2 credits', () => {
    let s = scenario({ active: 'runner', runner: { tags: 2, hand: ['event-1'] } });
    s = play(s, 'play', { card: 'event-1' });
    expect(cardsIn(s, Z.heap)).toEqual(['event-1']);
    s = play(s, 'removeTag');
    expect(s.players.runner.tags).toBe(1);
    expect(s.players.runner.credits).toBe(2);
  });
});

describe('runs and breach', () => {
  it('a run on an empty server lets the Runner jack out before approaching the server', () => {
    let s = scenario({ active: 'runner', corp: { deck: ['op-0'] } });
    s = play(s, 'run', { server: 'hq' });
    expect(s.pending).toEqual({ player: 'runner', kind: 'movement' });
    expect(s.players.runner.clicks).toBe(3);
    s = play(s, 'jackOut');
    expect(s.run).toBeNull();
    expect(s.pending).toEqual({ player: 'runner', kind: 'action' });
  });

  it('only existing servers can be run on', () => {
    const s = scenario({ active: 'runner', corp: { servers: { remote2: { root: ['asset-t3'] } } } });
    const servers = legalCommands(s, CAT)
      .filter((c) => c.type === 'run')
      .map((c) => (c as { server: string }).server);
    expect(servers).toEqual(['hq', 'rd', 'archives', 'remote2']);
  });

  it('a successful run on R&D accesses the top card and steals an agenda', () => {
    let s = scenario({ active: 'runner', corp: { deck: ['agenda-3-2', 'op-0'] } });
    s = play(s, 'run', { server: 'rd' });
    s = play(s, 'continue');
    expect(s.run).toBeNull();
    expect(cardsIn(s, Z.runnerScore)).toEqual(['agenda-3-2']);
    expect(cardsIn(s, Z.rd)).toEqual(['op-0']);
    expect(agendaPoints(s, CAT, 'runner')).toBe(2);
  });

  it('an accessed non-agenda card without a trash cost is not stolen and stays', () => {
    let s = scenario({ active: 'runner', corp: { deck: ['op-0'] } });
    s = play(s, 'run', { server: 'rd' });
    s = play(s, 'continue');
    expect(cardsIn(s, Z.rd)).toEqual(['op-0']);
    expect(s.pending).toEqual({ player: 'runner', kind: 'action' });
  });

  it('accessing 2 cards in R&D with extra access goes down the deck', () => {
    let s = scenario({
      active: 'runner',
      runner: { extraAccess: 1 },
      corp: { deck: ['op-0', 'agenda-3-2', 'agenda-4-3'] },
    });
    s = play(s, 'run', { server: 'rd' });
    s = play(s, 'continue');
    expect(cardsIn(s, Z.runnerScore)).toEqual(['agenda-3-2']);
    expect(cardsIn(s, Z.rd)).toEqual(['op-0', 'agenda-4-3']);
  });

  it('a run on HQ accesses a random card from the hand', () => {
    let s = scenario({ active: 'runner', corp: { hand: ['agenda-3-2'] } });
    s = play(s, 'run', { server: 'hq' });
    s = play(s, 'continue');
    expect(cardsIn(s, Z.runnerScore)).toEqual(['agenda-3-2']);
    expect(zone(s, Z.hq)).toHaveLength(0);
  });

  it('offers the trash decision for an installed asset when the Runner can pay', () => {
    let s = scenario({
      active: 'runner',
      runner: { credits: 3 },
      corp: { credits: 0, servers: { remote1: { root: ['asset-t3'] } } },
    });
    s = play(s, 'run', { server: 'remote1' });
    s = play(s, 'continue');
    expect(s.pending).toEqual({ player: 'runner', kind: 'trash' });
    s = play(s, 'trash');
    expect(s.players.runner.credits).toBe(0);
    expect(cardsIn(s, Z.archives)).toEqual(['asset-t3']);
    expect(obj(s, zone(s, Z.archives)[0]).faceUp).toBe(true);
    expect(s.run).toBeNull();
  });

  it('declining leaves the asset installed; with too few credits there is no decision at all', () => {
    let s = scenario({
      active: 'runner',
      runner: { credits: 3 },
      corp: { credits: 0, servers: { remote1: { root: ['asset-t3'] } } },
    });
    s = play(s, 'run', { server: 'remote1' });
    s = play(s, 'continue');
    s = play(s, 'decline');
    expect(cardsIn(s, Z.root('remote1'))).toEqual(['asset-t3']);

    let poor = scenario({
      active: 'runner',
      runner: { credits: 2 },
      corp: { credits: 0, servers: { remote1: { root: ['asset-t3'] } } },
    });
    poor = play(poor, 'run', { server: 'remote1' });
    poor = play(poor, 'continue');
    expect(poor.run).toBeNull();
    expect(cardsIn(poor, Z.root('remote1'))).toEqual(['asset-t3']);
  });

  it('with several cards in the root the Runner chooses the order', () => {
    let s = scenario({
      active: 'runner',
      runner: { credits: 0 },
      corp: { credits: 0, servers: { remote1: { root: ['agenda-3-2', 'asset-t9'] } } },
    });
    s = play(s, 'run', { server: 'remote1' });
    s = play(s, 'continue');
    expect(s.pending).toEqual({ player: 'runner', kind: 'access' });
    s = play(s, 'access', { card: 'asset-t9' });
    expect(s.pending).toEqual({ player: 'runner', kind: 'action' });
    expect(cardsIn(s, Z.runnerScore)).toEqual(['agenda-3-2']);
  });

  it('R&D and root cards can be accessed in the Runner\'s chosen order', () => {
    let s = scenario({
      active: 'runner',
      corp: { credits: 0, deck: ['agenda-3-2'], servers: { rd: { root: ['upgrade-t2'] } } },
      runner: { credits: 0 },
    });
    s = play(s, 'run', { server: 'rd' });
    s = play(s, 'continue');
    expect(s.pending).toEqual({ player: 'runner', kind: 'access' });
    const options = legalCommands(s, CAT).filter((c) => c.type === 'access');
    expect(options).toHaveLength(2);
    s = play(s, 'access', { objectId: undefined });
    expect(cardsIn(s, Z.runnerScore)).toEqual(['agenda-3-2']);
  });

  it('breaching Archives turns its cards faceup and steals agendas there', () => {
    let s = scenario({ active: 'runner', corp: { discard: ['agenda-3-2'] } });
    expect(obj(s, zone(s, Z.archives)[0]).faceUp).toBe(false);
    s = play(s, 'run', { server: 'archives' });
    s = play(s, 'continue');
    expect(cardsIn(s, Z.runnerScore)).toEqual(['agenda-3-2']);
  });

  it('the Runner wins by stealing agendas up to 7 points', () => {
    let s = scenario({
      active: 'runner',
      runner: { score: ['agenda-3-2', 'agenda-3-2'] },
      corp: { deck: ['agenda-3-2'] },
    });
    s = play(s, 'run', { server: 'rd' });
    s = play(s, 'continue');
    expect(s.status).toBe('playing');
    s = scenario({
      active: 'runner',
      runner: { score: ['agenda-4-3', 'agenda-3-2'] },
      corp: { deck: ['agenda-3-2'] },
    });
    s = play(s, 'run', { server: 'rd' });
    s = play(s, 'continue');
    expect(s).toMatchObject({ status: 'ended', winner: 'runner', winReason: 'agenda' });
  });

  it('the bad publicity fund pays costs during the run only', () => {
    let s = scenario({
      active: 'runner',
      runner: { credits: 1 },
      corp: { credits: 0, badPublicity: 2, servers: { remote1: { root: ['asset-t3'] } } },
    });
    s = play(s, 'run', { server: 'remote1' });
    expect(s.players.runner.fund).toBe(2);
    s = play(s, 'continue');
    expect(s.pending).toEqual({ player: 'runner', kind: 'trash' });
    s = play(s, 'trash');
    expect(s.players.runner.fund).toBe(0);
    expect(s.players.runner.credits).toBe(0);
  });

  it('passes through unrezzed ice and lets the Runner jack out after each one', () => {
    let s = scenario({
      active: 'runner',
      corp: { credits: 0, deck: ['agenda-3-2'], servers: { rd: { ice: ['ice-a', 'ice-b'] } } },
    });
    s = play(s, 'run', { server: 'rd' });
    expect(s.run).toMatchObject({ phase: 'movement', position: 0, passedIce: true });
    s = play(s, 'continue');
    expect(s.run).toMatchObject({ phase: 'movement', position: 1, passedIce: true });
    s = play(s, 'continue');
    expect(s.run).toBeNull();
    expect(cardsIn(s, Z.runnerScore)).toEqual(['agenda-3-2']);
  });

  it('jacking out after ice ends the run unsuccessfully with no breach', () => {
    let s = scenario({
      active: 'runner',
      corp: { credits: 0, deck: ['agenda-3-2'], servers: { rd: { ice: ['ice-a'] } } },
    });
    s = play(s, 'run', { server: 'rd' });
    s = play(s, 'jackOut');
    expect(s.run).toBeNull();
    expect(cardsIn(s, Z.runnerScore)).toEqual([]);
  });

  it('emits events for the run', () => {
    const s = scenario({ active: 'runner', corp: { deck: ['op-0'] } });
    const a = apply(s, { type: 'run', player: 'runner', server: 'rd' }, CAT);
    if (!a.ok) throw new Error(a.error);
    const b = apply(a.state, { type: 'continue', player: 'runner' }, CAT);
    if (!b.ok) throw new Error(b.error);
    const types = [...a.events, ...b.events].map((e: GameEvent) => e.type);
    expect(types).toEqual(['runBegins', 'runSuccessful', 'breach', 'access', 'runEnds']);
  });
});

describe('damage and end of game', () => {
  it('meat damage trashes random cards from the grip', () => {
    const s = scenario({ runner: { hand: filler('event-0', 4) } });
    const r = mutate(s, CAT, (d, ev) => dealDamage(d, 'meat', 2, ev));
    expect(zone(r.state, Z.grip)).toHaveLength(2);
    expect(zone(r.state, Z.heap)).toHaveLength(2);
    expect(r.state.status).toBe('playing');
  });

  it('damage greater than the grip flatlines the Runner', () => {
    const s = scenario({ runner: { hand: filler('event-0', 2) } });
    const r = mutate(s, CAT, (d, ev) => dealDamage(d, 'net', 3, ev));
    expect(r.state).toMatchObject({ status: 'ended', winner: 'corp', winReason: 'flatline' });
  });

  it('damage equal to the grip does not flatline', () => {
    const s = scenario({ runner: { hand: filler('event-0', 2) } });
    const r = mutate(s, CAT, (d, ev) => dealDamage(d, 'net', 2, ev));
    expect(r.state.status).toBe('playing');
  });

  it('core damage lowers the maximum hand size', () => {
    const s = scenario({ runner: { hand: filler('event-0', 3) } });
    const r = mutate(s, CAT, (d, ev) => dealDamage(d, 'core', 1, ev));
    expect(r.state.players.runner.handSizeMod).toBe(-1);
  });

  it('a Runner with maximum hand size below 0 at the discard phase is flatlined', () => {
    let s = scenario({ active: 'runner', runner: { handSizeMod: -6 } });
    s = play(s, 'endTurn');
    expect(s).toMatchObject({ status: 'ended', winner: 'corp', winReason: 'flatline' });
  });

  it('the Corp loses when it must draw from an empty R&D', () => {
    let s = scenario({ corp: { deck: [] } });
    s = play(s, 'drawCard');
    expect(s).toMatchObject({ status: 'ended', winner: 'runner', winReason: 'decked' });
  });

  it('an empty stack does not lose the game for the Runner', () => {
    let s = scenario({ active: 'runner', runner: { deck: ['event-0'] } });
    s = play(s, 'drawCard');
    expect(s.status).toBe('playing');
  });

  it('commands are refused after the game ends', () => {
    let s = scenario({ corp: { deck: [] } });
    s = play(s, 'drawCard');
    expect(apply(s, { type: 'gainCredit', player: 'corp' }, CAT).ok).toBe(false);
    expect(legalCommands(s, CAT)).toEqual([]);
  });
});

describe('objects', () => {
  it('a card that changes zone becomes a new object and loses its counters', () => {
    let s = scenario({
      corp: { hand: ['agenda-3-2'] },
    });
    const first = zone(s, Z.hq)[0];
    s = play(s, 'install', { card: 'agenda-3-2', server: 'new' });
    const installed = zone(s, Z.root('remote1'))[0];
    expect(installed).not.toBe(first);
    expect(s.objects[first]).toBeUndefined();
  });
});
