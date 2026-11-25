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
  ServerId,
  Side,
  other,
} from './types';
import { EffectContext, IcebreakerAbility, getDefinition } from './definitions';
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
  moveObject,
  obj,
  randomInt,
  scoreZone,
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
    pending: null,
    winner: null,
    winReason: null,
  };
}

// ---- Derived values -------------------------------------------------------------------------

export const handLimit = (s: GameState, side: Side) =>
  BASE_HAND_SIZE + s.players[side].handSizeMod;

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
  return base + s.players.runner.memoryMod;
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
  return obj(s, id).strengthMods.reduce((n, m) => n + m.amount, base);
}

const rezCost = (s: GameState, cat: Catalog, id: ObjectId) => data(s, cat, id).cost ?? 0;

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

/** Runner commands during the 'encounter' window (always includes `continue`). */
function encounterCommands(s: GameState, cat: Catalog): Command[] {
  const enc = s.run?.encounter;
  const out: Command[] = [{ type: 'continue', player: 'runner' }];
  if (!enc || !(enc.ice in s.objects)) return out;
  const unbroken = enc.broken.flatMap((b, i) => (b ? [] : [i]));
  if (unbroken.length === 0) return out;
  const credits = availableCredits(s, 'runner');
  const iceStrength = strengthOf(s, cat, enc.ice);
  for (const breaker of zone(s, Z.rig)) {
    const abilities = getDefinition(obj(s, breaker).cardId).abilities ?? [];
    const strength = strengthOf(s, cat, breaker);
    const canBreakThis = abilities.some((a) => breaksIce(cat, a, s, enc.ice));
    abilities.forEach((ab, ability) => {
      if (ab.cost > credits) return;
      if (ab.kind === 'break') {
        if (!breaksIce(cat, ab, s, enc.ice) || strength < iceStrength) return;
        if (ab.subs === 'all') {
          out.push({ type: 'break', player: 'runner', objectId: breaker, ability });
        } else {
          for (const subroutine of unbroken) {
            out.push({ type: 'break', player: 'runner', objectId: breaker, ability, subroutine });
          }
        }
      } else if (canBreakThis && strength < iceStrength) {
        // Only boosts that are still needed to interface with this ice.
        out.push({ type: 'boost', player: 'runner', objectId: breaker, ability });
      }
    });
  }
  return out;
}

// ---- Legal commands -------------------------------------------------------------------------

function sameCommand(a: Command, b: Command): boolean {
  const ea = Object.entries(a).filter(([, v]) => v !== undefined);
  const eb = Object.entries(b).filter(([, v]) => v !== undefined);
  if (ea.length !== eb.length) return false;
  const rec = b as unknown as Record<string, unknown>;
  return ea.every(([k, v]) => rec[k] === v);
}

function installedCorpCards(s: GameState): ObjectId[] {
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
        if (d.type === 'operation' && (d.cost ?? 0) <= credits) {
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
        if (d.type === 'event' && (d.cost ?? 0) <= credits) {
          out.push({ type: 'play', player, objectId: id });
        }
        if (
          (d.type === 'program' || d.type === 'hardware' || d.type === 'resource') &&
          (d.cost ?? 0) <= credits
        ) {
          out.push({ type: 'install', player, objectId: id });
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

  // Rezzing assets/upgrades is free (no click) in the Corp's own turn.
  if (player === 'corp') {
    for (const id of rezOptions(s, cat, false)) {
      out.push({ type: 'rez', player: 'corp', objectId: id });
    }
  }

  // Scoring does not cost a click: it can happen whenever the Corp has priority in its turn.
  if (player === 'corp') {
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
    case 'trash':
      return [
        { type: 'trash', player: 'runner' },
        { type: 'decline', player: 'runner' },
      ];
    case 'rez':
      return [
        ...rezOptions(s, cat, s.run?.phase === 'approach').map(
          (objectId) => ({ type: 'rez', player: 'corp', objectId }) as Command,
        ),
        { type: 'pass', player: 'corp' } as Command,
      ];
    case 'encounter':
      return encounterCommands(s, cat);
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
export function dealDamage(s: GameState, kind: DamageKind, amount: number, events: GameEvent[]) {
  if (amount <= 0) return;
  const gripSize = zone(s, Z.grip).length;
  const n = Math.min(amount, gripSize);
  for (let i = 0; i < n; i++) {
    const g = zone(s, Z.grip);
    const id = g[randomInt(s, g.length)];
    const cardId = obj(s, id).cardId;
    discardObject(s, id);
    events.push({ type: 'damage', player: 'runner', cardId, detail: kind });
  }
  if (kind === 'core') s.players.runner.handSizeMod -= amount;
  if (amount > gripSize) declareWin(s, 'corp', 'flatline');
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
    case 'drawCard':
      spendClicks(s, c.player, 1);
      draw(s, c.player, 1, events);
      return;
    case 'install':
      return install(s, cat, c, events);
    case 'play': {
      spendClicks(s, c.player, 1);
      const d = data(s, cat, c.objectId);
      pay(s, c.player, d.cost ?? 0);
      const cardId = obj(s, c.objectId).cardId;
      // No card abilities yet: the card resolves with no effect and is trashed.
      discardObject(s, c.objectId, true);
      events.push({ type: 'play', player: c.player, cardId });
      return;
    }
    case 'advance':
      spendClicks(s, 'corp', 1);
      pay(s, 'corp', 1);
      obj(s, c.objectId).counters.advancement += 1;
      events.push({ type: 'advance', player: 'corp', objectId: c.objectId });
      return;
    case 'score': {
      const o = obj(s, c.objectId);
      const cardId = o.cardId;
      const id = moveObject(s, c.objectId, scoreZone('corp'), { faceUp: true });
      events.push({ type: 'score', player: 'corp', objectId: id, cardId });
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
      s.run = {
        server: c.server,
        phase: 'initiation',
        position: 0,
        passedIce: false,
        successful: false,
        windowPassed: false,
        encounter: null,
      };
      s.players.runner.fund = s.players.corp.badPublicity;
      events.push({ type: 'runBegins', player: 'runner', server: c.server });
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
      if (s.pending?.kind === 'encounter') return finishEncounter(s, cat, events);
      return moveInward(s);
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
      pay(s, 'runner', ab.cost);
      if (c.subroutine === undefined) enc.broken = enc.broken.map(() => true);
      else enc.broken[c.subroutine] = true;
      events.push({
        type: 'break',
        player: 'runner',
        objectId: c.objectId,
        detail: String(c.subroutine ?? 'all'),
      });
      return;
    }
    case 'boost': {
      const ab = (getDefinition(obj(s, c.objectId).cardId).abilities ?? [])[c.ability];
      if (!ab || ab.kind !== 'boost') return;
      pay(s, 'runner', ab.cost);
      obj(s, c.objectId).strengthMods.push({ amount: ab.amount, until: ab.until });
      events.push({ type: 'boost', player: 'runner', objectId: c.objectId, amount: ab.amount });
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
      const d = data(s, cat, b.current);
      pay(s, 'runner', d.trashCost ?? 0);
      const cardId = obj(s, b.current).cardId;
      // Cards the Runner trashes are visible: they go to Archives faceup.
      discardObject(s, b.current, true);
      events.push({ type: 'trash', player: 'runner', cardId });
      b.current = null;
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
  const d = data(s, cat, c.objectId);
  spendClicks(s, c.player, 1);

  if (c.player === 'runner') {
    pay(s, 'runner', d.cost ?? 0);
    const id = moveObject(s, c.objectId, Z.rig, { faceUp: true });
    events.push({ type: 'install', player: 'runner', objectId: id, cardId: d.cardId });
    return;
  }

  let server = c.server as ServerId;
  if (server === 'new') server = `remote${++s.nextRemote}`;

  if (d.type === 'ice') {
    // Install cost: 1 credit per ice already protecting the server (CR 8.5.x).
    pay(s, 'corp', iceCount(s, server));
    const id = moveObject(s, c.objectId, Z.ice(server), { faceUp: false, position: 'top' });
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
  const id = moveObject(s, c.objectId, Z.root(server), { faceUp: false, position: 'top' });
  events.push({ type: 'install', player: 'corp', objectId: id, cardId: d.cardId, server });
}

// ---- Runs and breach ------------------------------------------------------------------------

type Run = NonNullable<GameState['run']>;

function setPhase(run: Run, phase: Run['phase']) {
  run.phase = phase;
  run.windowPassed = false;
}

function moveInward(s: GameState): void {
  const run = s.run;
  if (!run) return;
  if (run.passedIce) run.position += 1;
  run.passedIce = false;
  setPhase(run, run.position < iceCount(s, run.server) ? 'approach' : 'server');
}

function makeContext(s: GameState, events: GameEvent[], source: ObjectId): EffectContext {
  return {
    state: s,
    events,
    source,
    endTheRun: () => {
      events.push({ type: 'endTheRun', player: 'corp', objectId: source });
      endRun(s, events);
    },
    gainCredits: (side, amount) => {
      s.players[side].credits += amount;
      events.push({ type: 'gainCredits', player: side, amount });
    },
    damage: (kind, amount) => dealDamage(s, kind, amount, events),
  };
}

/** The Corp resolves each unbroken subroutine in order, then the Runner passes the ice. */
function finishEncounter(s: GameState, cat: Catalog, events: GameEvent[]): void {
  const run = s.run;
  const enc = run?.encounter;
  if (!run || !enc) return;
  if (enc.ice in s.objects) {
    const subs = getDefinition(obj(s, enc.ice).cardId).subroutines ?? [];
    for (let i = 0; i < subs.length; i++) {
      if (enc.broken[i]) continue;
      events.push({ type: 'subroutine', player: 'corp', objectId: enc.ice, detail: subs[i].text });
      subs[i].resolve(makeContext(s, events, enc.ice));
      if (!s.run || s.status === 'ended') return; // the run ended
    }
  }
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
  const accesses = server === 'hq' || server === 'rd' ? 1 + s.players.runner.extraAccess : 0;
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
  const d: CardData = data(s, cat, id);
  events.push({ type: 'access', player: 'runner', objectId: id, cardId: d.cardId });

  if (d.type === 'agenda') {
    const stolen = moveObject(s, id, scoreZone('runner'), { faceUp: true });
    events.push({ type: 'steal', player: 'runner', objectId: stolen, cardId: d.cardId });
    return;
  }
  const installed = obj(s, id).zone.startsWith('root:');
  if (
    installed &&
    d.trashCost !== undefined &&
    availableCredits(s, 'runner') >= d.trashCost
  ) {
    b.current = id;
  }
}

function endRun(s: GameState, events: GameEvent[]): void {
  const run = s.run;
  if (!run) return;
  s.players.runner.fund = 0;
  s.players.runner.extraAccess = 0;
  for (const o of Object.values(s.objects)) o.strengthMods = [];
  s.breach = null;
  s.run = null;
  events.push({
    type: run.successful ? 'runEnds' : 'runUnsuccessful',
    player: 'runner',
    server: run.server,
  });
}

// ---- Game flow ------------------------------------------------------------------------------

function checkpoint(s: GameState, cat: Catalog): void {
  const corp = agendaPoints(s, cat, 'corp') >= AGENDA_POINTS_TO_WIN;
  const runner = agendaPoints(s, cat, 'runner') >= AGENDA_POINTS_TO_WIN;
  if (corp && runner) declareWin(s, 'draw', 'draw');
  else if (corp) declareWin(s, 'corp', 'agenda');
  else if (runner) declareWin(s, 'runner', 'agenda');
}

function startTurn(s: GameState, side: Side, events: GameEvent[]): void {
  s.turn = { number: s.turn.number + 1, active: side, phase: side === 'corp' ? 'draw' : 'action' };
  s.players[side].clicks = CLICKS[side];
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
  for (let guard = 0; guard < 10_000; guard++) {
    s.pending = null;
    checkpoint(s, cat);
    if (s.status === 'ended') return;

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
        if (encounterCommands(s, cat).length > 1) {
          s.pending = { player: 'runner', kind: 'encounter' };
          return;
        }
        finishEncounter(s, cat, events);
        continue;
      }
      if (run.phase === 'server') {
        if (!run.windowPassed && rezOptions(s, cat, false).length > 0) {
          s.pending = { player: 'corp', kind: 'rez' };
          return;
        }
        run.phase = 'success';
        run.successful = true;
        events.push({ type: 'runSuccessful', player: 'runner', server: run.server });
        beginBreach(s, events);
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
    for (const cardId of deck.cards) createObject(s, cardId, side, deckZone(side));
    shuffleZone(s, deckZone(side));
    draw(s, side, STARTING_HAND, []);
  }
  advance(s, cat, []);
  return s;
}
