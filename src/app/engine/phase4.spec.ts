import { describe, expect, it } from 'vitest';
import { handLimit, legalCommands, memoryLimit, strengthOf } from './engine';
import {
  TEST_CATALOG as CAT,
  Setup,
  cardsIn,
  choose,
  findCommand,
  idOf,
  play,
  scenario,
  withState,
} from './testing';
import { GameState } from './types';
import { Z, obj, zone } from './zones';

const filler = (card: string, n: number) => Array.from({ length: n }, () => card);
const ops = (n: number) => filler('op-0', n);
const evs = (n: number) => filler('event-0', n);

/** The active player ends the turn; with a short hand the discard phase passes by itself. */
const endTurn = (s: GameState) => play(s, 'endTurn');
/** From the Runner's turn: the Corp plays and ends its turn, and the Runner's next turn begins. */
const toNextRunnerTurn = (s: GameState) => endTurn(endTurn(s));

const runner = (extra: Setup['runner'] = {}): Setup['runner'] => ({ credits: 5, deck: evs(8), ...extra });
const corp = (extra: Setup['corp'] = {}): Setup['corp'] => ({ credits: 9, deck: ops(10), ...extra });

const counters = (s: GameState, zoneKey: string, cardId: string) =>
  obj(s, idOf(s, zoneKey, cardId)).counters;

describe('virus programs and hosting', () => {
  it('Botulus can only be installed on ice, hosted on it, with a virus counter', () => {
    const base = scenario({
      active: 'runner',
      runner: runner({ hand: ['botulus'] }),
      corp: corp({ servers: { rd: { ice: ['barrier-2'] } } }),
    });
    expect(findCommand(base, { type: 'install', card: 'botulus' })).toBeDefined();
    const ice = idOf(base, Z.ice('rd'), 'barrier-2');
    let s = play(base, 'install', { card: 'botulus', host: ice });
    expect(obj(s, idOf(s, Z.rig, 'botulus')).host).toBe(ice);
    expect(counters(s, Z.rig, 'botulus').virus).toBe(1);
    s = toNextRunnerTurn(s);
    expect(counters(s, Z.rig, 'botulus').virus).toBe(2);
  });

  it('Botulus has no install option without ice', () => {
    const s = scenario({ active: 'runner', runner: runner({ hand: ['botulus'] }), corp: corp() });
    expect(findCommand(s, { type: 'install' })).toBeUndefined();
  });

  it('Botulus breaks a subroutine of its host ice by removing a hosted virus counter', () => {
    let s = scenario({
      active: 'runner',
      runner: runner({ hand: ['botulus', 'event-0'] }),
      corp: corp({ servers: { rd: { ice: ['barrier-2'] } } }),
    });
    s = play(s, 'install', { card: 'botulus', host: idOf(s, Z.ice('rd'), 'barrier-2') });
    s = play(play(s, 'run', { server: 'rd' }), 'rez', { card: 'barrier-2' });
    s = play(s, 'break', { card: 'botulus', subroutines: [0] });
    expect(counters(s, Z.rig, 'botulus').virus).toBe(0);
    expect(s.players.runner.credits).toBe(3); // the break itself cost no credits
    expect(findCommand(s, { type: 'break', card: 'botulus' })).toBeUndefined(); // no counters left
  });

  it('a hosted program is trashed when its host ice leaves', () => {
    let s = scenario({
      active: 'runner',
      runner: runner({ hand: ['botulus'] }),
      corp: corp({ servers: { rd: { ice: ['barrier-2'] } } }),
    });
    s = play(s, 'install', { card: 'botulus', host: idOf(s, Z.ice('rd'), 'barrier-2') });
    s = withState(s, (d) => {
      const ice = idOf(d, Z.ice('rd'), 'barrier-2');
      d.zones[Z.ice('rd')] = [];
      delete d.objects[ice];
    });
    expect(cardsIn(s, Z.rig)).toEqual([]);
    expect(cardsIn(s, Z.heap)).toEqual(['botulus']);
  });

  it('Tranquilizer derezzes its host at 3 hosted virus counters', () => {
    let s = scenario({
      active: 'runner',
      runner: runner({ hand: ['tranquilizer'] }),
      corp: corp({ servers: { rd: { ice: [{ cardId: 'barrier-2', faceUp: true }] } } }),
    });
    s = play(s, 'install', { card: 'tranquilizer', host: idOf(s, Z.ice('rd'), 'barrier-2') });
    expect(obj(s, idOf(s, Z.ice('rd'), 'barrier-2')).faceUp).toBe(true);
    s = toNextRunnerTurn(s); // 2 counters
    expect(obj(s, idOf(s, Z.ice('rd'), 'barrier-2')).faceUp).toBe(true);
    s = toNextRunnerTurn(s); // 3 counters
    expect(obj(s, idOf(s, Z.ice('rd'), 'barrier-2')).faceUp).toBe(false);
  });

  it('Fermenter: a virus counter on install and each turn; click + trash: 2 credits per counter', () => {
    let s = scenario({ active: 'runner', runner: runner({ hand: ['fermenter'] }), corp: corp() });
    s = play(s, 'install', { card: 'fermenter' });
    s = toNextRunnerTurn(s);
    expect(counters(s, Z.rig, 'fermenter').virus).toBe(2);
    const before = s.players.runner.credits;
    s = play(s, 'useAbility', { card: 'fermenter' });
    expect(s.players.runner.credits).toBe(before + 4);
    expect(cardsIn(s, Z.heap)).toEqual(['fermenter']);
  });

  it('Leech: a counter on a successful run on a central server, and -1 strength to the ice', () => {
    let s = scenario({
      active: 'runner',
      runner: runner({ rig: ['leech', 'fracter'] }),
      corp: corp({ deck: ['agenda-3-2'], servers: { rd: { ice: ['barrier-2'] }, hq: {} } }),
    });
    // a run on HQ with no ice succeeds
    s = play(s, 'run', { server: 'hq' });
    s = play(s, 'continue');
    expect(counters(s, Z.rig, 'leech').virus).toBe(1);
    s = play(play(s, 'run', { server: 'rd' }), 'rez', { card: 'barrier-2' });
    // fracter (strength 1) cannot break the 2-strength barrier...
    expect(findCommand(s, { type: 'break' })).toBeUndefined();
    s = play(s, 'useAbility', { card: 'leech' });
    expect(strengthOf(s, CAT, idOf(s, Z.ice('rd'), 'barrier-2'))).toBe(1);
    // ...but can after Leech
    expect(findCommand(s, { type: 'break', card: 'fracter' })).toBeDefined();
    expect(counters(s, Z.rig, 'leech').virus).toBe(0);
  });

  it('Cookbook: may place a virus counter on each virus program installed', () => {
    let s = scenario({
      active: 'runner',
      runner: runner({ hand: ['fermenter'], rig: ['cookbook'] }),
      corp: corp(),
    });
    s = play(s, 'install', { card: 'fermenter' });
    expect(s.pending).toEqual({ player: 'runner', kind: 'choice' });
    s = choose(s, 'yes');
    expect(counters(s, Z.rig, 'fermenter').virus).toBe(2);
  });

  it('Conduit: click to run R&D and access cards equal to its virus counters', () => {
    let s = scenario({
      active: 'runner',
      runner: runner({ rig: ['conduit'] }),
      corp: corp({ deck: ['op-0', 'op-0', 'agenda-3-2'] }),
    });
    s = withState(s, (d) => {
      obj(d, idOf(d, Z.rig, 'conduit')).counters.virus = 2;
    });
    s = play(s, 'useAbility', { card: 'conduit' });
    s = play(s, 'continue');
    // 1 + 2 accesses: the agenda in third position is stolen
    expect(cardsIn(s, Z.runnerScore)).toEqual(['agenda-3-2']);
    // successful run on R&D ended: may place a virus counter
    expect(s.pending).toEqual({ player: 'runner', kind: 'choice' });
    s = choose(s, 'yes');
    expect(counters(s, Z.rig, 'conduit').virus).toBe(3);
  });
});

describe('icebreakers with dynamic strength', () => {
  it('Echelon gets +1 strength for each installed icebreaker (including itself)', () => {
    const s = scenario({
      active: 'runner',
      runner: runner({ rig: ['echelon', 'cleaver', 'buzzsaw'] }),
      corp: corp(),
    });
    expect(strengthOf(s, CAT, idOf(s, Z.rig, 'echelon'))).toBe(3);
  });

  it('Unity boosts by the number of installed icebreakers', () => {
    let s = scenario({
      active: 'runner',
      runner: runner({ rig: ['unity', 'fracter'], credits: 9 }),
      corp: corp({ deck: ['agenda-3-2'], servers: { rd: { ice: ['gate-1', 'barrier-2'] } } }),
    });
    s = play(play(s, 'run', { server: 'rd' }), 'rez', { card: 'gate-1' });
    expect(findCommand(s, { type: 'break', card: 'unity' })).toBeDefined(); // 1 vs 1
    s = play(s, 'break', { card: 'unity', subroutines: [0] });
    s = play(s, 'continue');
    s = play(s, 'rez', { card: 'barrier-2' });
    // barrier: unity cannot break it (code gate only)
    expect(findCommand(s, { type: 'break', card: 'unity' })).toBeUndefined();
  });

  it('Mayfly breaks any subroutine and is trashed when the run ends', () => {
    let s = scenario({
      active: 'runner',
      runner: runner({ rig: ['mayfly'] }),
      corp: corp({ deck: ['agenda-3-2'], servers: { rd: { ice: ['gate-1'] } } }),
    });
    s = play(play(s, 'run', { server: 'rd' }), 'rez', { card: 'gate-1' });
    s = play(s, 'break', { card: 'mayfly', subroutines: [0] });
    expect(cardsIn(s, Z.rig)).toEqual(['mayfly']);
    s = play(s, 'continue');
    expect(s.run).toBeNull();
    expect(cardsIn(s, Z.rig)).toEqual([]);
    expect(cardsIn(s, Z.heap)).toEqual(['mayfly']);
  });
});

describe('resources', () => {
  it('Telework Contract loads 9 credits; once per turn take 3; trashed when empty', () => {
    let s = scenario({ active: 'runner', runner: runner({ hand: ['telework_contract'] }), corp: corp() });
    s = play(s, 'install', { card: 'telework_contract' });
    expect(counters(s, Z.rig, 'telework_contract').credit).toBe(9);
    s = play(s, 'useAbility', { card: 'telework_contract' });
    expect(s.players.runner.credits).toBe(4 + 3);
    expect(findCommand(s, { type: 'useAbility' })).toBeUndefined(); // once per turn
    s = withState(s, (d) => {
      obj(d, idOf(d, Z.rig, 'telework_contract')).counters.credit = 3;
    });
    s = toNextRunnerTurn(s);
    s = play(s, 'useAbility', { card: 'telework_contract' });
    expect(cardsIn(s, Z.rig)).toEqual([]);
    expect(cardsIn(s, Z.heap)).toEqual(['telework_contract']);
  });

  it('Smartware Distributor: click to place 3 credits, take 1 at the start of each turn', () => {
    let s = scenario({ active: 'runner', runner: runner({ rig: ['smartware_distributor'] }), corp: corp() });
    s = play(s, 'useAbility', { card: 'smartware_distributor' });
    expect(counters(s, Z.rig, 'smartware_distributor').credit).toBe(3);
    s = toNextRunnerTurn(s);
    expect(counters(s, Z.rig, 'smartware_distributor').credit).toBe(2);
    expect(s.players.runner.credits).toBe(6);
  });

  it('Verbal Plasticity: the first basic draw each turn draws 2', () => {
    let s = scenario({ active: 'runner', runner: runner({ rig: ['verbal_plasticity'] }), corp: corp() });
    s = play(s, 'drawCard');
    expect(zone(s, Z.grip)).toHaveLength(2);
    s = play(s, 'drawCard');
    expect(zone(s, Z.grip)).toHaveLength(3);
  });

  it('Red Team: loads 12; click to run a central server not yet run; takes 3 on success', () => {
    let s = scenario({ active: 'runner', runner: runner({ hand: ['red_team'], credits: 9 }), corp: corp() });
    s = play(s, 'install', { card: 'red_team' });
    expect(counters(s, Z.rig, 'red_team').credit).toBe(12);
    s = play(s, 'useAbility', { card: 'red_team' });
    s = choose(s, 'hq');
    s = play(s, 'continue');
    expect(counters(s, Z.rig, 'red_team').credit).toBe(9);
    expect(s.players.runner.credits).toBe(4 + 3);
    // HQ was run: only R&D and Archives remain
    s = play(s, 'useAbility', { card: 'red_team' });
    expect(legalCommands(s, CAT).filter((c) => c.type === 'choose')).toHaveLength(2);
  });
});

describe('run events', () => {
  it('Tread Lightly: the rez cost of ice is +3 during the run', () => {
    let s = scenario({
      active: 'runner',
      runner: runner({ hand: ['tread_lightly'] }),
      corp: corp({ credits: 5, deck: ['agenda-3-2'], servers: { rd: { ice: ['barrier-2'] } } }),
    });
    s = play(s, 'play', { card: 'tread_lightly' });
    s = choose(s, 'rd');
    // barrier-2 costs 3 (+3 = 6) and the Corp has 5: no window at all
    expect(s.pending).toEqual({ player: 'runner', kind: 'movement' });
  });

  it('Jailbreak: draw 1 and access 1 additional card when the run on R&D succeeds', () => {
    let s = scenario({
      active: 'runner',
      runner: runner({ hand: ['jailbreak'] }),
      corp: corp({ deck: ['op-0', 'agenda-3-2', 'op-0'] }),
    });
    s = play(s, 'play', { card: 'jailbreak' });
    s = choose(s, 'rd');
    s = play(s, 'continue');
    expect(zone(s, Z.grip)).toHaveLength(1);
    expect(cardsIn(s, Z.runnerScore)).toEqual(['agenda-3-2']);
  });

  it('Overclock: 5 credits usable only during the run', () => {
    let s = scenario({
      active: 'runner',
      runner: runner({ hand: ['overclock'], credits: 3 }),
      corp: corp({ credits: 0, servers: { remote1: { root: ['asset-t9'] } } }),
    });
    s = play(s, 'play', { card: 'overclock' }); // costs 1
    s = choose(s, 'remote1');
    expect(s.players.runner.fund).toBe(5);
    s = play(s, 'continue');
    // trash cost 9 > 2 credits + 5 fund
    expect(s.run).toBeNull();
    expect(s.players.runner.fund).toBe(0);
  });
});

describe('hardware', () => {
  it('Carnivore: once per turn, trash 2 cards from the grip to trash the accessed card', () => {
    let s = scenario({
      active: 'runner',
      runner: runner({ credits: 0, rig: ['carnivore'], hand: evs(3) }),
      corp: corp({ credits: 0, servers: { remote1: { root: ['asset-t9'] } } }),
    });
    s = play(play(s, 'run', { server: 'remote1' }), 'continue');
    expect(s.pending).toEqual({ player: 'runner', kind: 'trash' });
    expect(findCommand(s, { type: 'trash' })).toBeUndefined(); // cannot pay 9
    s = play(s, 'useAbility', { card: 'carnivore' });
    s = choose(s);
    s = choose(s);
    expect(cardsIn(s, Z.archives)).toEqual(['asset-t9']);
    expect(zone(s, Z.grip)).toHaveLength(1);
    expect(memoryLimit(s, CAT)).toBe(5);
  });

  it('Carnivore also trashes cards with no trash cost, like an accessed operation', () => {
    let s = scenario({
      active: 'runner',
      runner: runner({ rig: ['carnivore'], hand: evs(2) }),
      corp: corp({ deck: ['op-0'] }),
    });
    s = play(play(s, 'run', { server: 'rd' }), 'continue');
    expect(s.pending).toEqual({ player: 'runner', kind: 'trash' });
    s = play(s, 'decline');
    expect(cardsIn(s, Z.rd)).toEqual(['op-0']);
  });

  it('Docklands Pass: the first HQ breach each turn accesses 1 additional card', () => {
    let s = scenario({
      active: 'runner',
      runner: runner({ rig: ['docklands_pass'] }),
      corp: corp({ hand: ['agenda-3-2', 'agenda-4-3', 'agenda-5-4'] }),
    });
    s = play(play(s, 'run', { server: 'hq' }), 'continue');
    expect(cardsIn(s, Z.runnerScore)).toHaveLength(2);
    s = play(play(s, 'run', { server: 'hq' }), 'continue');
    expect(cardsIn(s, Z.runnerScore)).toHaveLength(3); // the second breach accesses only 1
  });

  it('Pennyshaver: collects a credit per successful run and takes them with a click', () => {
    let s = scenario({
      active: 'runner',
      runner: runner({ rig: ['pennyshaver'] }),
      corp: corp({ deck: ['op-0'] }),
    });
    s = play(play(s, 'run', { server: 'rd' }), 'continue');
    expect(counters(s, Z.rig, 'pennyshaver').credit).toBe(1);
    s = play(s, 'useAbility', { card: 'pennyshaver' });
    expect(s.players.runner.credits).toBe(5 + 2);
    expect(counters(s, Z.rig, 'pennyshaver').credit).toBe(0);
    expect(memoryLimit(s, CAT)).toBe(5);
  });

  it('only one console: installing a new one trashes the old', () => {
    let s = scenario({
      active: 'runner',
      runner: runner({ credits: 9, rig: ['pennyshaver'], hand: ['carnivore'] }),
      corp: corp(),
    });
    s = play(s, 'install', { card: 'carnivore' });
    expect(cardsIn(s, Z.rig)).toEqual(['carnivore']);
    expect(cardsIn(s, Z.heap)).toEqual(['pennyshaver']);
    expect(memoryLimit(s, CAT)).toBe(5);
  });

  it('DZMZ Optimizer: the first program each turn costs 1 less', () => {
    let s = scenario({
      active: 'runner',
      runner: runner({ rig: ['dzmz_optimizer'], hand: ['cleaver', 'cleaver'], credits: 9 }),
      corp: corp(),
    });
    s = play(s, 'install', { card: 'cleaver' });
    expect(s.players.runner.credits).toBe(7);
    s = play(s, 'install', { card: 'cleaver' });
    expect(s.players.runner.credits).toBe(4);
  });

  it('Pantograph: when an agenda is stolen gain 1 and may install a card from the grip', () => {
    let s = scenario({
      active: 'runner',
      runner: runner({ rig: ['pantograph'], hand: ['hw'] }),
      corp: corp({ deck: ['agenda-3-2'] }),
    });
    s = play(play(s, 'run', { server: 'rd' }), 'continue');
    expect(s.players.runner.credits).toBe(5 + 1);
    expect(s.pending).toEqual({ player: 'runner', kind: 'choice' });
    s = choose(s, idOf(s, Z.grip, 'hw'));
    expect(cardsIn(s, Z.rig).sort()).toEqual(['hw', 'pantograph']);
    expect(s.players.runner.credits).toBe(6 - 1);
  });
});

describe('Runner identities', () => {
  it('René: first time each turn the Runner trashes an accessed card, gain 1 and draw 1', () => {
    let s = scenario({
      active: 'runner',
      runnerIdentity: 'rene_loup_arcemont_party_animal',
      runner: runner({ credits: 3 }),
      corp: corp({ credits: 0, servers: { remote1: { root: ['asset-t3', 'asset-t3'] } } }),
    });
    s = play(play(s, 'run', { server: 'remote1' }), 'continue');
    s = play(s, 'access', { card: 'asset-t3' });
    s = play(s, 'trash');
    expect(s.players.runner.credits).toBe(0 + 1);
    expect(zone(s, Z.grip)).toHaveLength(1);
  });

  it('Zahya: after a run on R&D ends, gain 1 credit per card accessed', () => {
    let s = scenario({
      active: 'runner',
      runnerIdentity: 'zahya_sadeghi_versatile_smuggler',
      runner: runner({ extraAccess: 1 }),
      corp: corp({ deck: ['op-0', 'op-0', 'op-0'] }),
    });
    s = play(play(s, 'run', { server: 'rd' }), 'continue');
    expect(s.players.runner.credits).toBe(5 + 2);
  });

  it('Tao Salonga: when an agenda is stolen the Runner may swap 2 installed ice', () => {
    let s = scenario({
      active: 'runner',
      runnerIdentity: 'tao_salonga_telepresence_magician',
      runner: runner(),
      corp: corp({
        credits: 0,
        deck: ['agenda-3-2'],
        servers: { hq: { ice: ['ice-a'] }, archives: { ice: ['ice-b'] } },
      }),
    });
    s = play(play(s, 'run', { server: 'rd' }), 'continue');
    expect(s.pending).toEqual({ player: 'runner', kind: 'choice' });
    s = choose(s, idOf(s, Z.ice('hq'), 'ice-a')); // the only other ice is chosen automatically
    expect(cardsIn(s, Z.ice('hq'))).toEqual(['ice-b']);
    expect(cardsIn(s, Z.ice('archives'))).toEqual(['ice-a']);
  });
});

describe('Corp assets', () => {
  it('Nico Campaign: loads 9 when rezzed, takes 3 each turn, trashed and draws when empty', () => {
    let s = scenario({
      corp: corp({ credits: 5, servers: { remote1: { root: ['nico_campaign'] } } }),
      runner: runner(),
    });
    s = play(s, 'rez', { card: 'nico_campaign' });
    expect(counters(s, Z.root('remote1'), 'nico_campaign').credit).toBe(9);
    s = withState(s, (d) => {
      obj(d, idOf(d, Z.root('remote1'), 'nico_campaign')).counters.credit = 3;
    });
    const hand = zone(s, Z.hq).length;
    s = endTurn(s); // runner turn
    s = endTurn(s); // corp turn begins
    expect(cardsIn(s, Z.root('remote1'))).toEqual([]);
    expect(cardsIn(s, Z.archives)).toEqual(['nico_campaign']);
    expect(s.players.corp.credits).toBe(3 + 3);
    expect(zone(s, Z.hq).length).toBe(hand + 2); // turn draw + Nico's draw
  });

  it('Regolith Mining License: loads 15, click to take 3', () => {
    let s = scenario({
      corp: corp({ credits: 5, servers: { remote1: { root: ['regolith_mining_license'] } } }),
      runner: runner(),
    });
    s = play(s, 'rez', { card: 'regolith_mining_license' });
    expect(counters(s, Z.root('remote1'), 'regolith_mining_license').credit).toBe(15);
    s = play(s, 'useAbility', { card: 'regolith_mining_license' });
    expect(s.players.corp.credits).toBe(3 + 3);
  });

  it('Spin Doctor: draws 2 when rezzed; remove from the game to shuffle up to 2 from Archives', () => {
    let s = scenario({
      corp: corp({
        credits: 5,
        deck: ops(4),
        discard: ['hedge_fund', 'sprint'],
        servers: { remote1: { root: ['spin_doctor'] } },
      }),
      runner: runner(),
    });
    s = play(s, 'rez', { card: 'spin_doctor' });
    expect(zone(s, Z.hq)).toHaveLength(2);
    s = play(s, 'useAbility', { card: 'spin_doctor' });
    s = choose(s, idOf(s, Z.archives, 'hedge_fund'));
    s = choose(s, 'done');
    expect(cardsIn(s, Z.rd)).toContain('hedge_fund');
    expect(cardsIn(s, Z.archives)).toEqual(['sprint']);
    expect(zone(s, Z.root('remote1'))).toHaveLength(0);
    expect(cardsIn(s, Z.removed)).toEqual(['spin_doctor']);
  });

  it('Clearinghouse: at the start of the Corp turn may trash it for 1 meat damage per counter', () => {
    let s = scenario({
      active: 'runner',
      corp: corp({
        servers: { remote1: { root: [{ cardId: 'clearinghouse', advancement: 3, faceUp: true }] } },
      }),
      runner: runner({ hand: evs(5) }),
    });
    s = endTurn(s);
    expect(s.pending).toEqual({ player: 'corp', kind: 'choice' });
    s = choose(s, 'yes');
    expect(zone(s, Z.grip)).toHaveLength(2);
    expect(cardsIn(s, Z.archives)).toEqual(['clearinghouse']);
  });

  it('Urtica Cipher: when accessed, 2 net damage plus 1 per hosted advancement counter', () => {
    let s = scenario({
      active: 'runner',
      corp: corp({ credits: 0, servers: { remote1: { root: [{ cardId: 'urtica_cipher', advancement: 2 }] } } }),
      runner: runner({ hand: evs(6) }),
    });
    s = play(s, 'run', { server: 'remote1' });
    s = play(s, 'pass'); // initiation window: the Corp does not rez it
    s = play(s, 'continue');
    s = play(s, 'pass'); // approach the server
    expect(zone(s, Z.grip)).toHaveLength(2);
  });
});

describe('Corp upgrades', () => {
  it('Manegarm Skunkworks: the Runner spends 2 clicks, pays 5, or the run ends', () => {
    const make = (credits: number, clicks: number) => {
      const s = scenario({
        active: 'runner',
        corp: corp({
          credits: 0,
          servers: { remote1: { root: [{ cardId: 'asset-t3' }, { cardId: 'manegarm_skunkworks', faceUp: true }] } },
        }),
        runner: runner({ credits, clicks }),
      });
      return play(s, 'run', { server: 'remote1' });
    };
    const tough = make(0, 3);
    expect(tough.pending).toEqual({ player: 'runner', kind: 'movement' });
    const afterContinue = play(tough, 'continue');
    expect(afterContinue.players.runner.clicks).toBe(0); // 2 clicks spent (the only option)
    expect(afterContinue.pending).toEqual({ player: 'runner', kind: 'access' });
    const stopped = make(0, 1);
    const ended = play(stopped, 'continue');
    expect(ended.run).toBeNull();
    expect(ended.players.runner.credits).toBe(0);
  });

  it('Anoetic Void: the Corp may pay 2 and trash 2 cards from HQ to end the run', () => {
    let s = scenario({
      active: 'runner',
      corp: corp({
        credits: 2,
        hand: ops(3),
        servers: { remote1: { root: [{ cardId: 'anoetic_void', faceUp: true }] } },
      }),
      runner: runner(),
    });
    s = play(play(s, 'run', { server: 'remote1' }), 'continue');
    expect(s.pending).toEqual({ player: 'corp', kind: 'choice' });
    s = choose(s, 'yes');
    s = choose(s);
    s = choose(s);
    expect(s.run).toBeNull();
    expect(s.players.corp.credits).toBe(0);
    expect(zone(s, Z.hq)).toHaveLength(1);
  });

  it('Amaze Amusements: 2 tags when a run ends after the Runner stole an agenda, even if trashed', () => {
    let s = scenario({
      active: 'runner',
      corp: corp({
        credits: 0,
        servers: {
          remote1: { root: [{ cardId: 'agenda-3-2' }, { cardId: 'amaze_amusements', faceUp: true }] },
        },
      }),
      runner: runner({ credits: 3 }),
    });
    s = play(play(s, 'run', { server: 'remote1' }), 'continue');
    // trash Amaze first (it persists for this run), then steal the agenda
    s = play(s, 'access', { card: 'amaze_amusements' });
    s = play(s, 'trash');
    expect(cardsIn(s, Z.runnerScore)).toEqual(['agenda-3-2']);
    expect(s.players.runner.tags).toBe(2);
  });

  it('Malapert Data Vault: when an agenda is scored from this server, add a non-agenda card from R&D', () => {
    let s = scenario({
      corp: corp({
        deck: ['agenda-3-2', 'hedge_fund'],
        servers: {
          remote1: { root: [{ cardId: 'agenda-3-2', advancement: 3 }, { cardId: 'malapert_data_vault', faceUp: true }] },
        },
      }),
      runner: runner(),
    });
    s = play(s, 'score', { card: 'agenda-3-2' });
    s = choose(s, idOf(s, Z.rd, 'hedge_fund'));
    expect(cardsIn(s, Z.hq)).toEqual(['hedge_fund']);
  });
});

describe('Corp ice', () => {
  const run = (ice: string, extra: Setup = {}) =>
    play(
      scenario({
        active: 'runner',
        ...extra,
        runner: runner({ credits: 9, ...extra.runner }),
        corp: corp({ credits: 9, deck: ['agenda-3-2'], servers: { rd: { ice: [ice] } }, ...extra.corp }),
      }),
      'run',
      { server: 'rd' },
    );

  it('Ping: a tag when rezzed during a run against its server; end the run', () => {
    const s = play(run('ping'), 'rez', { card: 'ping' });
    expect(s.players.runner.tags).toBe(1);
    expect(s.run).toBeNull();
  });

  it('Palisade: +2 strength only on a remote server', () => {
    const remote = scenario({ corp: corp({ servers: { remote1: { ice: ['palisade'] } } }) });
    const central = scenario({ corp: corp({ servers: { hq: { ice: ['palisade'] } } }) });
    expect(strengthOf(remote, CAT, idOf(remote, Z.ice('remote1'), 'palisade'))).toBe(4);
    expect(strengthOf(central, CAT, idOf(central, Z.ice('hq'), 'palisade'))).toBe(2);
  });

  it('Pharos: +5 strength with 3 or more advancement counters', () => {
    const s = scenario({ corp: corp({ servers: { rd: { ice: [{ cardId: 'pharos', advancement: 3 }] } } }) });
    expect(strengthOf(s, CAT, idOf(s, Z.ice('rd'), 'pharos'))).toBe(10);
    const t = scenario({ corp: corp({ servers: { rd: { ice: [{ cardId: 'pharos', advancement: 2 }] } } }) });
    expect(strengthOf(t, CAT, idOf(t, Z.ice('rd'), 'pharos'))).toBe(5);
  });

  it('Funhouse: when encountered, the Runner takes a tag or the run ends', () => {
    let s = play(run('funhouse'), 'rez', { card: 'funhouse' });
    expect(s.pending).toEqual({ player: 'runner', kind: 'choice' });
    const tagged = choose(s, 'tag');
    expect(tagged.players.runner.tags).toBe(1);
    s = choose(s, 'end');
    expect(s.run).toBeNull();
  });

  it('Ansel 1.0: the Runner loses a click to break a subroutine; the third stops stealing', () => {
    let s = play(run('ansel_1_0'), 'rez', { card: 'ansel_1_0' });
    expect(findCommand(s, { type: 'break', card: 'ansel_1_0' })).toBeDefined();
    s = play(s, 'break', { card: 'ansel_1_0', subroutines: [0] });
    s = play(s, 'break', { card: 'ansel_1_0', subroutines: [1] });
    expect(s.players.runner.clicks).toBe(1);
    s = play(s, 'continue'); // the third subroutine resolves: no stealing or trashing
    s = play(s, 'continue'); // move on to the server
    expect(s.run).toBeNull();
    expect(cardsIn(s, Z.runnerScore)).toEqual([]);
    expect(cardsIn(s, Z.rd)).toEqual(['agenda-3-2']);
  });

  it('Brân 1.0: may install ice from HQ directly inward, then end the run', () => {
    let s = play(
      run('bran_1_0', { corp: { hand: ['ice-blank'] } }),
      'rez',
      { card: 'bran_1_0' },
    );
    s = play(s, 'continue'); // the Runner declines to break
    s = choose(s, idOf(s, Z.hq, 'ice-blank'));
    expect(cardsIn(s, Z.ice('rd'))).toEqual(['bran_1_0', 'ice-blank']);
    expect(s.run).toBeNull(); // the next subroutine ends the run
  });
});

describe('Corp agenda and identities', () => {
  it('Longevity Serum: trash any number of cards from HQ and shuffle up to 3 from Archives', () => {
    let s = scenario({
      corp: corp({
        hand: ['hedge_fund', 'op-0'],
        discard: ['sprint', 'op-2'],
        servers: { remote1: { root: [{ cardId: 'longevity_serum', advancement: 3 }] } },
      }),
      runner: runner(),
    });
    s = play(s, 'score', { card: 'longevity_serum' });
    s = choose(s, idOf(s, Z.hq, 'hedge_fund'));
    s = choose(s, 'done');
    s = choose(s, idOf(s, Z.archives, 'sprint'));
    s = choose(s, 'done');
    expect(cardsIn(s, Z.hq)).toEqual(['op-0']);
    expect(cardsIn(s, Z.archives).sort()).toEqual(['hedge_fund', 'op-2']);
    expect(cardsIn(s, Z.rd)).toContain('sprint');
  });

  it('Jinteki: gains 1 when the discard phase ends if there is a facedown card in Archives', () => {
    let s = scenario({
      corpIdentity: 'jinteki_restoring_humanity',
      corp: corp({ credits: 5, discard: ['op-0'] }),
      runner: runner(),
    });
    s = endTurn(s);
    expect(s.players.corp.credits).toBe(6);
    const none = endTurn(scenario({ corpIdentity: 'jinteki_restoring_humanity', corp: corp({ credits: 5 }), runner: runner() }));
    expect(none.players.corp.credits).toBe(5);
  });

  it('NBN: the first time each turn the Runner takes a tag, gain 2 credits or draw 2', () => {
    let s = scenario({
      corpIdentity: 'nbn_reality_plus',
      corp: corp({ credits: 9, hand: ['public_trail', 'public_trail'] }),
      runner: runner({ credits: 0 }),
    });
    s = withState(s, (d) => {
      d.prevTurnStats.successfulRun = true;
    });
    s = play(s, 'play', { card: 'public_trail' });
    expect(s.players.runner.tags).toBe(1);
    expect(s.pending).toEqual({ player: 'corp', kind: 'choice' });
    s = choose(s, 'credits');
    expect(s.players.corp.credits).toBe(9 - 4 + 2);
    s = play(s, 'play', { card: 'public_trail' });
    expect(s.players.runner.tags).toBe(2);
    expect(s.pending).toEqual({ player: 'corp', kind: 'action' }); // not the first time
  });

  it('Weyland: gains 2 when advancing a card with no advancement counters', () => {
    let s = scenario({
      corpIdentity: 'weyland_consortium_built_to_last',
      corp: corp({ credits: 5, servers: { remote1: { root: ['agenda-3-2'] } } }),
      runner: runner(),
    });
    s = play(s, 'advance', { card: 'agenda-3-2' });
    expect(s.players.corp.credits).toBe(5 - 1 + 2);
    s = play(s, 'advance', { card: 'agenda-3-2' });
    expect(s.players.corp.credits).toBe(6 - 1);
  });

  it('Haas-Bioroid: when you score an agenda, may add 1 card from Archives to HQ', () => {
    let s = scenario({
      corpIdentity: 'haas_bioroid_precision_design',
      corp: corp({
        discard: ['hedge_fund'],
        servers: { remote1: { root: [{ cardId: 'agenda-3-2', advancement: 3 }] } },
      }),
      runner: runner(),
    });
    s = play(s, 'score', { card: 'agenda-3-2' });
    s = choose(s, idOf(s, Z.archives, 'hedge_fund'));
    expect(cardsIn(s, Z.hq)).toEqual(['hedge_fund']);
    expect(handLimit(s, 'corp')).toBe(6);
  });
});
