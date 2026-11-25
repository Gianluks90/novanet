import { Deck } from '../models/deck';
import { Card } from '../models/card';
import { Catalog } from './types';
import { DeckList } from './engine';
import { hasDefinition } from './definitions';

/** Cards whose text has nothing for the engine to run (the learning identities). */
export const STATELESS_CARDS: readonly string[] = [
  'the_catalyst_convention_breaker',
  'the_syndicate_profit_over_principle',
];

export interface AdaptedDeck {
  list: DeckList;
  /** Printing ids of the deck that `lookup` did not know. */
  missing: string[];
}

/**
 * Turns a saved deck into the engine's deck list: one entry (`card_id`) per copy. The deck stores
 * printing ids, `lookup` gives their cards (e.g. the app's `$cardsMap`).
 */
export function deckToDeckList(
  deck: Pick<Deck, 'identity' | 'cards'>,
  lookup: (printingId: string) => Card | undefined,
): AdaptedDeck {
  const cards: string[] = [];
  const missing: string[] = [];
  for (const [printingId, copies] of Object.entries(deck.cards)) {
    const card = lookup(printingId);
    if (!card) {
      missing.push(printingId);
      continue;
    }
    for (let i = 0; i < copies; i++) cards.push(card.card_id);
  }
  return { list: { identity: deck.identity.card_id, cards }, missing };
}

/** Card ids of a deck list the engine cannot play yet (not in the catalog or no definition). */
export function unsupportedCards(list: DeckList, catalog: Catalog): string[] {
  const ids = new Set([list.identity, ...list.cards]);
  return [...ids]
    .filter((id) => !(id in catalog) || (!hasDefinition(id) && !STATELESS_CARDS.includes(id)))
    .sort();
}
