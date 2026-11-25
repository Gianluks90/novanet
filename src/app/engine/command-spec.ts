import { legalCommands } from './engine';
import { Catalog, Command, GameState } from './types';
import { obj } from './zones';

/**
 * Describes a command without object ids, so scripts (tutorials) can name it before the game
 * exists: the `type`, the card (`card_id`) the command is about and any other field that must
 * match (`server`, `value`, `subroutines`…).
 */
export type CommandSpec = { type: Command['type']; card?: string } & Record<string, unknown>;

export function matchesSpec(s: GameState, cmd: Command, spec: CommandSpec): boolean {
  const { type, card, ...rest } = spec;
  if (cmd.type !== type) return false;
  const rec = cmd as unknown as Record<string, unknown>;
  if (card !== undefined) {
    const id = rec['objectId'] as number | undefined;
    if (id === undefined || !(id in s.objects) || obj(s, id).cardId !== card) return false;
  }
  return Object.entries(rest).every(([k, v]) => JSON.stringify(rec[k]) === JSON.stringify(v));
}

/** The legal command that matches the spec, if any. */
export function findBySpec(s: GameState, cat: Catalog, spec: CommandSpec): Command | undefined {
  return legalCommands(s, cat).find((c) => matchesSpec(s, c, spec));
}
