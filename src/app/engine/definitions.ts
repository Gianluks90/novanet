/**
 * Card definitions: the behaviour of cards, written by hand and keyed by `card_id` (slug). They
 * are code, never part of the game state. Phase 2 covers ice subroutines and icebreaker
 * abilities; more kinds of ability come with the shared primitives (phase 3).
 */
import { GameEvent, GameState, ObjectId, Side } from './types';

/** What an effect can do to the game. Built by the engine for each resolution. */
export interface EffectContext {
  /** Draft state (mutable). */
  state: GameState;
  events: GameEvent[];
  /** The card whose ability is resolving. */
  source: ObjectId;
  endTheRun(): void;
  gainCredits(side: Side, amount: number): void;
  damage(kind: 'meat' | 'net' | 'core', amount: number): void;
}

export interface Subroutine {
  text: string;
  resolve(ctx: EffectContext): void;
}

/** Interface ability: pay `cost` credits to break `subs` subroutines of ice of subtype `breaks`. */
export interface BreakAbility {
  kind: 'break';
  /** Subtype id of the ice it can break (`barrier`, `code_gate`, `sentry`) or `any`. */
  breaks: string;
  subs: 1 | 'all';
  cost: number;
}

/** Pay `cost` credits for +`amount` strength until the end of the encounter / the run. */
export interface BoostAbility {
  kind: 'boost';
  cost: number;
  amount: number;
  until: 'encounter' | 'run';
}

export type IcebreakerAbility = BreakAbility | BoostAbility;

export interface CardDefinition {
  /** Ice: subroutines in order. */
  subroutines?: Subroutine[];
  /** Icebreaker: interface abilities. */
  abilities?: IcebreakerAbility[];
}

const registry = new Map<string, CardDefinition>();

export function defineCard(cardId: string, def: CardDefinition): void {
  registry.set(cardId, def);
}

export function getDefinition(cardId: string): CardDefinition {
  return registry.get(cardId) ?? {};
}

// Reusable subroutine effects.
export const endTheRun: Subroutine = { text: 'End the run.', resolve: (c) => c.endTheRun() };
export const netDamage = (n: number): Subroutine => ({
  text: `Do ${n} net damage.`,
  resolve: (c) => c.damage('net', n),
});
