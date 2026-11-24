import { CardBackCatalog, CardBackDef, PreferredBacks } from '../models/card-back';

/**
 * Which back to show: the one chosen for the deck, else the player's preferred one for that side,
 * else the catalog's default for the side. An id that is not in the catalog (removed, wrong side) is skipped.
 */
export function resolveCardBack(
  catalog: CardBackCatalog,
  side: 'runner' | 'corp',
  deckBack?: string | null,
  preferred?: PreferredBacks | null,
): CardBackDef | null {
  const of = (id: string | null | undefined) =>
    id ? catalog.backs.find(b => b.id === id && b.side === side) : undefined;
  return of(deckBack) ?? of(preferred?.[side]) ?? of(catalog.defaults[side])
    ?? catalog.backs.find(b => b.side === side) ?? null;
}
