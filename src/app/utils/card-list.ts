import { Card } from '../models/card';

export interface ParsedCardList {
  /** Printing id -> copies, capped at each card's deck limit. */
  cards: Record<string, number>;
  /** Non-empty lines that are not a known card ("3x Hedge Fund"). */
  unknown: string[];
}

/** Lines of the NetrunnerDB text export that are not cards: `;; identity-code: 36009`, `// note`, `# note`. */
const COMMENT = /^(;;|\/\/|#)/;

/**
 * Titles compared loosely: case, accents, typographic quotes/apostrophes/dashes and spacing do not
 * matter (the catalog has `“Knickknack” O’Brian`, the text export `"Knickknack" O’Brian`).
 */
function normalizeTitle(title: string): string {
  return title
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u201C\u201D\u201E\u00AB\u00BB]/g, '"')
    .replace(/[\u2018\u2019\u201B\u0060\u00B4]/g, "'")
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** "3x Hedge Fund", "3 Hedge Fund" or "3x Hedge Fund (Core Set)". */
const LINE = /^(\d+)\s*x?\s+(.+?)(?:\s+\([^)]*\))?$/i;

/**
 * Reads a deck "recipe" (one `3x Card Title` or `3 Card Title` per line; `;;` comment lines are
 * skipped) into card ids, matching titles loosely (see `normalizeTitle`). Identity lines are skipped: the identity is picked
 * separately. Repeated lines add up, and copies are capped at the card's deck limit.
 */
export function parseCardList(text: string, catalog: Map<string, Card>): ParsedCardList {
  const byTitle = new Map<string, Card>();
  catalog.forEach(card => {
    const key = normalizeTitle(card.title);
    if (!byTitle.has(key)) byTitle.set(key, card);
  });

  const cards: Record<string, number> = {};
  const unknown: string[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || COMMENT.test(line)) continue;
    const match = line.match(LINE);
    const card = match ? byTitle.get(normalizeTitle(match[2])) : undefined;
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
