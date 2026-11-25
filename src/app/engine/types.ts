/**
 * Engine types. Everything in the state is plain serializable data (JSON): no classes, no
 * functions. See docs/engine-spec.md.
 */

export type Side = 'corp' | 'runner';
export const SIDES: readonly Side[] = ['corp', 'runner'];
export const other = (s: Side): Side => (s === 'corp' ? 'runner' : 'corp');

export type CardType =
  | 'identity'
  | 'agenda'
  | 'asset'
  | 'upgrade'
  | 'ice'
  | 'operation'
  | 'program'
  | 'hardware'
  | 'resource'
  | 'event';

/** Static card data the engine needs (read from the app's `Card` by `catalogFromCards`). */
export interface CardData {
  /** Slug shared by every printing. */
  cardId: string;
  title: string;
  side: Side;
  type: CardType;
  /** Rez cost (corp), play/install cost (runner). */
  cost?: number;
  advancementRequirement?: number;
  agendaPoints?: number;
  trashCost?: number;
  /** Memory cost of a program. */
  memory?: number;
  strength?: number;
  /** Identity: starting memory limit (default 4) and base link. */
  memoryLimit?: number;
  baseLink?: number;
  unique?: boolean;
  subtypes?: string[];
}

export type Catalog = Readonly<Record<string, CardData>>;

export type ObjectId = number;

/**
 * A game object (CR 1.12): a card in a zone. When a card changes zone it becomes a *new* object
 * (new `objectId`), so "once per turn" and the like start over. `cardId` is the stable card.
 */
export interface CardObject {
  objectId: ObjectId;
  cardId: string;
  owner: Side;
  /** Key of the zone array holding this object (see zones.ts). */
  zone: string;
  /** Corp installed cards: faceup = rezzed/active. Archives: faceup or facedown. Runner: always up. */
  faceUp: boolean;
  counters: { advancement: number; virus: number; power: number; agenda: number; credit: number };
  /** Runner programs installed on ice: the ice they are hosted on. */
  host?: ObjectId;
  /** Credits were loaded onto the card (it is trashed when they run out). */
  loaded?: boolean;
  /** Temporary strength modifiers (e.g. an icebreaker's boost) with their duration. */
  strengthMods: { amount: number; until: 'encounter' | 'run' }[];
}

/** Server ids: the three centrals and `remote1`, `remote2`, … */
export type ServerId = string;
export const CENTRALS = ['hq', 'rd', 'archives'] as const;

export interface PlayerState {
  credits: number;
  clicks: number;
  /** Credits from the bad publicity fund, usable only during a run. */
  fund: number;
  tags: number;
  badPublicity: number;
  /** Added to the base maximum hand size (5); core damage lowers it. */
  handSizeMod: number;
  memoryMod: number;
  /** Extra random accesses in HQ / R&D for the next breach (lasting for the run). */
  extraAccess: number;
  mulliganDone: boolean;
}

export type RunPhase =
  | 'initiation'
  | 'approach'
  | 'encounter'
  | 'movement'
  | 'server'
  | 'success';

export interface EncounterState {
  ice: ObjectId;
  /** Per subroutine (in order): broken during this encounter. */
  broken: boolean[];
  /** The unbroken subroutines are being resolved (or have been). */
  resolving: boolean;
}

export interface RunState {
  server: ServerId;
  phase: RunPhase;
  /** Index into the server's ice array (0 = outermost); `ice.length` = the server itself. */
  position: number;
  /** The run arrived at the Movement Phase after passing a piece of ice. */
  passedIce: boolean;
  successful: boolean;
  /** Effects from the card that started the run, applied when it succeeds. */
  hooks: { cardId: string; key: string; source: ObjectId }[];
  /** Added to the rez cost of every piece of ice during this run. */
  iceRezMod: number;
  /** Cards accessed / agendas stolen during this run. */
  accesses: number;
  stolen: number;
  /** The Runner cannot steal or trash Corp cards for the rest of the run. */
  noSteal: boolean;
  /** Cards to trash when the run ends. */
  trashAtEnd: ObjectId[];
  breached: boolean;
  /** The Corp has passed priority in the current (R) window. */
  windowPassed: boolean;
  encounter: EncounterState | null;
}

export interface BreachState {
  server: ServerId;
  /** Remaining random accesses (HQ/R&D). */
  slotsLeft: number;
  /** Objects already accessed during this breach. */
  accessed: ObjectId[];
  /** Card accessed and awaiting a trash decision. */
  current: ObjectId | null;
}

export type PendingKind =
  | 'mulligan'
  | 'action'
  | 'discard'
  | 'movement'
  | 'access'
  | 'trash'
  | 'memory'
  | 'rez'
  | 'encounter'
  | 'choice';

export interface Pending {
  player: Side;
  kind: PendingKind;
}

export interface TurnState {
  /** 0 before the first turn. */
  number: number;
  active: Side;
  phase: 'draw' | 'action' | 'discard';
}

/** An effect being resolved: its position and the answers given so far (all JSON). */
export interface Resolving {
  kind: 'play' | 'score' | 'steal' | 'subroutine' | 'trigger' | 'ability' | 'hook';
  cardId: string;
  source: ObjectId;
  /** Controller of the ability (the card's owner). */
  player: Side;
  /** Subroutine / trigger / ability index, or hook key. */
  key: string;
  /** The game event that fired a trigger. */
  event?: GameEvent;
  step: number;
  vars: Record<string, string | number | boolean | null>;
}

export interface ChoiceSpec {
  player: Side;
  name: string;
  options: { value: number | string; label?: string }[];
}

/** Things that happened this turn, for "this turn" / "last turn" conditions. */
export interface TurnStats {
  successfulRun: boolean;
  /** Printed agenda points of the agendas the Corp scored this turn. */
  scoredPoints: number;
  cannotScore: boolean;
  /** Objects installed this turn. */
  installed: ObjectId[];
  /** Once-per-turn abilities already used (`<objectId>:<kind><n>`). */
  fired: string[];
  /** Servers the Runner has run on this turn. */
  serversRun: ServerId[];
}

export type WinReason = 'agenda' | 'flatline' | 'decked' | 'draw';

export interface GameState {
  status: 'mulligan' | 'playing' | 'ended';
  rngState: number;
  nextObjectId: number;
  nextRemote: number;
  /** All objects by id. */
  objects: Record<ObjectId, CardObject>;
  /** Zone arrays of object ids; index 0 is the top of a deck / the outermost ice. */
  zones: Record<string, ObjectId[]>;
  players: Record<Side, PlayerState>;
  turn: TurnState;
  run: RunState | null;
  breach: BreachState | null;
  /** Cards whose abilities still apply for the rest of the run after being trashed (Persistent). */
  persist: { objectId: ObjectId; cardId: string; server: ServerId }[];
  /** Effects waiting to resolve or paused for a choice (head first). */
  effects: Resolving[];
  choice: ChoiceSpec | null;
  turnStats: TurnStats;
  prevTurnStats: TurnStats;
  pending: Pending | null;
  winner: Side | 'draw' | null;
  winReason: WinReason | null;
}

// ---- Commands -------------------------------------------------------------------------------

export type Command =
  | { type: 'mulligan'; player: Side; keep: boolean }
  // basic actions (both)
  | { type: 'gainCredit'; player: Side }
  | { type: 'drawCard'; player: Side }
  | { type: 'install'; player: Side; objectId: ObjectId; server?: ServerId | 'new'; host?: ObjectId }
  | { type: 'useAbility'; player: Side; objectId: ObjectId; ability: number }
  | { type: 'play'; player: Side; objectId: ObjectId }
  // corp
  | { type: 'advance'; player: 'corp'; objectId: ObjectId }
  | { type: 'score'; player: 'corp'; objectId: ObjectId }
  | { type: 'trashResource'; player: 'corp'; objectId: ObjectId }
  | { type: 'purge'; player: 'corp' }
  // runner
  | { type: 'run'; player: 'runner'; server: ServerId }
  | { type: 'removeTag'; player: 'runner' }
  // turn
  | { type: 'endTurn'; player: Side }
  | { type: 'discard'; player: Side; objectId: ObjectId }
  // run
  | { type: 'continue'; player: 'runner' }
  | { type: 'jackOut'; player: 'runner' }
  // breach
  | { type: 'access'; player: 'runner'; objectId?: ObjectId }
  | { type: 'trash'; player: 'runner' }
  | { type: 'decline'; player: 'runner' }
  // memory over the limit: trash an installed program
  | { type: 'trashProgram'; player: 'runner'; objectId: ObjectId }
  // rezzing (free action in the Corp's turn; in the (R) windows of a run)
  | { type: 'rez'; player: 'corp'; objectId: ObjectId }
  | { type: 'pass'; player: 'corp' }
  // encounter: an icebreaker's ability (index into its definition's abilities)
  | { type: 'break'; player: 'runner'; objectId: ObjectId; ability: number; subroutines?: number[] }
  // an answer to a choice an effect is waiting for
  | { type: 'choose'; player: Side; value: number | string }
  | { type: 'boost'; player: 'runner'; objectId: ObjectId; ability: number };

export type CommandType = Command['type'];

export interface GameEvent {
  type: string;
  player?: Side;
  objectId?: ObjectId;
  cardId?: string;
  amount?: number;
  server?: ServerId;
  detail?: string;
  data?: Record<string, number | string | boolean>;
}

export type ApplyResult =
  | { ok: true; state: GameState; events: GameEvent[] }
  | { ok: false; error: string };
