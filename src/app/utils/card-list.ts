import { Card } from '../models/card';

export interface ParsedCardList {
  /** Printing id -> copies, capped at each card's deck limit. */
  cards: Record<string, number>;
  /** Non-empty lines that are not a known card ("3x Hedge Fund"). */
  unknown: string[];
}

/** "3x Hedge Fund", "3 Hedge Fund" or "3x Hedge Fund (Core Set)". */
const LINE = /^(\d+)\s*x?\s+(.+?)(?:\s+\([^)]*\))?$/i;

/**
 * Reads a deck "recipe" (one `3x Card Title` per line) into card ids, matching titles
 * case-insensitively against the catalog. Identity lines are skipped: the identity is picked
 * separately. Repeated lines add up, and copies are capped at the card's deck limit.
 */
export function parseCardList(text: string, catalog: Map<string, Card>): ParsedCardList {
  const byTitle = new Map<string, Card>();
  catalog.forEach(card => {
    const key = card.title.trim().toLowerCase();
    if (!byTitle.has(key)) byTitle.set(key, card);
  });

  const cards: Record<string, number> = {};
  const unknown: string[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const match = line.match(LINE);
    const card = match ? byTitle.get(match[2].trim().toLowerCase()) : undefined;
    if (!match || !card) {
      unknown.push(line);
      continue;
    }
    if (card.card_type_id.endsWith('_identity')) continue;
    const limit = card.deck_limit && card.deck_limit > 0 ? card.deck_limit : Infinity;
    cards[card.id] = Math.min(limit, (cards[card.id] ?? 0) + parseInt(match[1], 10));
  }
  return { cards, unknown };
}
