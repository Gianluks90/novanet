import { describe, expect, it } from 'vitest';
import { Card } from '../models/card';
import { SYSTEM_GATEWAY_CATALOG as CAT } from './cards';
import systemGateway from './data/system_gateway.json';
import { STATELESS_CARDS, deckToDeckList, unsupportedCards } from './deck-adapter';
import { DeckList } from './engine';
import { LocalSession, replay } from './session';
import { play, scenario, withState } from './testing';
import { PlayerView, view } from './view';
import { Z, zone } from './zones';

const PRINTINGS = systemGateway as unknown as Card[];
const byPrinting = new Map(PRINTINGS.map((c) => [c.id, c]));
const printing = (cardId: string) => PRINTINGS.find((c) => c.card_id === cardId)!;

function deckFor(side: 'corp' | 'runner', identity: string): DeckList {
  const pool = Object.values(CAT).filter((c) => c.side === side && c.type !== 'identity');
  const cards: string[] = [];
  for (let copy = 0; copy < 3; copy++) for (const c of pool) cards.push(c.cardId);
  return { identity, cards: cards.slice(0, 40) };
}
const CORP = deckFor('corp', 'haas_bioroid_precision_design');
const RUNNER = deckFor('runner', 'rene_loup_arcemont_party_animal');

describe('deck adapter', () => {
  it('turns a saved deck (printing ids and counts) into one card id per copy', () => {
    const deck = {
      identity: printing('rene_loup_arcemont_party_animal'),
      cards: {
        [printing('sure_gamble').id]: 3,
        [printing('cleaver').id]: 2,
        '99999': 1,
      },
    };
    const { list, missing } = deckToDeckList(deck, (id) => byPrinting.get(id));
    expect(list.identity).toBe('rene_loup_arcemont_party_animal');
    expect(list.cards.filter((c) => c === 'sure_gamble')).toHaveLength(3);
    expect(list.cards.filter((c) => c === 'cleaver')).toHaveLength(2);
    expect(missing).toEqual(['99999']);
  });

  it('lists the cards the engine cannot play yet', () => {
    const list: DeckList = {
      identity: 'the_catalyst_convention_breaker',
      cards: ['sure_gamble', 'some_card_of_another_set'],
    };
    expect(STATELESS_CARDS).toContain(list.identity);
    expect(unsupportedCards(list, CAT)).toEqual(['some_card_of_another_set']);
  });
});

describe('view: hidden information', () => {
  const base = () =>
    scenario({
      corp: {
        hand: ['agenda-3-2', 'hedge_fund'],
        deck: ['op-0', 'op-0'],
        discard: ['op-2'],
        servers: {
          remote1: { root: ['asset-t3'], ice: ['barrier-2'] },
          hq: { ice: [{ cardId: 'gate-1', faceUp: true }] },
        },
      },
      runner: { hand: ['sure_gamble', 'cleaver'], deck: ['event-0'], rig: ['fracter'], discard: ['hw'] },
    });

  /** Card ids a viewer sees in a zone ('' = hidden). */
  const seen = (v: PlayerView, key: string) => (v.zones[key] ?? []).map((id) => v.objects[id].cardId);

  it('the Runner does not see the Corp hand, deck, unrezzed cards or facedown Archives', () => {
    const v = view(base(), 'runner');
    expect(seen(v, Z.hq)).toEqual(['', '']);
    expect(seen(v, Z.rd)).toEqual(['', '']);
    expect(seen(v, Z.archives)).toEqual(['']);
    expect(seen(v, Z.root('remote1'))).toEqual(['']);
    expect(seen(v, Z.ice('remote1'))).toEqual(['']);
    // rezzed ice, and the Runner's own cards, are visible
    expect(seen(v, Z.ice('hq'))).toEqual(['gate-1']);
    expect(seen(v, Z.grip).sort()).toEqual(['cleaver', 'sure_gamble']);
    expect(seen(v, Z.stack)).toEqual(['event-0']);
  });

  it('the Corp does not see the Runner grip or stack, but sees the rig and the heap', () => {
    const v = view(base(), 'corp');
    expect(seen(v, Z.grip)).toEqual(['', '']);
    expect(seen(v, Z.stack)).toEqual(['']);
    expect(seen(v, Z.rig)).toEqual(['fracter']);
    expect(seen(v, Z.heap)).toEqual(['hw']);
    expect(seen(v, Z.hq).sort()).toEqual(['agenda-3-2', 'hedge_fund']);
    expect(seen(v, Z.root('remote1'))).toEqual(['asset-t3']); // the Corp sees its own installed cards
  });

  it('a rezzed card becomes visible to the Runner', () => {
    const s = play(base(), 'rez', { card: 'asset-t3' });
    expect(seen(view(s, 'runner'), Z.root('remote1'))).toEqual(['asset-t3']);
  });

  it('cards being accessed are shown to both players', () => {
    const s = scenario({ active: 'runner', corp: { credits: 0, hand: ['hedge_fund'] } });
    const hq = zone(s, Z.hq)[0];
    expect(view(s, 'runner').objects[hq].cardId).toBe('');
    const mid = withState(s, (d) => {
      d.breach = { server: 'hq', slotsLeft: 0, accessed: [hq], current: hq };
    });
    expect(view(mid, 'runner').objects[hq].cardId).toBe('hedge_fund');
    expect(view(mid, 'corp').objects[hq].cardId).toBe('hedge_fund');
  });

  it('does not leak the random state and does not change the state', () => {
    const s = base();
    const before = structuredClone(s);
    const v = view(s, 'runner') as unknown as Record<string, unknown>;
    expect('rngState' in v).toBe(false);
    expect(v['viewer']).toBe('runner');
    expect(s).toEqual(before);
  });
});

describe('bot', () => {
  it('plays whole games against itself without ever choosing an illegal command', () => {
    let ended = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const session = new LocalSession({
        catalog: CAT,
        corp: CORP,
        runner: RUNNER,
        seed,
        bots: ['corp', 'runner'],
      });
      if (session.state.status === 'ended') ended++;
    }
    expect(ended).toBe(12);
  });

  it('every game ends for a rule reason: agenda points, flatline or an empty R&D', () => {
    const session = new LocalSession({
      catalog: CAT,
      corp: CORP,
      runner: RUNNER,
      seed: 3,
      bots: ['corp', 'runner'],
    });
    expect(session.state.status).toBe('ended');
    expect(['agenda', 'flatline', 'decked', 'draw']).toContain(session.state.winReason);
  });
});

describe('LocalSession', () => {
  const make = () =>
    new LocalSession({ catalog: CAT, corp: CORP, runner: RUNNER, seed: 11, bots: ['corp'] });

  it('the bot answers for its side and stops at a human decision', () => {
    const s = make();
    expect(s.state.pending).toEqual({ player: 'runner', kind: 'mulligan' });
    expect(s.legal().every((c) => c.player === 'runner')).toBe(true);
  });

  it('submit applies the command, runs the bot and notifies subscribers', () => {
    const s = make();
    const events: string[] = [];
    s.subscribe((_state, ev) => events.push(...ev.map((e) => e.type)));
    const r = s.submit({ type: 'mulligan', player: 'runner', keep: true });
    expect(r.ok).toBe(true);
    expect(s.state.status).toBe('playing');
    expect(events).toContain('turnBegins');
    // the Corp bot played its first turn: it is the Runner's decision now
    expect(s.state.turn.active).toBe('runner');
    expect(s.state.pending?.player).toBe('runner');
  });

  it('refuses illegal commands and keeps the state', () => {
    const s = make();
    const before = s.state;
    const r = s.submit({ type: 'gainCredit', player: 'runner' });
    expect(r.ok).toBe(false);
    expect(s.state).toBe(before);
  });

  it('a game can be replayed from its seed and its command history', () => {
    const s = make();
    s.submit({ type: 'mulligan', player: 'runner', keep: true });
    s.submit({ type: 'gainCredit', player: 'runner' });
    s.submit({ type: 'drawCard', player: 'runner' });
    const copy = replay({ catalog: CAT, corp: CORP, runner: RUNNER, seed: 11 }, s.history);
    expect(copy).toEqual(s.state);
  });

  it('view gives each side its own information', () => {
    const s = make();
    const v = s.view('runner');
    const ids = (key: string) => v.zones[key] ?? [];
    expect(ids(Z.grip).every((id) => v.objects[id].cardId !== '')).toBe(true);
    expect(ids(Z.hq).every((id) => v.objects[id].cardId === '')).toBe(true);
  });
});
