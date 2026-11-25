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
  counters: { advancement: number; virus: number; power: number; agenda: number };
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

export type RunPhase = 'approach' | 'movement' | 'success';

export interface RunState {
  server: ServerId;
  phase: RunPhase;
  /** Index into the server's ice array (0 = outermost); `ice.length` = the server itself. */
  position: number;
  /** The run arrived at the Movement Phase after passing a piece of ice. */
  passedIce: boolean;
  successful: boolean;
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
  | 'memory';

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
  | { type: 'install'; player: Side; objectId: ObjectId; server?: ServerId | 'new' }
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
  | { type: 'trashProgram'; player: 'runner'; objectId: ObjectId };

export type CommandType = Command['type'];

export interface GameEvent {
  type: string;
  player?: Side;
  objectId?: ObjectId;
  cardId?: string;
  amount?: number;
  server?: ServerId;
  detail?: string;
}

export type ApplyResult =
  | { ok: true; state: GameState; events: GameEvent[] }
  | { ok: false; error: string };
