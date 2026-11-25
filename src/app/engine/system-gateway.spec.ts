import { describe, expect, it } from 'vitest';
import { handLimit, legalCommands, memoryLimit } from './engine';
import {
  TEST_CATALOG as CAT,
  cardsIn,
  choose,
  findCommand,
  idOf,
  play,
  scenario,
  withState,
} from './testing';
import { Z, obj, zone } from './zones';

const filler = (card: string, n: number) => Array.from({ length: n }, () => card);
const ops = (n: number) => filler('op-0', n);

describe('catalog', () => {
  it('loads the 77 System Gateway cards with their real data', () => {
    expect(CAT['hedge_fund']).toMatchObject({ type: 'operation', cost: 5, side: 'corp' });
    expect(CAT['cleaver']).toMatchObject({ type: 'program', cost: 3, strength: 3, memory: 1 });
    expect(CAT['offworld_office']).toMatchObject({ advancementRequirement: 4, agendaPoints: 2 });
    expect(CAT['rene_loup_arcemont_party_animal']?.type).toBe('identity');
  });
});

describe('Runner events', () => {
  it('Sure Gamble: pays 5, gains 9, uses a click and is trashed', () => {
    let s = scenario({ active: 'runner', runner: { hand: ['sure_gamble'] } });
    s = play(s, 'play', { card: 'sure_gamble' });
    expect(s.players.runner.credits).toBe(9);
    expect(s.players.runner.clicks).toBe(3);
    expect(cardsIn(s, Z.heap)).toEqual(['sure_gamble']);
    expect(zone(s, Z.play)).toHaveLength(0);
  });

  it('Creative Commission: gains 5 and loses a click if any is left', () => {
    let s = scenario({ active: 'runner', runner: { hand: ['creative_commission'] } });
    s = play(s, 'play', { card: 'creative_commission' });
    expect(s.players.runner.credits).toBe(9);
    expect(s.players.runner.clicks).toBe(2);

    let last = scenario({ active: 'runner', runner: { clicks: 1, hand: ['creative_commission'] } });
    last = play(last, 'play', { card: 'creative_commission' });
    expect(last.players.runner.credits).toBe(9);
    expect(last.turn.active).toBe('corp'); // no click to lose, the turn ended
  });

  it('VRcation: draws 4 and loses a click', () => {
    let s = scenario({ active: 'runner', runner: { hand: ['vrcation'], deck: filler('event-0', 6) } });
    s = play(s, 'play', { card: 'vrcation' });
    expect(zone(s, Z.grip)).toHaveLength(4);
    expect(s.players.runner.clicks).toBe(2);
  });

  it('Wildcat Strike: the Corp chooses credits or cards for the Runner', () => {
    let s = scenario({ active: 'runner', runner: { hand: ['wildcat_strike', 'wildcat_strike'], deck: filler('event-0', 6) } });
    s = play(s, 'play', { card: 'wildcat_strike' });
    expect(s.pending).toEqual({ player: 'corp', kind: 'choice' });
    expect(apply(s)).toHaveLength(2);
    const credits = choose(s, 'credits');
    expect(credits.players.runner.credits).toBe(9); // 5 - 2 + 6
    const cards = choose(s, 'cards');
    expect(zone(cards, Z.grip)).toHaveLength(5); // 1 left in hand + 4
    expect(cards.pending).toEqual({ player: 'runner', kind: 'action' });
  });

  it('Mutual Favor: adds the chosen icebreaker; installing is offered after a successful run', () => {
    const base = scenario({
      active: 'runner',
      runner: { hand: ['mutual_favor'], deck: ['event-0', 'cleaver', 'fracter'] },
    });
    let s = play(base, 'play', { card: 'mutual_favor' });
    s = choose(s, idOf(s, Z.stack, 'cleaver'));
    expect(cardsIn(s, Z.grip)).toEqual(['cleaver']);
    expect(zone(s, Z.stack)).toHaveLength(2);

    let ok = withState(base, (d) => {
      d.turnStats.successfulRun = true;
    });
    ok = play(ok, 'play', { card: 'mutual_favor' });
    ok = choose(ok, idOf(ok, Z.stack, 'cleaver'));
    expect(ok.pending).toEqual({ player: 'runner', kind: 'choice' });
    ok = choose(ok, 'install');
    expect(cardsIn(ok, Z.rig)).toEqual(['cleaver']);
    expect(ok.players.runner.credits).toBe(2); // 5 - 0 - 3
  });
});

/** The options of the pending choice. */
function apply(s: Parameters<typeof legalCommands>[0]) {
  return legalCommands(s, CAT).filter((c) => c.type === 'choose');
}

describe('Corp operations', () => {
  it('Hedge Fund: costs 5 and gains 9', () => {
    let s = scenario({ corp: { hand: ['hedge_fund'] } });
    s = play(s, 'play', { card: 'hedge_fund' });
    expect(s.players.corp.credits).toBe(9);
    expect(cardsIn(s, Z.archives)).toEqual(['hedge_fund']);
  });

  it('Government Subsidy: needs 10 credits and gains 15', () => {
    const poor = scenario({ corp: { credits: 9, hand: ['government_subsidy'] } });
    expect(findCommand(poor, { type: 'play' })).toBeUndefined();
    let s = scenario({ corp: { credits: 12, hand: ['government_subsidy'] } });
    s = play(s, 'play', { card: 'government_subsidy' });
    expect(s.players.corp.credits).toBe(17);
  });

  it('Hansei Review: gains 10 and trashes a card of the Corp\'s choice from HQ', () => {
    let s = scenario({ corp: { hand: ['hansei_review', 'op-0', 'hedge_fund'] } });
    s = play(s, 'play', { card: 'hansei_review' });
    expect(s.players.corp.credits).toBe(10);
    expect(s.pending).toEqual({ player: 'corp', kind: 'choice' });
    s = choose(s, idOf(s, Z.hq, 'hedge_fund'));
    expect(cardsIn(s, Z.hq)).toEqual(['op-0']);
    expect(cardsIn(s, Z.archives).sort()).toEqual(['hansei_review', 'hedge_fund']);

    let empty = scenario({ corp: { hand: ['hansei_review'] } });
    empty = play(empty, 'play', { card: 'hansei_review' });
    expect(empty.players.corp.credits).toBe(10);
    expect(empty.pending).toEqual({ player: 'corp', kind: 'action' });
  });

  it('Sprint: draws 3 then shuffles 2 cards from HQ into R&D', () => {
    let s = scenario({ corp: { credits: 5, hand: ['sprint', 'hedge_fund', 'op-0'], deck: ops(5) } });
    s = play(s, 'play', { card: 'sprint' });
    expect(zone(s, Z.hq)).toHaveLength(5);
    s = choose(s, idOf(s, Z.hq, 'hedge_fund'));
    s = choose(s);
    expect(zone(s, Z.hq)).toHaveLength(3);
    expect(zone(s, Z.rd)).toHaveLength(4);
    expect(cardsIn(s, Z.rd)).toContain('hedge_fund');
  });

  it('Predictive Planogram: both modes only when the Runner is tagged', () => {
    let s = scenario({ corp: { hand: ['predictive_planogram'], deck: ops(4) } });
    s = play(s, 'play', { card: 'predictive_planogram' });
    expect(apply(s)).toHaveLength(2);
    const credits = choose(s, 'credits');
    expect(credits.players.corp.credits).toBe(8);

    let t = scenario({ corp: { hand: ['predictive_planogram'], deck: ops(4) }, runner: { tags: 1 } });
    t = play(t, 'play', { card: 'predictive_planogram' });
    expect(apply(t)).toHaveLength(3);
    t = choose(t, 'both');
    expect(t.players.corp.credits).toBe(8);
    expect(zone(t, Z.hq)).toHaveLength(3);
  });

  it('Public Trail: only after a successful run last turn; the Runner pays 8 or takes a tag', () => {
    const base = scenario({ corp: { hand: ['public_trail'] }, runner: { credits: 9 } });
    expect(findCommand(base, { type: 'play' })).toBeUndefined();
    const ready = withState(base, (d) => {
      d.prevTurnStats.successfulRun = true;
    });
    let paid = play(ready, 'play', { card: 'public_trail' });
    expect(paid.pending).toEqual({ player: 'runner', kind: 'choice' });
    paid = choose(paid, 'pay');
    expect(paid.players.runner.credits).toBe(1);
    expect(paid.players.runner.tags).toBe(0);

    let tagged = play(ready, 'play', { card: 'public_trail' });
    tagged = choose(tagged, 'tag');
    expect(tagged.players.runner.tags).toBe(1);
    expect(tagged.players.runner.credits).toBe(9);
  });

  it('Public Trail: a poor Runner has no choice, just the tag', () => {
    const ready = withState(scenario({ corp: { hand: ['public_trail'] }, runner: { credits: 3 } }), (d) => {
      d.prevTurnStats.successfulRun = true;
    });
    const s = play(ready, 'play', { card: 'public_trail' });
    expect(s.players.runner.tags).toBe(1);
  });

  it('Retribution: needs a tag and trashes the chosen program or hardware', () => {
    expect(findCommand(scenario({ corp: { hand: ['retribution'] }, runner: { rig: ['prog-1'] } }), { type: 'play' })).toBeUndefined();
    let s = scenario({ corp: { hand: ['retribution'] }, runner: { tags: 1, rig: ['prog-1', 'hw', 'res'] } });
    s = play(s, 'play', { card: 'retribution' });
    expect(apply(s)).toHaveLength(2); // the resource is not a target
    s = choose(s, idOf(s, Z.rig, 'hw'));
    expect(cardsIn(s, Z.heap)).toEqual(['hw']);
  });

  it('Neurospike: net damage equal to the agenda points scored this turn', () => {
    let s = scenario({
      corp: {
        credits: 5,
        hand: ['neurospike'],
        servers: { remote1: { root: [{ cardId: 'agenda-3-2', advancement: 3 }] } },
      },
      runner: { hand: ops(0).concat(filler('event-0', 5)) },
    });
    s = play(s, 'score', { card: 'agenda-3-2' });
    s = play(s, 'play', { card: 'neurospike' });
    expect(zone(s, Z.grip)).toHaveLength(3);
  });

  it('Seamless Launch: 2 advancement counters on a card not installed this turn', () => {
    let s = scenario({
      corp: {
        hand: ['seamless_launch', 'asset-t3'],
        servers: { remote1: { root: ['agenda-3-2'] } },
      },
    });
    s = play(s, 'install', { card: 'asset-t3', server: 'new' });
    s = play(s, 'play', { card: 'seamless_launch' });
    // the only target is the agenda that was already installed
    expect(s.pending).toEqual({ player: 'corp', kind: 'action' });
    expect(obj(s, idOf(s, Z.root('remote1'), 'agenda-3-2')).counters.advancement).toBe(2);
  });

  it('Seamless Launch: cannot be played when everything was installed this turn', () => {
    let s = scenario({ corp: { hand: ['seamless_launch', 'asset-t3'] } });
    s = play(s, 'install', { card: 'asset-t3', server: 'new' });
    expect(findCommand(s, { type: 'play' })).toBeUndefined();
  });
});

describe('agendas', () => {
  const scoring = (card: string, extra: Parameters<typeof scenario>[0] = {}) =>
    play(
      scenario({
        ...extra,
        corp: {
          ...extra.corp,
          servers: {
            ...extra.corp?.servers,
            remote1: { root: [{ cardId: card, advancement: 5 }] },
          },
        },
      }),
      'score',
      { card },
    );

  it('Offworld Office: gains 7 credits', () => {
    expect(scoring('offworld_office').players.corp.credits).toBe(12);
  });

  it('Luminal Transubstantiation: 3 clicks, and no more scoring this turn', () => {
    const s = scoring('luminal_transubstantiation', {
      corp: { servers: { remote2: { root: [{ cardId: 'agenda-3-2', advancement: 3 }] } } },
    });
    expect(s.players.corp.clicks).toBe(6);
    expect(findCommand(s, { type: 'score' })).toBeUndefined();
  });

  it("Tomorrow's Headline: a tag when scored", () => {
    expect(scoring('tomorrows_headline').players.runner.tags).toBe(1);
  });

  it("Tomorrow's Headline: a tag when stolen", () => {
    let s = scenario({ active: 'runner', corp: { deck: ['tomorrows_headline'] } });
    s = play(s, 'run', { server: 'rd' });
    s = play(s, 'continue');
    expect(s.players.runner.tags).toBe(1);
    expect(cardsIn(s, Z.runnerScore)).toEqual(['tomorrows_headline']);
  });

  it('Superconducting Hub: optional draw of 2 and +2 maximum hand size', () => {
    let s = scoring('superconducting_hub', { corp: { deck: ops(4) } });
    expect(s.pending).toEqual({ player: 'corp', kind: 'choice' });
    expect(handLimit(s, 'corp')).toBe(7);
    s = choose(s, 'yes');
    expect(zone(s, Z.hq)).toHaveLength(2);
    const declined = choose(scoring('superconducting_hub', { corp: { deck: ops(4) } }), 'no');
    expect(zone(declined, Z.hq)).toHaveLength(0);
  });

  it('Above the Law: may trash an installed resource', () => {
    let s = scoring('above_the_law', { runner: { rig: ['res', 'prog-1'] } });
    expect(apply(s)).toHaveLength(2); // the resource or none
    s = choose(s, idOf(s, Z.rig, 'res'));
    expect(cardsIn(s, Z.heap)).toEqual(['res']);
    expect(cardsIn(s, Z.rig)).toEqual(['prog-1']);
  });

  it('Orbital Superiority: a tag, or 4 meat damage if the Runner is tagged', () => {
    const untagged = scoring('orbital_superiority', { runner: { hand: filler('event-0', 5) } });
    expect(untagged.players.runner.tags).toBe(1);
    expect(zone(untagged, Z.grip)).toHaveLength(5);
    const tagged = scoring('orbital_superiority', { runner: { tags: 1, hand: filler('event-0', 5) } });
    expect(zone(tagged, Z.grip)).toHaveLength(1);
  });

  it('Send a Message: may rez an installed ice for free when scored or stolen', () => {
    let s = scoring('send_a_message', {
      corp: { servers: { hq: { ice: ['barrier-2'] } } },
    });
    s = choose(s, idOf(s, Z.ice('hq'), 'barrier-2'));
    expect(obj(s, zone(s, Z.ice('hq'))[0]).faceUp).toBe(true);
    expect(s.players.corp.credits).toBe(5);

    let stolen = scenario({
      active: 'runner',
      corp: { credits: 0, deck: ['send_a_message'], servers: { hq: { ice: ['barrier-2'] } } },
    });
    stolen = play(stolen, 'run', { server: 'rd' });
    stolen = play(stolen, 'continue');
    expect(stolen.pending).toEqual({ player: 'corp', kind: 'choice' });
    stolen = choose(stolen, 'none');
    expect(cardsIn(stolen, Z.runnerScore)).toEqual(['send_a_message']);
    expect(stolen.pending).toEqual({ player: 'runner', kind: 'action' });
  });
});

describe('static abilities', () => {
  it('T400 Memory Diamond: +1 memory and +1 maximum hand size', () => {
    const s = scenario({ active: 'runner', runner: { rig: ['t400_memory_diamond'] } });
    expect(memoryLimit(s, CAT)).toBe(5);
    expect(handLimit(s, 'runner')).toBe(6);
  });

  it('the Haas-Bioroid identity gives the Corp +1 maximum hand size', () => {
    const s = scenario({ corpIdentity: 'haas_bioroid_precision_design' });
    expect(handLimit(s, 'corp')).toBe(6);
    expect(handLimit(s, 'runner')).toBe(5);
  });

  it('a rezzed or unrezzed card does not change anything it has no static ability for', () => {
    expect(handLimit(scenario({ corp: { servers: { remote1: { root: ['asset-t3'] } } } }), 'corp')).toBe(5);
  });
});

/** Runner turn, run on R&D (an agenda on top) behind `ice`, with the Corp able to rez. */
const encounter = (ice: string, extra: Parameters<typeof scenario>[0] = {}) => {
  let s = scenario({
    active: 'runner',
    ...extra,
    corp: { credits: 9, deck: ['agenda-3-2'], servers: { rd: { ice: [ice] } }, ...extra.corp },
  });
  s = play(s, 'run', { server: 'rd' });
  return play(s, 'rez', { card: ice });
};

describe('ice', () => {
  it('Tithe: 1 net damage and the Corp gains 1 credit', () => {
    const s = encounter('tithe', { runner: { hand: filler('event-0', 3) } });
    expect(zone(s, Z.grip)).toHaveLength(2);
    expect(s.players.corp.credits).toBe(9 - 1 + 1);
    expect(s.pending).toEqual({ player: 'runner', kind: 'movement' });
  });

  it('Whitespace: the Runner loses 3 credits, and the run ends if they have 6 or less', () => {
    const rich = encounter('whitespace', { runner: { credits: 12 } });
    expect(rich.players.runner.credits).toBe(9);
    expect(rich.pending).toEqual({ player: 'runner', kind: 'movement' });
    const poor = encounter('whitespace', { runner: { credits: 8 } });
    expect(poor.players.runner.credits).toBe(5);
    expect(poor.run).toBeNull();
  });

  it('Karuna: 2 net damage, the Runner may jack out, then 2 more net damage', () => {
    let s = encounter('karuna', { runner: { hand: filler('event-0', 5) } });
    expect(zone(s, Z.grip)).toHaveLength(3);
    expect(s.pending).toEqual({ player: 'runner', kind: 'choice' });
    const out = choose(s, 'yes');
    expect(out.run).toBeNull();
    expect(zone(out, Z.grip)).toHaveLength(3);
    s = choose(s, 'no');
    expect(zone(s, Z.grip)).toHaveLength(1);
    expect(s.pending).toEqual({ player: 'runner', kind: 'movement' });
  });

  it('Ballista: the Corp trashes a program or ends the run', () => {
    let s = encounter('ballista', { runner: { rig: ['prog-1'] } });
    expect(s.pending).toEqual({ player: 'corp', kind: 'choice' });
    s = choose(s, 'trash');
    expect(cardsIn(s, Z.heap)).toEqual(['prog-1']);
    expect(s.pending).toEqual({ player: 'runner', kind: 'movement' });
    const ended = choose(encounter('ballista', { runner: { rig: ['prog-1'] } }), 'end');
    expect(ended.run).toBeNull();
    expect(cardsIn(ended, Z.rig)).toEqual(['prog-1']);
  });

  it('Ballista with no program just ends the run', () => {
    expect(encounter('ballista').run).toBeNull();
  });

  it('Diviner: ends the run only if the trashed card has an odd printed cost', () => {
    const odd = encounter('diviner', { runner: { hand: ['sure_gamble'] } }); // cost 5
    expect(odd.run).toBeNull();
    const even = encounter('diviner', { runner: { hand: ['hw'] } }); // cost 1 -> odd
    expect(even.run).toBeNull();
    const none = encounter('diviner', { runner: { hand: ['wildcat_strike'] } }); // cost 2
    expect(none.pending).toEqual({ player: 'runner', kind: 'movement' });
  });
});

describe('icebreakers', () => {
  const vs = (breaker: string, ice: string, extra: Parameters<typeof scenario>[0] = {}) =>
    encounter(ice, { ...extra, runner: { rig: [breaker], hand: filler('event-0', 3), credits: 9, ...extra.runner } });

  it('Cleaver breaks up to 2 barrier subroutines for 1 credit', () => {
    let s = vs('cleaver', 'barrier-2');
    const options = legalCommands(s, CAT).filter((c) => c.type === 'break');
    expect(options).toHaveLength(3); // [0], [1], [0,1]
    s = play(s, 'break', { card: 'cleaver', subroutines: [0, 1] });
    expect(s.players.runner.credits).toBe(8);
    expect(s.pending).toEqual({ player: 'runner', kind: 'movement' });
  });

  it('Buzzsaw breaks code gates only', () => {
    const s = vs('buzzsaw', 'barrier-2');
    expect(s.run).toBeNull(); // cannot break a barrier: the first subroutine ends the run
    const gate = vs('buzzsaw', 'gate-1');
    expect(findCommand(gate, { type: 'break' })).toBeDefined();
    expect(findCommand(gate, { type: 'boost' })).toBeUndefined(); // already strong enough
  });

  it('Marjanah costs 2 to break a barrier, 1 after a successful run this turn', () => {
    const base = scenario({
      active: 'runner',
      runner: { rig: ['marjanah'], credits: 9, hand: filler('event-0', 3) },
      corp: { credits: 9, deck: ['agenda-3-2'], servers: { rd: { ice: ['barrier-2'] } } },
    });
    const run = (st: typeof base) => play(play(st, 'run', { server: 'rd' }), 'rez', { card: 'barrier-2' });
    let s = run(base);
    s = play(s, 'boost', { card: 'marjanah' }); // strength 1 -> 2
    s = play(s, 'break', { card: 'marjanah', subroutines: [0] });
    expect(s.players.runner.credits).toBe(9 - 1 - 2);

    let ok = run(withState(base, (d) => { d.turnStats.successfulRun = true; }));
    ok = play(ok, 'boost', { card: 'marjanah' });
    ok = play(ok, 'break', { card: 'marjanah', subroutines: [0] });
    expect(ok.players.runner.credits).toBe(9 - 1 - 1);
  });

  it('Carmen costs 2 less to install after a successful run this turn', () => {
    const base = scenario({ active: 'runner', runner: { hand: ['carmen'], credits: 5 } });
    const plain = play(base, 'install', { card: 'carmen' });
    expect(plain.players.runner.credits).toBe(0);
    const cheap = play(
      withState(base, (d) => {
        d.turnStats.successfulRun = true;
      }),
      'install',
      { card: 'carmen' },
    );
    expect(cheap.players.runner.credits).toBe(2);
  });
});

describe('effects and the queue', () => {
  it('an effect that ends the run drops the remaining subroutines', () => {
    const s = encounter('gate-1', { runner: { hand: filler('event-0', 3) } });
    expect(s.effects).toEqual([]);
    expect(s.run).toBeNull();
  });

  it('only the choosing player can answer', () => {
    let s = scenario({ active: 'runner', runner: { hand: ['wildcat_strike'] } });
    s = play(s, 'play', { card: 'wildcat_strike' });
    const wrong = legalCommands(s, CAT).every((c) => c.player === 'corp');
    expect(wrong).toBe(true);
  });
});
