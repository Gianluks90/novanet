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
import { Catalog, GameEvent, GameState, ObjectId, ServerId, Side } from './types';

export type VarValue = string | number | boolean | null;

export type CounterType = 'advancement' | 'virus' | 'power' | 'agenda' | 'credit';

export interface ChoiceOption {
  /** Object id, or a keyword such as 'yes' / 'no' / 'gain'. */
  value: number | string;
  label?: string;
}

export interface RunOptions {
  /** Key of the card's `runHooks` entry to apply to this run. */
  hook?: string;
  /** Added to the rez cost of every piece of ice during this run. */
  iceRezMod?: number;
  /** Credits the Runner can spend during this run only (like the bad publicity fund). */
  fund?: number;
}

/** What an effect can do to the game. Built by the engine for each instruction. */
export interface EffectContext {
  /** Draft state (mutable). */
  state: GameState;
  cat: Catalog;
  events: GameEvent[];
  /** The card whose ability is resolving. */
  source: ObjectId;
  /** Who controls the ability (the card's owner). */
  player: Side;
  vars: Record<string, VarValue>;
  /** The game event that triggered this ability (triggers only). */
  event?: GameEvent;

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
  derez(id: ObjectId): void;
  /** Runner installs a program/hardware/resource from the grip or stack, paying its cost. */
  installRunner(id: ObjectId): void;
  /** Corp installs a card from HQ/Archives (`new` makes a remote server), paying install costs. */
  installCorp(id: ObjectId, server: ServerId | 'new', opts?: { ignoreCost?: boolean }): void;
  /** Installs a piece of ice directly inward from the ice being encountered, ignoring costs. */
  installIceInward(id: ObjectId): void;
  swapIce(a: ObjectId, b: ObjectId): void;
  /** Object ids of a zone (see zones.ts `Z`). */
  zone(key: string): ObjectId[];
  cardOf(id: ObjectId): { cardId: string; type: string; cost?: number; subtypes: string[] };
  addCounter(id: ObjectId, type: CounterType, amount: number): void;
  counter(id: ObjectId, type: CounterType): number;
  /** Counter of the source card: live, or as it was when its cost was paid. */
  sourceCounter(type: CounterType): number;
  /** Loads credits onto a card ("load N credits": empty cards are trashed). */
  load(id: ObjectId, amount: number): void;
  /** Takes up to `amount` credits from a card to its owner. Returns the amount taken. */
  takeCredits(id: ObjectId, amount: number): number;
  /** The Runner starts a run (no click) with this effect's card hooks. */
  startRun(server: ServerId, opts?: RunOptions): void;
  /** The accessed card is trashed (for mid-access abilities). */
  trashAccessed(): void;
  /** The Runner cannot steal or trash Corp cards for the rest of the run. */
  forbidStealAndTrash(): void;
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
  /** Extra cost in clicks (bioroid ice). */
  clicks?: number;
  /** Extra cost: remove this many hosted counters of the type from the card. */
  hostedCounter?: CounterType;
  /** Not an interface ability: strength does not matter (trojans, bioroids). */
  ignoreStrength?: boolean;
  /** `self`: the ice itself (Runner pays); `host`: only the ice this card is hosted on. */
  scope?: 'self' | 'host';
  /** When this run ends, trash the card (Mayfly). */
  trashAtRunEnd?: boolean;
}

/** Pay `cost` credits for +`amount` strength until the end of the encounter / the run. */
export interface BoostAbility {
  kind: 'boost';
  cost: number;
  amount: number | ((s: GameState, cat: Catalog, self: ObjectId) => number);
  until: 'encounter' | 'run';
}

export type IcebreakerAbility = BreakAbility | BoostAbility;

export interface Cost {
  clicks?: number;
  credits?: number;
  trashSelf?: boolean;
  removeFromGame?: boolean;
  /** Remove `n` hosted counters of this type. */
  hosted?: { counter: CounterType; n: number };
}

/** A paid ability of an installed/active card (`cost: effect`). */
export interface PaidAbility {
  name: string;
  cost: Cost;
  /** When it can be used: the owner's action window (default), an encounter, a mid-access window. */
  during?: 'action' | 'encounter' | 'access';
  oncePerTurn?: boolean;
  canUse?: (s: GameState, cat: Catalog, self: ObjectId) => boolean;
  steps: Instruction[];
}

export interface TriggerInfo {
  s: GameState;
  cat: Catalog;
  ev: GameEvent;
  self: ObjectId;
  /** Server the card is in (installed cards), if any. */
  server: ServerId | null;
}

/** A conditional ability: fires when a matching game event happens while the card is active. */
export interface Trigger {
  on: string | string[];
  when?: (t: TriggerInfo) => boolean;
  oncePerTurn?: boolean;
  /** Still applies after the card has been trashed during the run (rest of the run). */
  persistent?: boolean;
  /** Also applies while the card is installed and unrezzed (ambush). */
  whileUnrezzed?: boolean;
  steps: Instruction[];
}

export interface RunHook {
  /** When the run is declared successful, before the breach. */
  onSuccess?: Instruction[];
}

export interface CardDefinition {
  /** Ice: subroutines in order. */
  subroutines?: Subroutine[];
  /** Icebreaker (and bioroid ice) interface abilities. */
  abilities?: IcebreakerAbility[];
  /** Paid abilities (click abilities, hosted counters, …). */
  paid?: PaidAbility[];
  triggers?: Trigger[];
  /** Run effects referenced by `RunOptions.hook`. */
  runHooks?: Record<string, RunHook>;
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
  /** This card's own install cost change (can be negative). */
  installCostMod?: (s: GameState, cat: Catalog) => number;
  /** Discount this active card gives to the install cost of another Runner card. */
  installDiscount?: (s: GameState, cat: Catalog, target: ObjectId, self: ObjectId) => number;
  /** Ice: extra strength (can read the game state). */
  strengthBonus?: (s: GameState, cat: Catalog, self: ObjectId) => number;
  /** Program: install only on a piece of ice. */
  installOnIce?: boolean;
  /** Draw this many more cards the first time each turn the Runner takes the basic draw action. */
  basicDrawBonus?: number;
  /** Extra random accesses the first time each turn the Runner breaches this server. */
  breachBonus?: (s: GameState, server: ServerId, self: ObjectId) => number;
  /** Credits are loaded onto the card: when it is empty it runs these steps (default: trash it). */
  emptySteps?: Instruction[];
  loadable?: boolean;
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
