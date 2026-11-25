import { describe, expect, it } from 'vitest';
import { SYSTEM_GATEWAY_CATALOG as CAT } from './cards';
import { getDefinition } from './definitions';
import { apply, createGame, legalCommands } from './engine';
import { Command, GameState, Side } from './types';
import { obj } from './zones';

/** NO_ABILITY: cards of System Gateway with nothing for the engine to run. */
const NO_ABILITY = ['the_catalyst_convention_breaker', 'the_syndicate_profit_over_principle'];

describe('System Gateway coverage', () => {
  it('every card has a definition, except those with nothing to implement', () => {
    const missing = Object.keys(CAT).filter((id) => Object.keys(getDefinition(id)).length === 0);
    expect(missing.sort()).toEqual([...NO_ABILITY].sort());
  });
});

/** A 40-card deck with up to 3 copies of every non-identity card of a side. */
function deckFor(side: Side): string[] {
  const pool = Object.values(CAT).filter((c) => c.side === side && c.type !== 'identity');
  const cards: string[] = [];
  for (let copy = 0; cards.length < 40; copy++) {
    for (const c of pool) {
      if (cards.length < 40 && copy < 3) cards.push(c.cardId);
    }
    if (copy >= 3) break;
  }
  return cards.slice(0, 40);
}

/** Small deterministic generator for the bot's choices. */
function rng(seed: number) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function checkInvariants(s: GameState): void {
  const fail = (msg: string): never => {
    throw new Error(`invariant broken: ${msg}`);
  };
  const seen = new Set<number>();
  for (const [key, ids] of Object.entries(s.zones)) {
    for (const id of ids) {
      const o = s.objects[id];
      if (!o) fail(`object ${id} of ${key} does not exist`);
      if (o.zone !== key) fail(`object ${id} says ${o.zone}, is in ${key}`);
      if (seen.has(id)) fail(`object ${id} is in two zones`);
      seen.add(id);
    }
  }
  if (seen.size !== Object.keys(s.objects).length) fail('an object is in no zone');
  for (const side of ['corp', 'runner'] as const) {
    if (s.players[side].credits < 0) fail(`${side} has negative credits`);
    if (s.players[side].clicks < 0) fail(`${side} has negative clicks`);
  }
  if (s.status !== 'ended') {
    if (!s.pending) fail('no pending decision in a running game');
    if (legalCommands(s, CAT).length === 0) fail('no legal command in a running game');
  }
}

/** Plays random legal commands; mostly keeps playing cards rather than ending the turn at once. */
function playRandomGame(seed: number, maxSteps: number): { state: GameState; steps: number } {
  const roll = rng(seed * 7919 + 1);
  let s = createGame(CAT, {
    seed,
    corp: { identity: seed % 2 ? 'haas_bioroid_precision_design' : 'nbn_reality_plus', cards: deckFor('corp') },
    runner: {
      identity: seed % 3 ? 'rene_loup_arcemont_party_animal' : 'zahya_sadeghi_versatile_smuggler',
      cards: deckFor('runner'),
    },
  });
  let steps = 0;
  while (s.status !== 'ended' && steps < maxSteps) {
    const legal = legalCommands(s, CAT);
    const weighted: Command[] = legal.flatMap((c): Command[] =>
      c.type === 'endTurn' || c.type === 'gainCredit' || c.type === 'drawCard' ? [c] : [c, c, c],
    );
    const cmd = weighted[Math.floor(roll() * weighted.length)];
    const r = apply(s, cmd, CAT);
    if (!r.ok) throw new Error(`seed ${seed} step ${steps}: ${r.error}`);
    s = r.state;
    checkInvariants(s);
    steps++;
  }
  return { state: s, steps };
}

describe('full games with random legal moves', () => {
  it('plays 25 seeded games without errors, keeping the game state consistent', () => {
    let ended = 0;
    let totalSteps = 0;
    for (let seed = 1; seed <= 25; seed++) {
      const { state, steps } = playRandomGame(seed, 800);
      totalSteps += steps;
      if (state.status === 'ended') ended++;
    }
    expect(totalSteps).toBeGreaterThan(1000);
    expect(ended).toBeGreaterThan(0);
  }, 60_000);

  it('is reproducible: the same seed gives the same game', () => {
    const a = playRandomGame(5, 300);
    const b = playRandomGame(5, 300);
    expect(b.state).toEqual(a.state);
  });
});
