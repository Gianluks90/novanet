/**
 * Helpers for engine tests: a small generic catalog, a scenario builder and a `play` function that
 * finds a legal command by (type, card) and applies it.
 */
import { advance, apply, emptyState, legalCommands } from './engine';
import { CardData, Catalog, Command, GameState, ObjectId, ServerId, Side } from './types';
import {
  Z,
  createObject,
  deckZone,
  discardZone,
  handZone,
  obj,
  zone,
} from './zones';

const cards: CardData[] = [
  { cardId: 'corp-id', title: 'Corp ID', side: 'corp', type: 'identity' },
  { cardId: 'runner-id', title: 'Runner ID', side: 'runner', type: 'identity', memoryLimit: 4 },
  { cardId: 'agenda-3-2', title: 'Agenda 3/2', side: 'corp', type: 'agenda', advancementRequirement: 3, agendaPoints: 2 },
  { cardId: 'agenda-4-3', title: 'Agenda 4/3', side: 'corp', type: 'agenda', advancementRequirement: 4, agendaPoints: 3 },
  { cardId: 'agenda-5-4', title: 'Agenda 5/4', side: 'corp', type: 'agenda', advancementRequirement: 5, agendaPoints: 4 },
  { cardId: 'asset-t3', title: 'Asset trash 3', side: 'corp', type: 'asset', cost: 2, trashCost: 3 },
  { cardId: 'asset-t9', title: 'Asset trash 9', side: 'corp', type: 'asset', cost: 2, trashCost: 9 },
  { cardId: 'upgrade-t2', title: 'Upgrade trash 2', side: 'corp', type: 'upgrade', cost: 1, trashCost: 2 },
  { cardId: 'ice-a', title: 'Ice A', side: 'corp', type: 'ice', cost: 3, strength: 2 },
  { cardId: 'ice-b', title: 'Ice B', side: 'corp', type: 'ice', cost: 2, strength: 1 },
  { cardId: 'op-2', title: 'Operation 2', side: 'corp', type: 'operation', cost: 2 },
  { cardId: 'op-0', title: 'Operation 0', side: 'corp', type: 'operation', cost: 0 },
  { cardId: 'prog-1', title: 'Program 1mu', side: 'runner', type: 'program', cost: 1, memory: 1 },
  { cardId: 'prog-2', title: 'Program 2mu', side: 'runner', type: 'program', cost: 2, memory: 2 },
  { cardId: 'prog-3', title: 'Program 3mu', side: 'runner', type: 'program', cost: 0, memory: 3 },
  { cardId: 'hw', title: 'Hardware', side: 'runner', type: 'hardware', cost: 1 },
  { cardId: 'res', title: 'Resource', side: 'runner', type: 'resource', cost: 1 },
  { cardId: 'event-1', title: 'Event 1', side: 'runner', type: 'event', cost: 1 },
  { cardId: 'event-0', title: 'Event 0', side: 'runner', type: 'event', cost: 0 },
];

export const TEST_CATALOG: Catalog = Object.fromEntries(cards.map((c) => [c.cardId, c]));

export interface PlacedCard {
  cardId: string;
  advancement?: number;
  faceUp?: boolean;
}
type CardSpec = string | PlacedCard;
const spec = (c: CardSpec): PlacedCard => (typeof c === 'string' ? { cardId: c } : c);

export interface ServerSetup {
  root?: CardSpec[];
  /** Outermost first. */
  ice?: CardSpec[];
}

export interface SideSetup {
  credits?: number;
  clicks?: number;
  hand?: string[];
  deck?: string[];
  discard?: string[];
  tags?: number;
  badPublicity?: number;
  extraAccess?: number;
  handSizeMod?: number;
  score?: string[];
}

export interface Setup {
  active?: Side;
  seed?: number;
  corp?: SideSetup & { servers?: Record<ServerId, ServerSetup> };
  runner?: SideSetup & { rig?: string[] };
}

/** Builds a mid-game state (turn 1, action phase) from a description, then `advance`s it. */
export function scenario(setup: Setup = {}): GameState {
  const s = emptyState(setup.seed ?? 7);
  s.turn = { number: 1, active: setup.active ?? 'corp', phase: 'action' };
  createObject(s, 'corp-id', 'corp', Z.corpIdentity, { faceUp: true });
  createObject(s, 'runner-id', 'runner', Z.runnerIdentity, { faceUp: true });

  for (const side of ['corp', 'runner'] as const) {
    const cfg: SideSetup = setup[side] ?? {};
    const p = s.players[side];
    p.credits = cfg.credits ?? 5;
    p.clicks = cfg.clicks ?? (s.turn.active === side ? (side === 'corp' ? 3 : 4) : 0);
    p.tags = cfg.tags ?? 0;
    p.badPublicity = cfg.badPublicity ?? 0;
    p.extraAccess = cfg.extraAccess ?? 0;
    p.handSizeMod = cfg.handSizeMod ?? 0;
    for (const id of cfg.hand ?? []) createObject(s, id, side, handZone(side), { position: 'bottom' });
    for (const id of cfg.deck ?? []) createObject(s, id, side, deckZone(side), { position: 'bottom' });
    for (const id of cfg.discard ?? []) {
      createObject(s, id, side, discardZone(side), { faceUp: side === 'runner', position: 'bottom' });
    }
    for (const id of cfg.score ?? []) {
      createObject(s, id, side, side === 'corp' ? Z.corpScore : Z.runnerScore, { faceUp: true });
    }
  }
  for (const id of setup.runner?.rig ?? []) createObject(s, id, 'runner', Z.rig, { faceUp: true });

  for (const [server, cfg] of Object.entries(setup.corp?.servers ?? {})) {
    const n = /^remote(\d+)$/.exec(server);
    if (n) s.nextRemote = Math.max(s.nextRemote, Number(n[1]));
    for (const c of (cfg.root ?? []).map(spec)) {
      const id = createObject(s, c.cardId, 'corp', Z.root(server), { faceUp: c.faceUp ?? false, position: 'bottom' });
      obj(s, id).counters.advancement = c.advancement ?? 0;
    }
    for (const c of (cfg.ice ?? []).map(spec)) {
      const id = createObject(s, c.cardId, 'corp', Z.ice(server), { faceUp: c.faceUp ?? false, position: 'bottom' });
      obj(s, id).counters.advancement = c.advancement ?? 0;
    }
  }
  advance(s, TEST_CATALOG, []);
  return s;
}

type Partial_ = { type: Command['type']; card?: string } & Record<string, unknown>;

/** Finds a legal command: same `type`, and the object (if `card`) is a card with that card id. */
export function findCommand(s: GameState, want: Partial_): Command | undefined {
  const { type, card, ...rest } = want;
  return legalCommands(s, TEST_CATALOG).find((c) => {
    if (c.type !== type) return false;
    const rec = c as unknown as Record<string, unknown>;
    if (card !== undefined) {
      const id = rec['objectId'] as ObjectId | undefined;
      if (id === undefined || obj(s, id).cardId !== card) return false;
    }
    return Object.entries(rest).every(([k, v]) => rec[k] === v);
  });
}

/** Applies a legal command described by (type, card, …) and returns the new state. */
export function play(s: GameState, type: Command['type'], extra: Record<string, unknown> = {}): GameState {
  const cmd = findCommand(s, { type, ...extra });
  if (!cmd) {
    const legal = legalCommands(s, TEST_CATALOG).map((c) => JSON.stringify(c)).join('\n  ');
    throw new Error(`No legal ${type} ${JSON.stringify(extra)}. Pending: ${JSON.stringify(s.pending)}\n  ${legal}`);
  }
  const r = apply(s, cmd, TEST_CATALOG);
  if (!r.ok) throw new Error(r.error);
  return r.state;
}

export function cardsIn(s: GameState, zoneKey: string): string[] {
  return zone(s, zoneKey).map((id) => obj(s, id).cardId);
}
