/**
 * Engine core (phase 1, no card abilities): setup, turn structure, basic actions, runs without
 * encounters, breach/access, win and flatline. See docs/engine-spec.md.
 *
 * Model: `apply(state, command)` validates the command against `legalCommands(state)` (the single
 * source of truth), runs it on a private copy of the state, then `advance` walks the game forward
 * until a player must decide something (`state.pending`), auto-passing priority windows in which
 * nobody has options. States are never mutated from the outside.
 */
import {
  ApplyResult,
  CardData,
  Catalog,
  Command,
  GameEvent,
  GameState,
  ObjectId,
  PlayerState,
  Resolving,
  ServerId,
  TurnStats,
  Side,
  other,
} from './types';
import {
  BreakAbility,
  ChoiceOption,
  Cost,
  CounterType,
  EffectContext,
  RunOptions,
  IcebreakerAbility,
  Instruction,
  getDefinition,
} from './definitions';
import {
  Z,
  createObject,
  data,
  deckZone,
  discardObject,
  drawTop,
  handZone,
  identityZone,
  isCentral,
  isInstalledZone,
  moveObject,
  obj,
  randomInt,
  scoreZone,
  serverOfZone,
  servers,
  shuffleZone,
  zone,
} from './zones';

export const STARTING_CREDITS = 5;
export const STARTING_HAND = 5;
export const BASE_HAND_SIZE = 5;
export const BASE_MEMORY = 4;
export const AGENDA_POINTS_TO_WIN = 7;
export const CLICKS: Record<Side, number> = { corp: 3, runner: 4 };

export interface DeckList {
  identity: string;
  /** Card ids (slugs), one entry per copy. */
  cards: string[];
}

export interface NewGameOptions {
  corp: DeckList;
  runner: DeckList;
  seed?: number;
  /** Do not shuffle: the first card of each list is the top of the deck (tutorials). */
  stacked?: boolean;
  /** Skip the mulligan decisions (both players keep their hand). */
  skipMulligan?: boolean;
}

const newPlayer = (): PlayerState => ({
  credits: STARTING_CREDITS,
  clicks: 0,
  fund: 0,
  tags: 0,
  badPublicity: 0,
  handSizeMod: 0,
  memoryMod: 0,
  extraAccess: 0,
  mulliganDone: false,
});

const newTurnStats = (): TurnStats => ({
  successfulRun: false,
  scoredPoints: 0,
  cannotScore: false,
  installed: [],
  fired: [],
  serversRun: [],
});

/** An empty game state (no cards), the base of `createGame` and of test scenarios. */
export function emptyState(seed = 1): GameState {
  return {
    status: 'playing',
    rngState: seed | 0,
    nextObjectId: 1,
    nextRemote: 0,
    objects: {},
    zones: {},
    players: { corp: newPlayer(), runner: newPlayer() },
    turn: { number: 0, active: 'corp', phase: 'action' },
    run: null,
    breach: null,
    persist: [],
    effects: [],
    choice: null,
    turnStats: newTurnStats(),
    prevTurnStats: newTurnStats(),
    pending: null,
    winner: null,
    winReason: null,
  };
}

// ---- Derived values -------------------------------------------------------------------------

/** Objects whose static abilities apply to `side` (identity, score area, rig, rezzed cards). */
function activeObjects(s: GameState, side: Side): ObjectId[] {
  const ids = [...zone(s, identityZone(side)), ...zone(s, scoreZone(side))];
  if (side === 'runner') ids.push(...zone(s, Z.rig));
  else ids.push(...installedCorpCards(s).filter((id) => obj(s, id).faceUp));
  return ids;
}

function staticSum(s: GameState, side: Side, key: 'handSize' | 'memory'): number {
  return activeObjects(s, side).reduce(
    (n, id) => n + (getDefinition(obj(s, id).cardId).static?.[key] ?? 0),
    0,
  );
}

export const handLimit = (s: GameState, side: Side) =>
  BASE_HAND_SIZE + s.players[side].handSizeMod + staticSum(s, side, 'handSize');

export function agendaPoints(s: GameState, cat: Catalog, side: Side): number {
  return zone(s, scoreZone(side)).reduce((n, id) => n + (data(s, cat, id).agendaPoints ?? 0), 0);
}

export function memoryUsed(s: GameState, cat: Catalog): number {
  return zone(s, Z.rig).reduce((n, id) => {
    const d = data(s, cat, id);
    return n + (d.type === 'program' ? (d.memory ?? 0) : 0);
  }, 0);
}

export function memoryLimit(s: GameState, cat: Catalog): number {
  const idId = zone(s, Z.runnerIdentity)[0];
  const base = idId === undefined ? BASE_MEMORY : (data(s, cat, idId).memoryLimit ?? BASE_MEMORY);
  return base + s.players.runner.memoryMod + staticSum(s, 'runner', 'memory');
}

/** Credits a player can spend now (the runner also has the bad publicity fund during a run). */
export function availableCredits(s: GameState, side: Side): number {
  return s.players[side].credits + (side === 'runner' && s.run ? s.players[side].fund : 0);
}

function pay(s: GameState, side: Side, amount: number): void {
  if (side === 'runner' && s.run) {
    const fromFund = Math.min(s.players.runner.fund, amount);
    s.players.runner.fund -= fromFund;
    amount -= fromFund;
  }
  s.players[side].credits -= amount;
}

function iceCount(s: GameState, server: ServerId): number {
  return zone(s, Z.ice(server)).length;
}

/** Current strength: printed value plus the temporary modifiers. */
export function strengthOf(s: GameState, cat: Catalog, id: ObjectId): number {
  const base = data(s, cat, id).strength ?? 0;
  const bonus = getDefinition(obj(s, id).cardId).strengthBonus?.(s, cat, id) ?? 0;
  return obj(s, id).strengthMods.reduce((n, m) => n + m.amount, base + bonus);
}

/** Install cost for the Runner, with the card's own modifier. */
export function runnerInstallCost(s: GameState, cat: Catalog, id: ObjectId): number {
  const d = data(s, cat, id);
  const mod = getDefinition(d.cardId).installCostMod?.(s, cat) ?? 0;
  const discounts = zone(s, Z.rig).reduce(
    (n, other) =>
      n + (getDefinition(obj(s, other).cardId).installDiscount?.(s, cat, id, other) ?? 0),
    0,
  );
  return Math.max(0, (d.cost ?? 0) + mod - discounts);
}

const abilityCost = (s: GameState, ab: BreakAbility) =>
  typeof ab.cost === 'function' ? ab.cost(s) : ab.cost;

/** Non-empty subsets of `items` with at most `max` elements, in order. */
function subsets(items: number[], max: number): number[][] {
  const out: number[][] = [];
  const walk = (start: number, cur: number[]) => {
    if (cur.length > 0) out.push([...cur]);
    if (cur.length === max) return;
    for (let i = start; i < items.length; i++) walk(i + 1, [...cur, items[i]]);
  };
  walk(0, []);
  return out;
}

const rezCost = (s: GameState, cat: Catalog, id: ObjectId) => {
  const d = data(s, cat, id);
  return (d.cost ?? 0) + (d.type === 'ice' && s.run ? s.run.iceRezMod : 0);
};

const isUnrezzedRezzable = (s: GameState, cat: Catalog, id: ObjectId, withIce: boolean) => {
  const o = obj(s, id);
  if (o.faceUp || !(o.zone.startsWith('root:') || o.zone.startsWith('ice:'))) return false;
  const t = data(s, cat, id).type;
  return t === 'asset' || t === 'upgrade' || (withIce && t === 'ice');
};

/** Cards the Corp could rez now (assets/upgrades; the ice at the run position if `withIce`). */
function rezOptions(s: GameState, cat: Catalog, withIce: boolean): ObjectId[] {
  const credits = s.players.corp.credits;
  const out = installedCorpCards(s).filter(
    (id) => isUnrezzedRezzable(s, cat, id, false) && rezCost(s, cat, id) <= credits,
  );
  if (withIce && s.run) {
    const ice = zone(s, Z.ice(s.run.server))[s.run.position];
    if (ice !== undefined && isUnrezzedRezzable(s, cat, ice, true) && rezCost(s, cat, ice) <= credits) {
      out.push(ice);
    }
  }
  return out;
}

function breaksIce(cat: Catalog, ab: IcebreakerAbility, s: GameState, ice: ObjectId): boolean {
  if (ab.kind !== 'break') return false;
  return ab.breaks === 'any' || (data(s, cat, ice).subtypes ?? []).includes(ab.breaks);
}

function canPayCost(s: GameState, player: Side, id: ObjectId, cost: Cost): boolean {
  if ((cost.clicks ?? 0) > s.players[player].clicks) return false;
  if ((cost.credits ?? 0) > availableCredits(s, player)) return false;
  if (cost.hosted && obj(s, id).counters[cost.hosted.counter] < cost.hosted.n) return false;
  return true;
}

function payCost(s: GameState, player: Side, id: ObjectId, cost: Cost): void {
  spendClicks(s, player, cost.clicks ?? 0);
  pay(s, player, cost.credits ?? 0);
  if (cost.hosted) obj(s, id).counters[cost.hosted.counter] -= cost.hosted.n;
  if (cost.trashSelf) discardObject(s, id, obj(s, id).faceUp);
  else if (cost.removeFromGame) moveObject(s, id, Z.removed, { faceUp: true });
}

const firedKey = (id: ObjectId, kind: string, n: number | string) => `${id}:${kind}${n}`;

/** `useAbility` commands for the paid abilities of `player`'s active cards usable `during`. */
function paidAbilityCommands(
  s: GameState,
  cat: Catalog,
  player: Side,
  during: 'action' | 'encounter' | 'access',
): Command[] {
  const out: Command[] = [];
  for (const id of activeObjects(s, player)) {
    (getDefinition(obj(s, id).cardId).paid ?? []).forEach((ab, ability) => {
      if ((ab.during ?? 'action') !== during) return;
      if (ab.oncePerTurn && s.turnStats.fired.includes(firedKey(id, 'ab', ability))) return;
      if (!canPayCost(s, player, id, ab.cost)) return;
      if (ab.canUse && !ab.canUse(s, cat, id)) return;
      out.push({ type: 'useAbility', player, objectId: id, ability });
    });
  }
  return out;
}

/** Runner commands during the 'encounter' window (always includes `continue`). */
function encounterCommands(s: GameState, cat: Catalog): Command[] {
  const enc = s.run?.encounter;
  const out: Command[] = [{ type: 'continue', player: 'runner' }];
  if (!enc || !(enc.ice in s.objects)) return out;
  out.push(...paidAbilityCommands(s, cat, 'runner', 'encounter'));
  const unbroken = enc.broken.flatMap((b, i) => (b ? [] : [i]));
  if (unbroken.length === 0) return out;
  const credits = availableCredits(s, 'runner');
  const clicks = s.players.runner.clicks;
  const iceStrength = strengthOf(s, cat, enc.ice);
  for (const breaker of [...zone(s, Z.rig), enc.ice]) {
    const isIce = breaker === enc.ice;
    const abilities = getDefinition(obj(s, breaker).cardId).abilities ?? [];
    const strength = strengthOf(s, cat, breaker);
    const canBreakThis = abilities.some((a) => breaksIce(cat, a, s, enc.ice));
    abilities.forEach((ab, ability) => {
      if (ab.kind === 'break') {
        if (ab.scope === 'self' ? !isIce : ab.scope === 'host' ? obj(s, breaker).host !== enc.ice : isIce) return;
        if (abilityCost(s, ab) > credits || (ab.clicks ?? 0) > clicks) return;
        if (ab.hostedCounter && obj(s, breaker).counters[ab.hostedCounter] < 1) return;
        if (!breaksIce(cat, ab, s, enc.ice)) return;
        if (!ab.ignoreStrength && strength < iceStrength) return;
        if (ab.subs === 'all') {
          out.push({ type: 'break', player: 'runner', objectId: breaker, ability });
        } else {
          for (const subroutines of subsets(unbroken, ab.subs)) {
            out.push({ type: 'break', player: 'runner', objectId: breaker, ability, subroutines });
          }
        }
      } else if (!isIce && ab.cost <= credits && canBreakThis && strength < iceStrength) {
        // Only boosts that are still needed to interface with this ice.
        out.push({ type: 'boost', player: 'runner', objectId: breaker, ability });
      }
    });
  }
  return out;
}

/** Can the Runner trash the card being accessed by paying its trash cost? */
function canTrashNormally(s: GameState, cat: Catalog, id: ObjectId): boolean {
  const d = data(s, cat, id);
  return (
    !s.run?.noSteal &&
    obj(s, id).zone.startsWith('root:') &&
    d.trashCost !== undefined &&
    availableCredits(s, 'runner') >= d.trashCost
  );
}

// ---- Legal commands -------------------------------------------------------------------------

function sameCommand(a: Command, b: Command): boolean {
  const ea = Object.entries(a).filter(([, v]) => v !== undefined);
  const eb = Object.entries(b).filter(([, v]) => v !== undefined);
  if (ea.length !== eb.length) return false;
  const rec = b as unknown as Record<string, unknown>;
  return ea.every(([k, v]) => JSON.stringify(rec[k]) === JSON.stringify(v));
}

export function installedCorpCards(s: GameState): ObjectId[] {
  return Object.keys(s.zones)
    .filter((k) => k.startsWith('root:') || k.startsWith('ice:'))
    .flatMap((k) => zone(s, k));
}

/** Commands of the active player during the action phase (without `endTurn`). */
function actionCommands(s: GameState, cat: Catalog): Command[] {
  const player = s.turn.active;
  const p = s.players[player];
  const out: Command[] = [];
  const credits = availableCredits(s, player);
  const hand = zone(s, handZone(player));

  if (p.clicks >= 1) {
    out.push({ type: 'gainCredit', player });
    if (player === 'corp' || zone(s, Z.stack).length > 0) out.push({ type: 'drawCard', player });

    for (const id of hand) {
      const d = data(s, cat, id);
      if (player === 'corp') {
        if (
          d.type === 'operation' &&
          (d.cost ?? 0) <= credits &&
          (getDefinition(d.cardId).canPlay?.(s, cat, player) ?? true)
        ) {
          out.push({ type: 'play', player, objectId: id });
        }
        if (d.type === 'agenda' || d.type === 'asset') {
          for (const sv of servers(s).filter((x) => !isCentral(x))) {
            out.push({ type: 'install', player, objectId: id, server: sv });
          }
          out.push({ type: 'install', player, objectId: id, server: 'new' });
        }
        if (d.type === 'upgrade') {
          for (const sv of servers(s)) out.push({ type: 'install', player, objectId: id, server: sv });
          out.push({ type: 'install', player, objectId: id, server: 'new' });
        }
        if (d.type === 'ice') {
          for (const sv of servers(s)) {
            if (iceCount(s, sv) <= credits) {
              out.push({ type: 'install', player, objectId: id, server: sv });
            }
          }
          out.push({ type: 'install', player, objectId: id, server: 'new' });
        }
      } else {
        if (
          d.type === 'event' &&
          (d.cost ?? 0) <= credits &&
          (getDefinition(d.cardId).canPlay?.(s, cat, player) ?? true)
        ) {
          out.push({ type: 'play', player, objectId: id });
        }
        if (
          (d.type === 'program' || d.type === 'hardware' || d.type === 'resource') &&
          runnerInstallCost(s, cat, id) <= credits
        ) {
          if (getDefinition(d.cardId).installOnIce) {
            for (const host of installedCorpCards(s).filter((x) => data(s, cat, x).type === 'ice')) {
              out.push({ type: 'install', player, objectId: id, host });
            }
          } else {
            out.push({ type: 'install', player, objectId: id });
          }
        }
      }
    }

    if (player === 'corp') {
      if (credits >= 1) {
        for (const id of installedCorpCards(s)) out.push({ type: 'advance', player, objectId: id });
      }
      if (p.clicks >= 3) out.push({ type: 'purge', player });
      if (credits >= 2 && s.players.runner.tags >= 1) {
        for (const id of zone(s, Z.rig)) {
          if (data(s, cat, id).type === 'resource') {
            out.push({ type: 'trashResource', player, objectId: id });
          }
        }
      }
    } else {
      for (const sv of servers(s)) out.push({ type: 'run', player: 'runner', server: sv });
      if (credits >= 2 && p.tags >= 1) out.push({ type: 'removeTag', player: 'runner' });
    }
  }

  out.push(...paidAbilityCommands(s, cat, player, 'action'));

  // Rezzing assets/upgrades is free (no click) in the Corp's own turn.
  if (player === 'corp') {
    for (const id of rezOptions(s, cat, false)) {
      out.push({ type: 'rez', player: 'corp', objectId: id });
    }
  }

  // Scoring does not cost a click: it can happen whenever the Corp has priority in its turn.
  if (player === 'corp' && !s.turnStats.cannotScore) {
    for (const sv of servers(s).filter((x) => !isCentral(x))) {
      for (const id of zone(s, Z.root(sv))) {
        const d = data(s, cat, id);
        if (
          d.type === 'agenda' &&
          obj(s, id).counters.advancement >= (d.advancementRequirement ?? Infinity)
        ) {
          out.push({ type: 'score', player: 'corp', objectId: id });
        }
      }
    }
  }
  return out;
}

interface AccessCandidate {
  objectId?: ObjectId;
}

function accessCandidates(s: GameState): AccessCandidate[] {
  const b = s.breach;
  if (!b) return [];
  const done = new Set(b.accessed);
  const out: AccessCandidate[] = zone(s, Z.root(b.server))
    .filter((id) => !done.has(id))
    .map((objectId) => ({ objectId }));
  if (b.server === 'archives') {
    for (const id of zone(s, Z.archives)) if (!done.has(id)) out.push({ objectId: id });
  } else if (b.server === 'hq' || b.server === 'rd') {
    const pool = zone(s, b.server === 'hq' ? Z.hq : Z.rd);
    if (b.slotsLeft > 0 && pool.some((id) => !done.has(id))) out.push({});
  }
  return out;
}

export function legalCommands(s: GameState, cat: Catalog): Command[] {
  if (s.status === 'ended' || !s.pending) return [];
  const { kind, player } = s.pending;
  switch (kind) {
    case 'mulligan':
      return [
        { type: 'mulligan', player, keep: true },
        { type: 'mulligan', player, keep: false },
      ];
    case 'action':
      return [...actionCommands(s, cat), { type: 'endTurn', player }];
    case 'discard':
      return zone(s, handZone(player)).map(
        (objectId) => ({ type: 'discard', player, objectId }) as Command,
      );
    case 'movement':
      return [
        { type: 'continue', player: 'runner' },
        { type: 'jackOut', player: 'runner' },
      ];
    case 'access':
      return accessCandidates(s).map(
        (c) => ({ type: 'access', player: 'runner', objectId: c.objectId }) as Command,
      );
    case 'trash': {
      const cur = s.breach?.current;
      const out: Command[] = [{ type: 'decline', player: 'runner' }];
      if (cur !== null && cur !== undefined && canTrashNormally(s, cat, cur)) {
        out.unshift({ type: 'trash', player: 'runner' });
      }
      return [...out, ...paidAbilityCommands(s, cat, 'runner', 'access')];
    }
    case 'rez':
      return [
        ...rezOptions(s, cat, s.run?.phase === 'approach').map(
          (objectId) => ({ type: 'rez', player: 'corp', objectId }) as Command,
        ),
        { type: 'pass', player: 'corp' } as Command,
      ];
    case 'encounter':
      return encounterCommands(s, cat);
    case 'choice':
      return (s.choice?.options ?? []).map(
        (o) => ({ type: 'choose', player, value: o.value }) as Command,
      );
    case 'memory':
      return zone(s, Z.rig)
        .filter((id) => data(s, cat, id).type === 'program')
        .map((objectId) => ({ type: 'trashProgram', player: 'runner', objectId }) as Command);
  }
}

// ---- Apply ----------------------------------------------------------------------------------

export function apply(state: GameState, command: Command, cat: Catalog): ApplyResult {
  if (state.status === 'ended') return { ok: false, error: 'The game is over' };
  const legal = legalCommands(state, cat);
  if (!legal.some((c) => sameCommand(c, command))) {
    return { ok: false, error: `Illegal command: ${JSON.stringify(command)}` };
  }
  const draft = structuredClone(state);
  const events: GameEvent[] = [];
  execute(draft, cat, command, events);
  advance(draft, cat, events);
  return { ok: true, state: draft, events };
}

/** Runs a draft-level function on a copy of the state and then `advance`s (tests, card effects). */
export function mutate(
  state: GameState,
  cat: Catalog,
  fn: (draft: GameState, events: GameEvent[]) => void,
): { state: GameState; events: GameEvent[] } {
  const draft = structuredClone(state);
  const events: GameEvent[] = [];
  fn(draft, events);
  advance(draft, cat, events);
  return { state: draft, events };
}

function spendClicks(s: GameState, side: Side, n: number): void {
  s.players[side].clicks -= n;
}

function declareWin(s: GameState, winner: Side | 'draw', reason: GameState['winReason']): void {
  if (s.status === 'ended' && s.winner !== winner) {
    s.winner = 'draw';
    s.winReason = 'draw';
    return;
  }
  s.status = 'ended';
  s.winner = winner;
  s.winReason = reason;
}

export function draw(s: GameState, side: Side, n: number, events: GameEvent[]): void {
  for (let i = 0; i < n; i++) {
    const id = drawTop(s, side);
    if (id === null) {
      // The Corp must draw from an empty R&D: the Runner wins. (An empty stack does nothing.)
      if (side === 'corp') declareWin(s, 'runner', 'decked');
      return;
    }
    events.push({ type: 'draw', player: side, objectId: id });
  }
}

export type DamageKind = 'meat' | 'net' | 'core';

/** Damage to the Runner (CR 10.4): random cards from the grip; more than the grip = flatline. */
export function dealDamage(
  s: GameState,
  kind: DamageKind,
  amount: number,
  events: GameEvent[],
): string[] {
  const trashed: string[] = [];
  if (amount <= 0) return trashed;
  const gripSize = zone(s, Z.grip).length;
  const n = Math.min(amount, gripSize);
  for (let i = 0; i < n; i++) {
    const g = zone(s, Z.grip);
    const id = g[randomInt(s, g.length)];
    const cardId = obj(s, id).cardId;
    discardObject(s, id);
    trashed.push(cardId);
    events.push({ type: 'damage', player: 'runner', cardId, detail: kind });
  }
  if (kind === 'core') s.players.runner.handSizeMod -= amount;
  if (amount > gripSize) declareWin(s, 'corp', 'flatline');
  return trashed;
}

function execute(s: GameState, cat: Catalog, c: Command, events: GameEvent[]): void {
  switch (c.type) {
    case 'mulligan': {
      if (!c.keep) {
        for (const id of [...zone(s, handZone(c.player))]) {
          moveObject(s, id, deckZone(c.player));
        }
        shuffleZone(s, deckZone(c.player));
        draw(s, c.player, STARTING_HAND, events);
        events.push({ type: 'mulligan', player: c.player });
      }
      s.players[c.player].mulliganDone = true;
      return;
    }
    case 'gainCredit':
      spendClicks(s, c.player, 1);
      s.players[c.player].credits += 1;
      events.push({ type: 'gainCredits', player: c.player, amount: 1 });
      return;
    case 'drawCard': {
      spendClicks(s, c.player, 1);
      let n = 1;
      if (c.player === 'runner') {
        for (const id of zone(s, Z.rig)) {
          const bonus = getDefinition(obj(s, id).cardId).basicDrawBonus ?? 0;
          if (bonus > 0 && !s.turnStats.fired.includes(firedKey(id, 'draw', 0))) {
            s.turnStats.fired.push(firedKey(id, 'draw', 0));
            n += bonus;
          }
        }
      }
      draw(s, c.player, n, events);
      return;
    }
    case 'install':
      return install(s, cat, c, events);
    case 'play': {
      spendClicks(s, c.player, 1);
      const d = data(s, cat, c.objectId);
      pay(s, c.player, d.cost ?? 0);
      const id = moveObject(s, c.objectId, Z.play, { faceUp: true });
      events.push({ type: 'play', player: c.player, objectId: id, cardId: d.cardId });
      queueEffect(s, 'play', id);
      return;
    }
    case 'advance':
      spendClicks(s, 'corp', 1);
      pay(s, 'corp', 1);
      events.push({
        type: 'advance',
        player: 'corp',
        objectId: c.objectId,
        amount: obj(s, c.objectId).counters.advancement,
      });
      obj(s, c.objectId).counters.advancement += 1;
      return;
    case 'score': {
      const o = obj(s, c.objectId);
      const d = data(s, cat, c.objectId);
      const id = moveObject(s, c.objectId, scoreZone('corp'), { faceUp: true });
      s.turnStats.scoredPoints += d.agendaPoints ?? 0;
      events.push({
        type: 'score',
        player: 'corp',
        objectId: id,
        cardId: o.cardId,
        server: serverOfZone(o.zone) ?? undefined,
      });
      queueEffect(s, 'score', id);
      return;
    }
    case 'trashResource':
      spendClicks(s, 'corp', 1);
      pay(s, 'corp', 2);
      discardObject(s, c.objectId, true);
      events.push({ type: 'trashResource', player: 'corp', objectId: c.objectId });
      return;
    case 'purge':
      spendClicks(s, 'corp', 3);
      for (const o of Object.values(s.objects)) o.counters.virus = 0;
      events.push({ type: 'purge', player: 'corp' });
      return;
    case 'removeTag':
      spendClicks(s, 'runner', 1);
      pay(s, 'runner', 2);
      s.players.runner.tags -= 1;
      events.push({ type: 'removeTag', player: 'runner', amount: 1 });
      return;
    case 'run':
      spendClicks(s, 'runner', 1);
      beginRun(s, c.server, events, {});
      return;
    case 'endTurn':
      s.players[c.player].clicks = 0;
      s.turn.phase = 'discard';
      return;
    case 'discard': {
      const cardId = obj(s, c.objectId).cardId;
      discardObject(s, c.objectId);
      events.push({ type: 'discard', player: c.player, cardId });
      return;
    }
    case 'continue':
      if (s.pending?.kind === 'encounter') return finishEncounter(s);
      return moveInward(s, events);
    case 'rez':
      pay(s, 'corp', rezCost(s, cat, c.objectId));
      obj(s, c.objectId).faceUp = true;
      events.push({
        type: 'rez',
        player: 'corp',
        objectId: c.objectId,
        cardId: obj(s, c.objectId).cardId,
      });
      return;
    case 'pass':
      if (s.run) s.run.windowPassed = true;
      return;
    case 'break': {
      const enc = s.run?.encounter;
      if (!enc) return;
      const ab = (getDefinition(obj(s, c.objectId).cardId).abilities ?? [])[c.ability];
      if (!ab || ab.kind !== 'break') return;
      pay(s, 'runner', abilityCost(s, ab));
      spendClicks(s, 'runner', ab.clicks ?? 0);
      if (ab.hostedCounter) obj(s, c.objectId).counters[ab.hostedCounter] -= 1;
      if (ab.trashAtRunEnd && s.run) s.run.trashAtEnd.push(c.objectId);
      if (c.subroutines === undefined) enc.broken = enc.broken.map(() => true);
      else for (const i of c.subroutines) enc.broken[i] = true;
      events.push({
        type: 'break',
        player: 'runner',
        objectId: c.objectId,
        detail: (c.subroutines ?? ['all']).join(','),
      });
      return;
    }
    case 'choose': {
      const eff = s.effects[0];
      if (eff && s.choice) eff.vars[s.choice.name] = c.value;
      s.choice = null;
      return;
    }
    case 'boost': {
      const ab = (getDefinition(obj(s, c.objectId).cardId).abilities ?? [])[c.ability];
      if (!ab || ab.kind !== 'boost') return;
      pay(s, 'runner', ab.cost);
      const amount = typeof ab.amount === 'function' ? ab.amount(s, cat, c.objectId) : ab.amount;
      obj(s, c.objectId).strengthMods.push({ amount, until: ab.until });
      events.push({ type: 'boost', player: 'runner', objectId: c.objectId, amount });
      return;
    }
    case 'jackOut':
      events.push({ type: 'jackOut', player: 'runner' });
      return endRun(s, events);
    case 'access':
      return doAccess(s, cat, c.objectId, events);
    case 'trash': {
      const b = s.breach;
      if (!b || b.current === null) return;
      pay(s, 'runner', data(s, cat, b.current).trashCost ?? 0);
      trashAccessedCard(s, events);
      return;
    }
    case 'useAbility': {
      const o = obj(s, c.objectId);
      const ab = (getDefinition(o.cardId).paid ?? [])[c.ability];
      if (!ab) return;
      const snap: Record<string, number> = {};
      for (const [k, v] of Object.entries(o.counters)) snap[`snap.${k}`] = v;
      payCost(s, c.player, c.objectId, ab.cost);
      if (ab.oncePerTurn) s.turnStats.fired.push(firedKey(c.objectId, 'ab', c.ability));
      events.push({ type: 'useAbility', player: c.player, objectId: c.objectId, cardId: o.cardId, detail: ab.name });
      s.effects.push({
        kind: 'ability',
        cardId: o.cardId,
        source: c.objectId,
        player: c.player,
        key: String(c.ability),
        step: 0,
        vars: snap,
      });
      return;
    }
    case 'decline':
      if (s.breach) s.breach.current = null;
      return;
    case 'trashProgram': {
      const cardId = obj(s, c.objectId).cardId;
      discardObject(s, c.objectId);
      events.push({ type: 'trash', player: 'runner', cardId, detail: 'memory' });
      return;
    }
  }
}

function install(
  s: GameState,
  cat: Catalog,
  c: Extract<Command, { type: 'install' }>,
  events: GameEvent[],
): void {
  spendClicks(s, c.player, 1);
  doInstall(s, cat, c.player, c.objectId, c.server, c.host, events, false);
}

/** Installation (CR 8.5.16) without the click: used by the basic action and by card effects. */
function doInstall(
  s: GameState,
  cat: Catalog,
  player: Side,
  objectId: ObjectId,
  destination: ServerId | 'new' | undefined,
  host: ObjectId | undefined,
  events: GameEvent[],
  ignoreCost: boolean,
): void {
  const d = data(s, cat, objectId);

  if (player === 'runner') {
    if (!ignoreCost) pay(s, 'runner', runnerInstallCost(s, cat, objectId));
    // Only one console per player: the new one replaces the old.
    if ((d.subtypes ?? []).includes('console')) {
      for (const other of [...zone(s, Z.rig)]) {
        if ((data(s, cat, other).subtypes ?? []).includes('console')) discardObject(s, other);
      }
    }
    const id = moveObject(s, objectId, Z.rig, { faceUp: true });
    if (host !== undefined) obj(s, id).host = host;
    s.turnStats.installed.push(id);
    events.push({ type: 'install', player: 'runner', objectId: id, cardId: d.cardId, detail: d.type });
    return;
  }

  let server = destination as ServerId;
  if (server === 'new') server = `remote${++s.nextRemote}`;

  if (d.type === 'ice') {
    // Install cost: 1 credit per ice already protecting the server (CR 8.5.x).
    if (!ignoreCost) pay(s, 'corp', iceCount(s, server));
    const id = moveObject(s, objectId, Z.ice(server), { faceUp: false, position: 'top' });
    s.turnStats.installed.push(id);
    events.push({ type: 'install', player: 'corp', objectId: id, cardId: d.cardId, server });
    return;
  }

  // Trash like cards (CR 8.5.6a): an agenda/asset replaces any other agenda/asset in the server.
  if (d.type === 'agenda' || d.type === 'asset') {
    for (const id of [...zone(s, Z.root(server))]) {
      const t = data(s, cat, id).type;
      if (t === 'agenda' || t === 'asset') {
        // Keeps its faceup/facedown status in Archives (CR 8.5.7).
        discardObject(s, id, obj(s, id).faceUp);
      }
    }
  }
  const id = moveObject(s, objectId, Z.root(server), { faceUp: false, position: 'top' });
  s.turnStats.installed.push(id);
  events.push({ type: 'install', player: 'corp', objectId: id, cardId: d.cardId, server });
}

// ---- Runs and breach ------------------------------------------------------------------------

type Run = NonNullable<GameState['run']>;

function setPhase(run: Run, phase: Run['phase']) {
  run.phase = phase;
  run.windowPassed = false;
}

function moveInward(s: GameState, events: GameEvent[]): void {
  const run = s.run;
  if (!run) return;
  if (run.passedIce) run.position += 1;
  run.passedIce = false;
  if (run.position < iceCount(s, run.server)) setPhase(run, 'approach');
  else {
    setPhase(run, 'server');
    events.push({ type: 'approachServer', player: 'runner', server: run.server });
  }
}

/** Where an installed card is: the server of its `root:`/`ice:` zone, or null. */
const serverOfObject = (s: GameState, id: ObjectId): ServerId | null =>
  id in s.objects ? serverOfZone(obj(s, id).zone) : null;

/**
 * Conditional abilities (CR 9.6): for each new game event, every active card (the active
 * player's first) whose trigger matches queues its effect.
 */
function processTriggers(s: GameState, cat: Catalog, events: GameEvent[], from: number): void {
  for (let i = from; i < events.length; i++) {
    const ev = events[i];
    const cards = [...activeObjects(s, s.turn.active), ...activeObjects(s, other(s.turn.active))];
    const candidates: {
      id: ObjectId;
      cardId: string;
      owner: Side;
      server: ServerId | null;
      unrezzedOnly?: boolean;
    }[] =
      cards.map((id) => ({
        id,
        cardId: obj(s, id).cardId,
        owner: obj(s, id).owner,
        server: serverOfObject(s, id),
      }));
    for (const id of installedCorpCards(s)) {
      const o = obj(s, id);
      if (!o.faceUp) {
        candidates.push({ id, cardId: o.cardId, owner: o.owner, server: serverOfObject(s, id), unrezzedOnly: true });
      }
    }
    for (const p of s.persist) {
      candidates.push({ id: p.objectId, cardId: p.cardId, owner: 'corp', server: p.server });
    }
    for (const cand of candidates) {
      (getDefinition(cand.cardId).triggers ?? []).forEach((t, idx) => {
        const types = Array.isArray(t.on) ? t.on : [t.on];
        if (cand.unrezzedOnly && !t.whileUnrezzed) return;
        if (!types.includes(ev.type)) return;
        if (t.when && !t.when({ s, cat, ev, self: cand.id, server: cand.server })) return;
        if (t.oncePerTurn) {
          const key = firedKey(cand.id, 'tr', idx);
          if (s.turnStats.fired.includes(key)) return;
          s.turnStats.fired.push(key);
        }
        s.effects.push({
          kind: 'trigger',
          cardId: cand.cardId,
          source: cand.id,
          player: cand.owner,
          key: String(idx),
          step: 0,
          vars: {},
          event: ev,
        });
      });
    }
    if (ev.type === 'runEnds' || ev.type === 'runUnsuccessful') s.persist = [];
  }
}

function queueEffect(s: GameState, kind: Resolving['kind'], source: ObjectId, key = ''): void {
  const o = obj(s, source);
  const def = getDefinition(o.cardId);
  const steps =
    kind === 'play'
      ? def.onPlay
      : kind === 'score'
        ? def.onScore
        : kind === 'steal'
          ? def.onSteal
          : def.subroutines?.[Number(key)]?.steps;
  // Plays always queue (the card must be trashed afterwards), the rest only with something to do.
  if (kind !== 'play' && (!steps || steps.length === 0)) return;
  s.effects.push({ kind, cardId: o.cardId, source, player: o.owner, key, step: 0, vars: {} });
}

function stepsOf(eff: Resolving): Instruction[] {
  const def = getDefinition(eff.cardId);
  switch (eff.kind) {
    case 'play':
      return def.onPlay ?? [];
    case 'score':
      return def.onScore ?? [];
    case 'steal':
      return def.onSteal ?? [];
    case 'subroutine':
      return def.subroutines?.[Number(eff.key)]?.steps ?? [];
    case 'trigger':
      return eff.key === 'empty'
        ? (def.emptySteps ?? [(c) => c.trash(c.source)])
        : (def.triggers?.[Number(eff.key)]?.steps ?? []);
    case 'ability':
      return def.paid?.[Number(eff.key)]?.steps ?? [];
    case 'hook':
      return def.runHooks?.[eff.key]?.onSuccess ?? [];
  }
}

/** The API an instruction sees. `paused` receives the choice it is waiting for, if any. */
function makeContext(
  s: GameState,
  cat: Catalog,
  events: GameEvent[],
  eff: Resolving,
  paused: { choice: GameState['choice'] },
): EffectContext {
  return {
    state: s,
    cat,
    events,
    source: eff.source,
    player: eff.player,
    vars: eff.vars,
    event: eff.event,
    choose(name: string, who: Side, options: ChoiceOption[]) {
      if (name in eff.vars) return eff.vars[name] as number | string | null;
      if (options.length === 0) {
        eff.vars[name] = null;
        return null;
      }
      if (options.length === 1) {
        eff.vars[name] = options[0].value;
        return options[0].value;
      }
      paused.choice = { player: who, name, options };
      return undefined;
    },
    endTheRun: () => {
      events.push({ type: 'endTheRun', player: 'corp', objectId: eff.source });
      endRun(s, events);
    },
    jackOut: () => {
      events.push({ type: 'jackOut', player: 'runner' });
      endRun(s, events);
    },
    gainCredits: (side, amount) => {
      s.players[side].credits += amount;
      events.push({ type: 'gainCredits', player: side, amount });
    },
    loseCredits: (side, amount) => {
      const lost = Math.min(amount, s.players[side].credits);
      s.players[side].credits -= lost;
      events.push({ type: 'loseCredits', player: side, amount: lost });
      return lost;
    },
    draw: (side, amount) => draw(s, side, amount, events),
    giveTag: (amount) => {
      s.players.runner.tags += amount;
      events.push({ type: 'tag', player: 'runner', amount });
    },
    gainClicks: (side, amount) => {
      s.players[side].clicks += amount;
    },
    loseClicks: (side, amount) => {
      s.players[side].clicks = Math.max(0, s.players[side].clicks - amount);
    },
    damage: (kind, amount) => dealDamage(s, kind, amount, events),
    trash: (id) => {
      const o = obj(s, id);
      events.push({ type: 'trash', player: o.owner, cardId: o.cardId });
      discardObject(s, id, o.faceUp);
    },
    addToHand: (id) => {
      const o = obj(s, id);
      moveObject(s, id, handZone(o.owner), { faceUp: false });
    },
    moveToDeck: (id) => {
      const o = obj(s, id);
      moveObject(s, id, deckZone(o.owner), { faceUp: false, position: 'top' });
    },
    shuffleDeck: (side) => shuffleZone(s, deckZone(side)),
    addAdvancement: (id, amount) => {
      obj(s, id).counters.advancement += amount;
    },
    rez: (id, opts) => {
      if (!opts?.ignoreCost) pay(s, 'corp', rezCost(s, cat, id));
      obj(s, id).faceUp = true;
      events.push({ type: 'rez', player: 'corp', objectId: id, cardId: obj(s, id).cardId });
    },
    derez: (id) => {
      obj(s, id).faceUp = false;
    },
    installRunner: (id) => doInstall(s, cat, 'runner', id, undefined, undefined, events, false),
    installCorp: (id, server, o) => doInstall(s, cat, 'corp', id, server, undefined, events, !!o?.ignoreCost),
    installIceInward: (id) => {
      const run = s.run;
      if (!run) return;
      const nid = moveObject(s, id, Z.ice(run.server), { faceUp: false, position: 'bottom' });
      const arr = zone(s, Z.ice(run.server));
      arr.splice(arr.indexOf(nid), 1);
      arr.splice(run.position + 1, 0, nid);
      s.turnStats.installed.push(nid);
      events.push({ type: 'install', player: 'corp', objectId: nid, cardId: obj(s, nid).cardId, server: run.server });
    },
    swapIce: (a, b) => {
      const oa = obj(s, a);
      const ob = obj(s, b);
      const za = s.zones[oa.zone];
      const zb = s.zones[ob.zone];
      const ia = za.indexOf(a);
      const ib = zb.indexOf(b);
      za[ia] = b;
      zb[ib] = a;
      [oa.zone, ob.zone] = [ob.zone, oa.zone];
    },
    addCounter: (id, type: CounterType, amount) => {
      const o = obj(s, id);
      o.counters[type] = Math.max(0, o.counters[type] + amount);
    },
    counter: (id, type: CounterType) => obj(s, id).counters[type],
    sourceCounter: (type: CounterType) =>
      eff.source in s.objects
        ? obj(s, eff.source).counters[type]
        : Number(eff.vars[`snap.${type}`] ?? 0),
    load: (id, amount) => {
      const o = obj(s, id);
      o.counters.credit = amount;
      o.loaded = true;
    },
    takeCredits: (id, amount) => {
      const o = obj(s, id);
      const taken = Math.min(amount, o.counters.credit);
      o.counters.credit -= taken;
      s.players[o.owner].credits += taken;
      events.push({ type: 'gainCredits', player: o.owner, amount: taken });
      return taken;
    },
    startRun: (server, o?: RunOptions) =>
      beginRun(s, server, events, { ...o, cardId: eff.cardId, source: eff.source }),
    trashAccessed: () => trashAccessedCard(s, events),
    forbidStealAndTrash: () => {
      if (s.run) s.run.noSteal = true;
    },
    zone: (key) => [...zone(s, key)],
    cardOf: (id) => {
      const d = data(s, cat, id);
      return { cardId: d.cardId, type: d.type, cost: d.cost, subtypes: d.subtypes ?? [] };
    },
  };
}

/**
 * Runs queued effects (head first) until the queue is empty or one pauses for a choice.
 * Returns true when paused (`s.choice` and `s.pending` are set).
 */
function runEffects(s: GameState, cat: Catalog, events: GameEvent[]): boolean {
  while (s.effects.length > 0) {
    const eff = s.effects[0];
    const steps = stepsOf(eff);
    while (eff.step < steps.length) {
      const paused: { choice: GameState['choice'] } = { choice: null };
      steps[eff.step](makeContext(s, cat, events, eff, paused));
      if (paused.choice) {
        s.choice = paused.choice;
        s.pending = { player: paused.choice.player, kind: 'choice' };
        return true;
      }
      if (s.status === 'ended') return false;
      if (!s.effects.includes(eff)) break; // dropped (the run ended)
      eff.step += 1;
    }
    if (s.effects.includes(eff)) {
      s.effects = s.effects.filter((e) => e !== eff);
      if (eff.kind === 'play' && eff.source in s.objects) discardObject(s, eff.source, true);
    }
  }
  return false;
}

/** The Runner is done breaking: the Corp resolves each unbroken subroutine in order. */
function finishEncounter(s: GameState): void {
  const enc = s.run?.encounter;
  if (!s.run || !enc) return;
  enc.resolving = true;
  if (!(enc.ice in s.objects)) return;
  const subs = getDefinition(obj(s, enc.ice).cardId).subroutines ?? [];
  for (let i = 0; i < subs.length; i++) {
    if (!enc.broken[i]) queueEffect(s, 'subroutine', enc.ice, String(i));
  }
}

/** All subroutines resolved without ending the run: the Runner passes the ice. */
function completeEncounter(s: GameState, events: GameEvent[]): void {
  const run = s.run;
  const enc = run?.encounter;
  if (!run || !enc) return;
  run.encounter = null;
  for (const o of Object.values(s.objects)) {
    o.strengthMods = o.strengthMods.filter((m) => m.until !== 'encounter');
  }
  run.passedIce = true;
  setPhase(run, 'movement');
  events.push({ type: 'passIce', player: 'runner', objectId: enc.ice, server: run.server });
}

function beginBreach(s: GameState, events: GameEvent[]): void {
  const run = s.run;
  if (!run) return;
  const server = run.server;
  if (server === 'archives') {
    for (const id of zone(s, Z.archives)) obj(s, id).faceUp = true;
  }
  let bonus = 0;
  for (const id of zone(s, Z.rig)) {
    const n = getDefinition(obj(s, id).cardId).breachBonus?.(s, server, id) ?? 0;
    if (n > 0 && !s.turnStats.fired.includes(firedKey(id, 'breach', 0))) {
      s.turnStats.fired.push(firedKey(id, 'breach', 0));
      bonus += n;
    }
  }
  const accesses =
    server === 'hq' || server === 'rd' ? 1 + s.players.runner.extraAccess + bonus : 0;
  s.breach = { server, slotsLeft: accesses, accessed: [], current: null };
  events.push({ type: 'breach', player: 'runner', server });
}

function doAccess(
  s: GameState,
  cat: Catalog,
  chosen: ObjectId | undefined,
  events: GameEvent[],
): void {
  const b = s.breach;
  if (!b) return;
  let id = chosen;
  if (id === undefined) {
    const done = new Set(b.accessed);
    const pool = zone(s, b.server === 'hq' ? Z.hq : Z.rd).filter((x) => !done.has(x));
    // HQ: a random card; R&D: the top card not yet accessed.
    id = b.server === 'hq' ? pool[randomInt(s, pool.length)] : pool[0];
    b.slotsLeft -= 1;
  }
  b.accessed.push(id);
  if (s.run) s.run.accesses += 1;
  const d: CardData = data(s, cat, id);
  events.push({ type: 'access', player: 'runner', objectId: id, cardId: d.cardId, server: b.server });

  if (s.run?.noSteal) return;
  if (d.type === 'agenda') {
    const stolen = moveObject(s, id, scoreZone('runner'), { faceUp: true });
    if (s.run) s.run.stolen += 1;
    events.push({ type: 'steal', player: 'runner', objectId: stolen, cardId: d.cardId, server: b.server });
    queueEffect(s, 'steal', stolen);
    return;
  }
  // A card can be trashed by paying its trash cost, or by a mid-access ability.
  b.current = id;
  if (!canTrashNormally(s, cat, id) && paidAbilityCommands(s, cat, 'runner', 'access').length === 0) {
    b.current = null;
  }
}

/** The Runner trashes the card being accessed (paid or by an ability). */
function trashAccessedCard(s: GameState, events: GameEvent[]): void {
  const b = s.breach;
  if (!b || b.current === null || !(b.current in s.objects)) return;
  const o = obj(s, b.current);
  if (getDefinition(o.cardId).triggers?.some((t) => t.persistent)) {
    s.persist.push({ objectId: o.objectId, cardId: o.cardId, server: b.server });
  }
  // Cards the Runner trashes are visible: they go to Archives faceup.
  discardObject(s, b.current, true);
  events.push({ type: 'trash', player: 'runner', cardId: o.cardId, detail: 'accessed' });
  b.current = null;
}

function endRun(s: GameState, events: GameEvent[]): void {
  const run = s.run;
  if (!run) return;
  s.players.runner.fund = 0;
  s.players.runner.extraAccess = 0;
  s.effects = s.effects.filter((e) => e.kind !== 'subroutine' && e.kind !== 'hook');
  for (const o of Object.values(s.objects)) o.strengthMods = [];
  for (const id of run.trashAtEnd) {
    if (id in s.objects) {
      events.push({ type: 'trash', player: 'runner', cardId: obj(s, id).cardId, detail: 'runEnd' });
      discardObject(s, id);
    }
  }
  s.breach = null;
  s.run = null;
  events.push({
    type: run.successful ? 'runEnds' : 'runUnsuccessful',
    player: 'runner',
    server: run.server,
    data: { accesses: run.accesses, stolen: run.stolen },
  });
}

/** Starts a run (the click, if any, was paid by the caller). */
function beginRun(
  s: GameState,
  server: ServerId,
  events: GameEvent[],
  opts: RunOptions & { cardId?: string; source?: ObjectId },
): void {
  s.run = {
    server,
    phase: 'initiation',
    position: 0,
    passedIce: false,
    successful: false,
    hooks: opts.hook && opts.cardId ? [{ cardId: opts.cardId, key: opts.hook, source: opts.source ?? 0 }] : [],
    iceRezMod: opts.iceRezMod ?? 0,
    accesses: 0,
    stolen: 0,
    noSteal: false,
    trashAtEnd: [],
    breached: false,
    windowPassed: false,
    encounter: null,
  };
  s.players.runner.fund = s.players.corp.badPublicity + (opts.fund ?? 0);
  s.turnStats.serversRun.push(server);
  events.push({ type: 'runBegins', player: 'runner', server });
}

// ---- Game flow ------------------------------------------------------------------------------

function checkpoint(s: GameState, cat: Catalog): void {
  // Programs hosted on ice that left are trashed.
  for (const id of [...zone(s, Z.rig)]) {
    const host = obj(s, id).host;
    if (host !== undefined && !(host in s.objects)) discardObject(s, id);
  }
  // Loaded cards that ran out of credits.
  for (const o of Object.values(s.objects)) {
    if (o.loaded && o.counters.credit <= 0 && isInstalledZone(o.zone)) {
      o.loaded = false;
      s.effects.push({
        kind: 'trigger',
        cardId: o.cardId,
        source: o.objectId,
        player: o.owner,
        key: 'empty',
        step: 0,
        vars: {},
      });
    }
  }
  const corp = agendaPoints(s, cat, 'corp') >= AGENDA_POINTS_TO_WIN;
  const runner = agendaPoints(s, cat, 'runner') >= AGENDA_POINTS_TO_WIN;
  if (corp && runner) declareWin(s, 'draw', 'draw');
  else if (corp) declareWin(s, 'corp', 'agenda');
  else if (runner) declareWin(s, 'runner', 'agenda');
}

function startTurn(s: GameState, side: Side, events: GameEvent[]): void {
  s.turn = { number: s.turn.number + 1, active: side, phase: side === 'corp' ? 'draw' : 'action' };
  s.players[side].clicks = CLICKS[side];
  s.prevTurnStats = s.turnStats;
  s.turnStats = newTurnStats();
  events.push({ type: 'turnBegins', player: side, amount: s.turn.number });
  if (side === 'corp') {
    draw(s, 'corp', 1, events);
    s.turn.phase = 'action';
  }
}

/**
 * Walks the game forward until a player has a decision to make (`state.pending`) or the game
 * ends. Priority windows without options are passed automatically.
 */
export function advance(s: GameState, cat: Catalog, events: GameEvent[]): void {
  let seen = 0;
  for (let guard = 0; guard < 10_000; guard++) {
    s.pending = null;
    checkpoint(s, cat);
    if (s.status === 'ended') return;
    if (seen < events.length) {
      const from = seen;
      seen = events.length;
      processTriggers(s, cat, events, from);
    }

    if (s.status === 'mulligan') {
      const who: Side | null = !s.players.corp.mulliganDone
        ? 'corp'
        : !s.players.runner.mulliganDone
          ? 'runner'
          : null;
      if (who) {
        s.pending = { player: who, kind: 'mulligan' };
        return;
      }
      s.status = 'playing';
      startTurn(s, 'corp', events);
      continue;
    }

    if (s.effects.length > 0) {
      if (runEffects(s, cat, events)) return;
      continue;
    }

    if (memoryUsed(s, cat) > memoryLimit(s, cat)) {
      s.pending = { player: 'runner', kind: 'memory' };
      return;
    }

    if (s.breach) {
      const b = s.breach;
      if (b.current !== null) {
        s.pending = { player: 'runner', kind: 'trash' };
        return;
      }
      const cands = accessCandidates(s);
      if (cands.length === 0) {
        s.breach = null;
        continue;
      }
      if (cands.length === 1) {
        doAccess(s, cat, cands[0].objectId, events);
        continue;
      }
      s.pending = { player: 'runner', kind: 'access' };
      return;
    }

    if (s.run) {
      const run = s.run;
      if (run.phase === 'success') {
        if (!run.breached) {
          run.breached = true;
          beginBreach(s, events);
          continue;
        }
        endRun(s, events);
        continue;
      }
      if (run.phase === 'initiation') {
        if (!run.windowPassed && rezOptions(s, cat, false).length > 0) {
          s.pending = { player: 'corp', kind: 'rez' };
          return;
        }
        setPhase(run, iceCount(s, run.server) > 0 ? 'approach' : 'movement');
        continue;
      }
      if (run.phase === 'approach') {
        const ice = zone(s, Z.ice(run.server))[run.position];
        if (ice === undefined) {
          run.passedIce = false;
          setPhase(run, 'movement');
          continue;
        }
        if (!run.windowPassed && rezOptions(s, cat, true).length > 0) {
          s.pending = { player: 'corp', kind: 'rez' };
          return;
        }
        if (obj(s, ice).faceUp) {
          run.encounter = {
            ice,
            broken: (getDefinition(obj(s, ice).cardId).subroutines ?? []).map(() => false),
            resolving: false,
          };
          events.push({ type: 'encounter', player: 'runner', objectId: ice, server: run.server });
          setPhase(run, 'encounter');
          continue;
        }
        // Unrezzed ice: the Runner passes it without an encounter.
        events.push({ type: 'passIce', player: 'runner', objectId: ice, server: run.server });
        run.passedIce = true;
        setPhase(run, 'movement');
        continue;
      }
      if (run.phase === 'encounter') {
        const enc = run.encounter;
        if (enc?.resolving) {
          completeEncounter(s, events);
          continue;
        }
        if (enc && encounterCommands(s, cat).length > 1) {
          s.pending = { player: 'runner', kind: 'encounter' };
          return;
        }
        if (enc) finishEncounter(s);
        else setPhase(run, 'movement');
        continue;
      }
      if (run.phase === 'server') {
        if (!run.windowPassed && rezOptions(s, cat, false).length > 0) {
          s.pending = { player: 'corp', kind: 'rez' };
          return;
        }
        run.phase = 'success';
        run.successful = true;
        s.turnStats.successfulRun = true;
        events.push({ type: 'runSuccessful', player: 'runner', server: run.server });
        for (const h of run.hooks) {
          s.effects.push({
            kind: 'hook',
            cardId: h.cardId,
            source: h.source,
            player: 'runner',
            key: h.key,
            step: 0,
            vars: {},
          });
        }
        continue;
      }
      s.pending = { player: 'runner', kind: 'movement' };
      return;
    }

    const side = s.turn.active;
    if (s.turn.phase === 'action') {
      if (actionCommands(s, cat).length > 0) {
        s.pending = { player: side, kind: 'action' };
        return;
      }
      s.turn.phase = 'discard';
      continue;
    }

    if (s.turn.phase === 'discard') {
      const limit = handLimit(s, side);
      if (side === 'runner' && limit < 0) {
        declareWin(s, 'corp', 'flatline');
        continue;
      }
      if (zone(s, handZone(side)).length > limit) {
        s.pending = { player: side, kind: 'discard' };
        return;
      }
      s.players[side].clicks = 0;
      events.push({ type: 'discardPhaseEnds', player: side });
      events.push({ type: 'turnEnds', player: side, amount: s.turn.number });
      startTurn(s, other(side), events);
      continue;
    }
  }
  throw new Error('advance: too many iterations');
}

// ---- New game -------------------------------------------------------------------------------

export function createGame(cat: Catalog, opts: NewGameOptions): GameState {
  const s = emptyState(opts.seed ?? 1);
  s.status = 'mulligan';
  s.turn = { number: 0, active: 'corp', phase: 'draw' };
  for (const side of ['corp', 'runner'] as const) {
    const deck = side === 'corp' ? opts.corp : opts.runner;
    createObject(s, deck.identity, side, identityZone(side), { faceUp: true });
    for (const cardId of deck.cards) {
      createObject(s, cardId, side, deckZone(side), {
        position: opts.stacked ? 'bottom' : 'top',
      });
    }
    if (!opts.stacked) shuffleZone(s, deckZone(side));
    if (opts.skipMulligan) s.players[side].mulliganDone = true;
    draw(s, side, STARTING_HAND, []);
  }
  advance(s, cat, []);
  return s;
}
