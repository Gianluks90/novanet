/**
 * A simple heuristic bot. It only ever picks one of `legalCommands`, so it cannot cheat or get
 * the game into an illegal state; the heuristics are about playing reasonably, not well.
 */
import { agendaPoints, legalCommands, strengthOf } from './engine';
import { Catalog, Command, GameState, Side } from './types';
import { Z, data, isCentral, obj, serverOfZone, zone } from './zones';

/** Preference for answers to choices (higher first); object ids rank in the middle. */
const ANSWER_RANK: Record<string, number> = {
  yes: 10,
  install: 9,
  credits: 8,
  cards: 7,
  pay: 6,
  tag: 5,
  both: 11,
  done: -1,
  none: -2,
  no: -3,
};

const rank = (value: number | string): number =>
  typeof value === 'number' ? 0 : (ANSWER_RANK[value] ?? 1);

/** Server a card is installed in, or null. */
const serverOf = (s: GameState, id: number): string | null =>
  id in s.objects ? serverOfZone(obj(s, id).zone) : null;

function scoreAction(s: GameState, cat: Catalog, c: Command, jitter: number): number {
  const side = s.turn.active;
  const credits = s.players[side].credits;
  switch (c.type) {
    case 'endTurn':
      return -100;
    case 'score':
      return 100;
    case 'rez':
      return 50 + jitter;
    case 'useAbility':
      return 32 + jitter;
    case 'advance': {
      const o = obj(s, c.objectId);
      const d = data(s, cat, c.objectId);
      if (d.type !== 'agenda') return 5;
      const need = d.advancementRequirement ?? 99;
      return o.counters.advancement < need && credits >= 1 ? 42 + jitter : 4;
    }
    case 'play':
      return 36 + jitter;
    case 'install': {
      const d = data(s, cat, c.objectId);
      if (side === 'runner') return d.type === 'program' ? 40 + jitter : 38 + jitter;
      if (d.type === 'agenda' || d.type === 'asset') return 33 + jitter;
      if (d.type === 'ice') {
        const protectsRemote = c.server !== undefined && c.server !== 'new' && !isCentral(c.server);
        return (protectsRemote ? 30 : 12) + jitter;
      }
      return 14 + jitter;
    }
    case 'run': {
      const guarded = zone(s, Z.ice(c.server)).length;
      const hasCards = zone(s, Z.root(c.server)).length > 0;
      const base = c.server === 'archives' ? 3 : c.server === 'rd' || c.server === 'hq' ? 26 : 29;
      return (hasCards || isCentral(c.server) ? base : 2) - guarded * 2 + jitter;
    }
    case 'removeTag':
      return 18;
    case 'trashResource':
      return 22;
    case 'gainCredit':
      return (credits < 8 ? 20 : 7) + jitter / 2;
    case 'drawCard':
      return 15 + jitter / 2;
    case 'purge':
      return 0;
    default:
      return 0;
  }
}

/** Picks a command for whoever has the pending decision. Returns null when there is none. */
export function botCommand(s: GameState, cat: Catalog, rand: () => number): Command | null {
  const legal = legalCommands(s, cat);
  if (legal.length === 0 || !s.pending) return null;
  if (legal.length === 1) return legal[0];
  const jitter = rand() * 8;
  const pick = <T>(items: T[]): T => items[Math.floor(rand() * items.length)];
  const first = (type: Command['type']) => legal.filter((c) => c.type === type);

  switch (s.pending.kind) {
    case 'mulligan':
      return legal.find((c) => c.type === 'mulligan' && c.keep) ?? legal[0];
    case 'choice': {
      const best = Math.max(...legal.map((c) => (c.type === 'choose' ? rank(c.value) : -99)));
      return pick(legal.filter((c) => c.type === 'choose' && rank(c.value) === best));
    }
    case 'discard':
    case 'memory':
      return pick(legal);
    case 'movement':
      return legal.find((c) => c.type === 'continue') ?? legal[0];
    case 'access':
      return pick(legal);
    case 'trash':
      return first('trash')[0] ?? first('useAbility')[0] ?? first('decline')[0] ?? legal[0];
    case 'rez': {
      const rezzes = first('rez');
      const credits = s.players.corp.credits;
      const worth = rezzes.filter((c) => {
        if (c.type !== 'rez') return false;
        const cost = data(s, cat, c.objectId).cost ?? 0;
        return credits - cost >= 1;
      });
      return worth.length > 0 ? pick(worth) : (first('pass')[0] ?? legal[0]);
    }
    case 'encounter': {
      const breaks = first('break').sort(
        (a, b) =>
          (b.type === 'break' ? (b.subroutines?.length ?? 99) : 0) -
          (a.type === 'break' ? (a.subroutines?.length ?? 99) : 0),
      );
      if (breaks.length > 0) return breaks[0];
      const boost = first('boost');
      const enc = s.run?.encounter;
      if (boost.length > 0 && enc) {
        const need = strengthOf(s, cat, enc.ice);
        const weakest = boost.filter((c) => c.type === 'boost' && strengthOf(s, cat, c.objectId) < need);
        if (weakest.length > 0) return weakest[0];
      }
      return first('useAbility')[0] ?? legal.find((c) => c.type === 'continue') ?? legal[0];
    }
    case 'action': {
      let best = legal[0];
      let bestScore = -Infinity;
      for (const c of legal) {
        const v = scoreAction(s, cat, c, jitter * rand());
        if (v > bestScore) {
          bestScore = v;
          best = c;
        }
      }
      return best;
    }
  }
}

export const sideOfPending = (s: GameState): Side | null => s.pending?.player ?? null;

/** Points the winning side needs: used by tests and UIs to describe the state of a game. */
export const pointsOf = (s: GameState, cat: Catalog, side: Side) => agendaPoints(s, cat, side);
