import { Card } from '../models/card';
import { CardData, CardType, Catalog, Side } from './types';

const TYPE_BY_ID: Record<string, CardType> = {
  corp_identity: 'identity',
  runner_identity: 'identity',
  agenda: 'agenda',
  asset: 'asset',
  upgrade: 'upgrade',
  ice: 'ice',
  operation: 'operation',
  program: 'program',
  hardware: 'hardware',
  resource: 'resource',
  event: 'event',
};

const num = (v: string | number | null | undefined): number | undefined => {
  if (v === null || v === undefined || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

/** Builds the engine catalog (by `card_id`) from the app's card printings. */
export function catalogFromCards(cards: readonly Card[]): Catalog {
  const out: Record<string, CardData> = {};
  for (const c of cards) {
    if (out[c.card_id]) continue;
    const type = TYPE_BY_ID[c.card_type_id];
    if (!type) continue;
    out[c.card_id] = {
      cardId: c.card_id,
      title: c.title,
      side: c.side_id as Side,
      type,
      cost: num(c.cost),
      advancementRequirement: num(c.advancement_requirement),
      agendaPoints: c.agenda_points ?? undefined,
      trashCost: c.trash_cost ?? undefined,
      memory: c.memory_cost ?? undefined,
      strength: c.strength ?? undefined,
      baseLink: c.base_link ?? undefined,
      unique: c.is_unique || undefined,
      subtypes: c.card_subtype_ids,
    };
  }
  return out;
}
