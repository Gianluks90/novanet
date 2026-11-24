import { Card } from '../models/card';

/**
 * Sorts by the title that is displayed (translated when there is a translation, English otherwise),
 * so a list that mixes Italian and English titles is still in alphabetical order. The comparison
 * follows the language's rules (accents, `å`...), and ignores case and punctuation: `“Knickknack”`
 * sorts under K.
 */
export function sortByTitle<T>(items: readonly T[], title: (item: T) => string, lang: string): T[] {
  const collator = new Intl.Collator(lang, { sensitivity: 'base', numeric: true, ignorePunctuation: true });
  return [...items].sort((a, b) => collator.compare(title(a), title(b)));
}

/**
 * The identities of a side, one per card (a reprinted identity shows once, as its latest printing),
 * in alphabetical order of the displayed title.
 */
export function identitiesOfSide(cards: Iterable<Card>, side: string | undefined, title: (card: Card) => string, lang: string): Card[] {
  const latest = new Map<string, Card>();
  for (const card of cards) {
    if (!card.card_type_id.endsWith('_identity') || card.side_id !== side) continue;
    const current = latest.get(card.card_id);
    if (!current || card.id > current.id) latest.set(card.card_id, card);
  }
  return sortByTitle(Array.from(latest.values()), title, lang);
}
