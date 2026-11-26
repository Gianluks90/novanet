import { Card } from '../../models/card';
import systemGatewayData from '../../engine/data/system_gateway.json';

/**
 * The card printings the game can show, by `card_id` (the slug the engine uses). The game only
 * plays System Gateway for now, so they come from the same static file as the engine's catalog
 * and need neither IndexedDB nor the network (apart from the pictures).
 */
const BY_CARD_ID = new Map<string, Card>();
for (const card of systemGatewayData as unknown as Card[]) {
  if (!BY_CARD_ID.has(card.card_id)) BY_CARD_ID.set(card.card_id, card);
}

/** The printing to show for an engine card id (`''` or unknown: `null`, show a card back). */
export function gameCard(cardId: string): Card | null {
  return BY_CARD_ID.get(cardId) ?? null;
}
