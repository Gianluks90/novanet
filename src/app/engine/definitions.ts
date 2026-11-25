/**
 * Card definitions: the behaviour of cards, written by hand and keyed by `card_id` (slug). They
 * are code, never part of the game state.
 *
 * Effects are lists of **instructions**. The engine runs them one at a time and keeps the position
 * (and the answers to choices) in the serializable game state, so an effect can pause for a
 * decision and resume. Rules for writing an instruction:
 *  - it may be called again after a choice is answered, so call `ctx.choose(...)` *before* any
 *    side effect and `return` right away when it gives `undefined`;
 *  - everything else it needs to remember goes in `ctx.vars`.
 */
import { Catalog, GameEvent, GameState, ObjectId, Side } from './types';

export type VarValue = string | number | boolean | null;

export interface ChoiceOption {
  /** Object id, or a keyword such as 'yes' / 'no' / 'gain'. */
  value: number | string;
  label?: string;
}

/** What an effect can do to the game. Built by the engine for each instruction. */
export interface EffectContext {
  /** Draft state (mutable). */
  state: GameState;
  cat: Catalog;
  events: GameEvent[];
  /** The card whose ability is resolving. */
  source: ObjectId;
  /** Who controls the ability (the one who plays / scores / owns the ice's side). */
  player: Side;
  vars: Record<string, VarValue>;

  /**
   * Asks `who` to pick one of `options`. Returns the answer once given, `null` when there are no
   * options, and `undefined` while the choice is pending (the instruction must return).
   * A single option is taken automatically.
   */
  choose(name: string, who: Side, options: ChoiceOption[]): number | string | null | undefined;

  endTheRun(): void;
  jackOut(): void;
  gainCredits(side: Side, amount: number): void;
  /** Returns the credits actually lost. */
  loseCredits(side: Side, amount: number): number;
  draw(side: Side, amount: number): void;
  giveTag(amount: number): void;
  gainClicks(side: Side, amount: number): void;
  loseClicks(side: Side, amount: number): void;
  /** Returns the card ids trashed. */
  damage(kind: 'meat' | 'net' | 'core', amount: number): string[];
  /** Trashes a card (heap / Archives; Corp cards keep faceup status unless installed unrezzed). */
  trash(id: ObjectId): void;
  /** Moves a card from anywhere into the owner's hand. */
  addToHand(id: ObjectId): void;
  /** Puts a card on top of its owner's deck (call `shuffleDeck` afterwards when needed). */
  moveToDeck(id: ObjectId): void;
  shuffleDeck(side: Side): void;
  addAdvancement(id: ObjectId, amount: number): void;
  rez(id: ObjectId, opts?: { ignoreCost?: boolean }): void;
  /** Runner installs a program/hardware/resource from the grip or stack, paying its cost. */
  installRunner(id: ObjectId): void;
  /** Object ids of a zone (see zones.ts `Z`). */
  zone(key: string): ObjectId[];
  cardOf(id: ObjectId): { cardId: string; type: string; cost?: number; subtypes: string[] };
}

export type Instruction = (ctx: EffectContext) => void;

export interface Subroutine {
  text: string;
  steps: Instruction[];
}

/**
 * Interface ability: pay `cost` credits to break up to `subs` subroutines of ice of subtype
 * `breaks` (`any` for all ice).
 */
export interface BreakAbility {
  kind: 'break';
  breaks: string;
  subs: number | 'all';
  cost: number | ((s: GameState) => number);
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
  /** Event/operation: instructions run when played (the card is trashed afterwards). */
  onPlay?: Instruction[];
  /** Extra play condition (besides cost). */
  canPlay?: (s: GameState, cat: Catalog, player: Side) => boolean;
  /** Agenda: "when you score this agenda". */
  onScore?: Instruction[];
  /** Agenda: "when this agenda is stolen". */
  onSteal?: Instruction[];
  /** Static bonuses while the card is active (the owner's side). */
  static?: { handSize?: number; memory?: number };
  /** Runner program: install cost change (can be negative). */
  installCostMod?: (s: GameState, cat: Catalog) => number;
}

const registry = new Map<string, CardDefinition>();

export function defineCard(cardId: string, def: CardDefinition): void {
  registry.set(cardId, def);
}

export function getDefinition(cardId: string): CardDefinition {
  return registry.get(cardId) ?? {};
}

// ---- Reusable subroutines -------------------------------------------------------------------

export const endTheRun: Subroutine = {
  text: 'End the run.',
  steps: [(c) => c.endTheRun()],
};

export const netDamage = (n: number): Subroutine => ({
  text: `Do ${n} net damage.`,
  steps: [(c) => void c.damage('net', n)],
});
