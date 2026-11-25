import { CardObject, GameState, Side } from './types';
import { Z } from './zones';

/**
 * What one player is allowed to see (CR 4: hidden and open information). Objects the viewer
 * cannot see keep their id, zone and counters but have an empty `cardId`; the random generator
 * state and the answers inside pending effects are removed.
 */
export type PlayerView = Omit<GameState, 'rngState'> & { viewer: Side };

const PUBLIC_ZONES = new Set<string>([
  Z.rig,
  Z.heap,
  Z.runnerScore,
  Z.corpScore,
  Z.corpIdentity,
  Z.runnerIdentity,
  Z.play,
  Z.removed,
]);

function visibleTo(s: GameState, o: CardObject, viewer: Side, revealed: Set<number>): boolean {
  if (o.owner === viewer) return true;
  if (revealed.has(o.objectId)) return true;
  if (PUBLIC_ZONES.has(o.zone)) return true;
  // Corp cards: rezzed installed cards and faceup cards in Archives are open information.
  if (o.owner === 'corp' && o.faceUp) return true;
  return false;
}

export function view(s: GameState, viewer: Side): PlayerView {
  const copy = structuredClone(s) as GameState;
  // Cards being accessed are shown to both players.
  const revealed = new Set<number>(copy.breach ? [...copy.breach.accessed] : []);
  if (copy.breach?.current !== null && copy.breach?.current !== undefined) {
    revealed.add(copy.breach.current);
  }
  for (const o of Object.values(copy.objects)) {
    if (!visibleTo(copy, o, viewer, revealed)) o.cardId = '';
  }
  copy.effects = copy.effects.map((e) => ({ ...e, vars: {} }));
  const { rngState: _hidden, ...rest } = copy;
  void _hidden;
  return { ...rest, viewer };
}
