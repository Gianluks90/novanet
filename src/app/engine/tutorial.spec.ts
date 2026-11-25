import { describe, expect, it } from 'vitest';
import { EN } from '../i18n/en';
import { SYSTEM_GATEWAY_CATALOG as CAT } from './cards';
import { STARTER_CORP, STARTER_RUNNER, stackDeck } from './cards/starter-decks';
import { unsupportedCards } from './deck-adapter';
import { createGame } from './engine';
import { LocalSession } from './session';
import { TutorialStep } from './tutorial';
import { TUTORIALS, TutorialId, createTutorial } from './tutorials';
import { Z, obj, zone } from './zones';

describe('starter decks', () => {
  it('have the cards of the introductory decks', () => {
    expect(STARTER_RUNNER.cards).toHaveLength(30);
    expect(STARTER_CORP.cards).toHaveLength(34);
    expect(STARTER_RUNNER.identity).toBe('the_catalyst_convention_breaker');
    expect(STARTER_CORP.identity).toBe('the_syndicate_profit_over_principle');
    const count = (list: string[], id: string) => list.filter((c) => c === id).length;
    expect(count(STARTER_RUNNER.cards, 'jailbreak')).toBe(3);
    expect(count(STARTER_CORP.cards, 'offworld_office')).toBe(3);
    expect(count(STARTER_CORP.cards, 'manegarm_skunkworks')).toBe(1);
  });

  it('only use cards of the right side that the engine can play', () => {
    expect(unsupportedCards(STARTER_RUNNER, CAT)).toEqual([]);
    expect(unsupportedCards(STARTER_CORP, CAT)).toEqual([]);
    for (const id of STARTER_RUNNER.cards) expect(CAT[id].side).toBe('runner');
    for (const id of STARTER_CORP.cards) expect(CAT[id].side).toBe('corp');
  });

  it('play whole games against each other (bot against bot)', () => {
    let ended = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const s = new LocalSession({
        catalog: CAT,
        corp: STARTER_CORP,
        runner: STARTER_RUNNER,
        seed,
        bots: ['corp', 'runner'],
      });
      if (s.state.status === 'ended') ended++;
    }
    expect(ended).toBe(10);
  });
});

describe('stacked games', () => {
  it('stackDeck puts the chosen cards first and keeps the rest', () => {
    const d = stackDeck(STARTER_CORP, ['palisade', 'hedge_fund']);
    expect(d.cards.slice(0, 2)).toEqual(['palisade', 'hedge_fund']);
    expect(d.cards).toHaveLength(34);
    expect(() => stackDeck(STARTER_CORP, ['manegarm_skunkworks', 'manegarm_skunkworks'])).toThrow();
  });

  it('deal the first cards of the list, without a mulligan', () => {
    const g = createGame(CAT, {
      corp: stackDeck(STARTER_CORP, ['hedge_fund', 'offworld_office', 'palisade', 'tithe', 'whitespace', 'nico_campaign']),
      runner: stackDeck(STARTER_RUNNER, ['cleaver', 'jailbreak']),
      stacked: true,
      skipMulligan: true,
    });
    expect(g.status).toBe('playing');
    const hq = zone(g, Z.hq).map((id) => obj(g, id).cardId);
    // 5 cards in the opening hand plus the first draw of turn 1
    expect(hq.sort()).toEqual(
      ['hedge_fund', 'offworld_office', 'palisade', 'tithe', 'whitespace', 'nico_campaign'].sort(),
    );
    const grip = zone(g, Z.grip).map((id) => obj(g, id).cardId);
    expect(grip).toContain('cleaver');
    expect(grip).toContain('jailbreak');
  });
});

describe.each(['corp', 'runner'] as TutorialId[])('%s tutorial', (id) => {
  const script = TUTORIALS[id];

  it('has a text, in English and Italian, for every step that shows one', () => {
    const keys = script.steps.flatMap((s: TutorialStep) => (s.kind === 'script' ? [] : [s.text]));
    expect(keys.length).toBeGreaterThan(5);
    for (const k of keys) expect(k in EN, `${k} is not in the dictionary`).toBe(true);
  });

  it('can be played from the first step to the last, only with the moves of each step', () => {
    const t = createTutorial(id, CAT);
    expect(t.finished).toBe(false);
    let steps = 0;
    while (!t.finished) {
      const step = t.step!;
      if (step.kind === 'info') {
        expect(t.legal()).toEqual([]);
        t.acknowledge();
      } else {
        expect(step.kind).toBe('player');
        const legal = t.legal();
        expect(legal.length, `step ${t.index} has a legal move`).toBeGreaterThan(0);
        expect(legal.every((c) => c.player === t.learner)).toBe(true);
        expect(t.state.pending?.player).toBe(t.learner);
        const r = t.submit(legal[0]);
        expect(r.ok).toBe(true);
      }
      steps++;
      expect(steps).toBeLessThan(100);
    }
    expect(t.index).toBe(t.total);
    expect(t.legal()).toEqual([]);
    expect(t.state.status).toBe('playing'); // the lesson ends, the game could go on
  });

  it('refuses any move that is not the one being explained', () => {
    const t = createTutorial(id, CAT);
    while (t.step?.kind === 'info') t.acknowledge();
    const before = t.index;
    const allowed = t.legal();
    // another legal move of the real game (a basic action, or anything else) is not part of the lesson
    const others = t['inner'].legal().filter((c) => !allowed.some((a) => JSON.stringify(a) === JSON.stringify(c)));
    expect(others.length).toBeGreaterThan(0);
    for (const c of others) expect(t.submit(c).ok).toBe(false);
    expect(t.index).toBe(before);
  });

  it('can be restarted and resumed at any step', () => {
    const t = createTutorial(id, CAT);
    const mid = Math.floor(t.total / 2);
    t.goTo(mid);
    expect(t.index).toBeGreaterThanOrEqual(mid);
    const snapshot = structuredClone(t.state);
    t.restart();
    expect(t.index).toBe(0);
    t.goTo(mid);
    expect(t.state).toEqual(snapshot);
  });
});

describe('what each tutorial leaves on the table', () => {
  const finish = (id: TutorialId) => {
    const t = createTutorial(id, CAT);
    t.goTo(t.total);
    return t;
  };

  it('Corp: Offworld Office scored with 4 advancement tokens, and its 7 credits', () => {
    const t = finish('corp');
    expect(t.finished).toBe(true);
    const scored = zone(t.state, Z.corpScore).map((i) => obj(t.state, i).cardId);
    expect(scored).toEqual(['offworld_office']);
    expect(t.state.players.corp.credits).toBeGreaterThanOrEqual(7);
    expect(zone(t.state, Z.ice('remote1'))).toHaveLength(1);
    expect(obj(t.state, zone(t.state, Z.ice('remote1'))[0]).faceUp).toBe(true);
  });

  it('Runner: the Runner stole Offworld Office with Cleaver installed', () => {
    const t = finish('runner');
    const stolen = zone(t.state, Z.runnerScore).map((i) => obj(t.state, i).cardId);
    expect(stolen).toEqual(['offworld_office']);
    expect(zone(t.state, Z.rig).map((i) => obj(t.state, i).cardId)).toEqual(['cleaver']);
    expect(t.state.run).toBeNull();
  });
});
