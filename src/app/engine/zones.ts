import {
  CENTRALS,
  CardData,
  CardObject,
  Catalog,
  GameState,
  ObjectId,
  ServerId,
  Side,
} from './types';

// ---- Zone keys ------------------------------------------------------------------------------

export const Z = {
  hq: 'corp.hq',
  rd: 'corp.rd',
  archives: 'corp.archives',
  corpScore: 'corp.score',
  corpIdentity: 'corp.identity',
  grip: 'runner.grip',
  stack: 'runner.stack',
  heap: 'runner.heap',
  runnerScore: 'runner.score',
  rig: 'runner.rig',
  runnerIdentity: 'runner.identity',
  ice: (server: ServerId) => `ice:${server}`,
  root: (server: ServerId) => `root:${server}`,
} as const;

export const handZone = (s: Side) => (s === 'corp' ? Z.hq : Z.grip);
export const deckZone = (s: Side) => (s === 'corp' ? Z.rd : Z.stack);
export const discardZone = (s: Side) => (s === 'corp' ? Z.archives : Z.heap);
export const scoreZone = (s: Side) => (s === 'corp' ? Z.corpScore : Z.runnerScore);
export const identityZone = (s: Side) => (s === 'corp' ? Z.corpIdentity : Z.runnerIdentity);

export const isInstalledZone = (zone: string) =>
  zone === Z.rig || zone.startsWith('ice:') || zone.startsWith('root:');

/** Server of an `ice:` / `root:` zone key. */
export const serverOfZone = (zone: string): ServerId | null => {
  const i = zone.indexOf(':');
  return i < 0 ? null : zone.slice(i + 1);
};

// ---- Reading --------------------------------------------------------------------------------

export function zone(state: GameState, key: string): ObjectId[] {
  return state.zones[key] ?? [];
}

export function obj(state: GameState, id: ObjectId): CardObject {
  const o = state.objects[id];
  if (!o) throw new Error(`Unknown object ${id}`);
  return o;
}

export function data(state: GameState, catalog: Catalog, id: ObjectId): CardData {
  const o = obj(state, id);
  const d = catalog[o.cardId];
  if (!d) throw new Error(`Card ${o.cardId} is not in the catalog`);
  return d;
}

/** Existing servers: the three centrals plus remotes with at least one card. */
export function servers(state: GameState): ServerId[] {
  const remotes = new Set<ServerId>();
  for (const key of Object.keys(state.zones)) {
    if (!(key.startsWith('root:remote') || key.startsWith('ice:remote'))) continue;
    if ((state.zones[key] ?? []).length > 0) remotes.add(serverOfZone(key) as ServerId);
  }
  const sorted = [...remotes].sort((a, b) => Number(a.slice(6)) - Number(b.slice(6)));
  return [...CENTRALS, ...sorted];
}

export const isCentral = (server: ServerId) => (CENTRALS as readonly string[]).includes(server);

// ---- Random (mulberry32; the state lives in `rngState`) -------------------------------------

export function random(state: GameState): number {
  state.rngState = (state.rngState + 0x6d2b79f5) | 0;
  let t = state.rngState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randomInt(state: GameState, n: number): number {
  return Math.floor(random(state) * n);
}

export function shuffleZone(state: GameState, key: string): void {
  const arr = state.zones[key];
  if (!arr) return;
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(state, i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

// ---- Mutating (functions operate on a draft the engine owns) --------------------------------

export function createObject(
  state: GameState,
  cardId: string,
  owner: Side,
  zoneKey: string,
  opts: { faceUp?: boolean; position?: 'top' | 'bottom' } = {},
): ObjectId {
  const objectId = state.nextObjectId++;
  state.objects[objectId] = {
    objectId,
    cardId,
    owner,
    zone: zoneKey,
    faceUp: opts.faceUp ?? false,
    counters: { advancement: 0, virus: 0, power: 0, agenda: 0 },
    strengthMods: [],
  };
  const arr = (state.zones[zoneKey] ??= []);
  if (opts.position === 'bottom') arr.push(objectId);
  else arr.unshift(objectId);
  return objectId;
}

/**
 * Moves a card to another zone. The card becomes a new object (CR 1.12): counters are lost and
 * the returned id replaces the old one. `position` 'top' puts it first in the array (top of a
 * deck, outermost ice).
 */
export function moveObject(
  state: GameState,
  id: ObjectId,
  to: string,
  opts: { faceUp?: boolean; position?: 'top' | 'bottom' } = {},
): ObjectId {
  const old = obj(state, id);
  const from = state.zones[old.zone];
  if (from) {
    const i = from.indexOf(id);
    if (i >= 0) from.splice(i, 1);
    if (from.length === 0 && (old.zone.startsWith('ice:') || old.zone.startsWith('root:'))) {
      delete state.zones[old.zone];
    }
  }
  delete state.objects[id];
  return createObject(state, old.cardId, old.owner, to, opts);
}

/** Moves a card to its owner's discard pile: Archives facedown (or up when told) / Heap. */
export function discardObject(state: GameState, id: ObjectId, faceUp = false): ObjectId {
  const owner = obj(state, id).owner;
  return moveObject(state, id, discardZone(owner), {
    faceUp: owner === 'runner' ? true : faceUp,
  });
}

/** Draws the top card of a deck into the hand. Returns null when the deck is empty. */
export function drawTop(state: GameState, side: Side): ObjectId | null {
  const deck = zone(state, deckZone(side));
  if (deck.length === 0) return null;
  return moveObject(state, deck[0], handZone(side), { faceUp: false });
}
