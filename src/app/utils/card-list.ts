import { Card } from '../models/card';
import { Pack } from '../models/pack';

export interface ParsedCardList {
  /** Printing id -> copies, capped at each card's deck limit. */
  cards: Record<string, number>;
  /** Non-empty lines that are not a known card ("3x Hedge Fund"). */
  unknown: string[];
  /** The identity named in the list (first one found), if any. It is not part of `cards`. */
  identity: Card | null;
  /** The deck name, when the first line of the list is one (NetrunnerDB's export starts with it). */
  name: string | null;
}

export interface ParseOptions {
  /** Card sets, to pick the printing named in "(Set)" at the end of a line. */
  packs?: readonly Pack[];
  /** Another title of a card to match (the one in the current language), besides the English one. */
  altTitle?: (card: Card) => string | undefined;
}

/** Lines that are not cards: `;; identity-code: 36009`, `// note`, `# note`. */
const COMMENT = /^(;;|\/\/|#)/;

/** Section headers of the text exports: "Event (3)", "Identity", "Programs (12):". Matched only when no card has that title. */
const SECTION = /^[\p{L}][\p{L} \-/]*\s*(\(\d+\))?\s*:?$/u;

/**
 * Summary/footer lines of the exports: "15 influence spent (max 15, available 0)", "45 cards (min 45)",
 * "Total influence...", "Cards up to Elevation", "Deck built on NetrunnerDB".
 */
const SUMMARY = /^(\d+\s+(influence|cards?|agenda)\b|total\b|influence\b|agenda\b|cards up to\b|deck built\b|deck size\b|minimum deck\b|decklist\b|exported\b|made with\b)/i;

/** The influence dots NetrunnerDB adds at the end of a card line ("1x Unity (System Gateway) ••"). */
const TRAILING_DOTS = /[\s•·●]+$/u;

/** A deck name that is a URL slug ("vic-but-i-m-on-a-bus") reads better with spaces. */
function readableName(line: string): string {
  return /^\S+$/.test(line) && line.includes('-') ? line.replace(/-+/g, ' ') : line;
}

/**
 * Titles compared loosely: case, accents, typographic quotes/apostrophes/dashes and spacing do not
 * matter (the catalog has `“Knickknack” O’Brian`, the text export `"Knickknack" O’Brian`).
 */
function normalizeTitle(title: string): string {
  return title
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[“”„«»]/g, '"')
    .replace(/[‘’‛`´]/g, "'")
    .replace(/[‐-―−]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * "3x Hedge Fund", "3 Hedge Fund", "3x Hedge Fund (Core Set)", or just a title ("Haas-Bioroid:
 * Engineering the Future (Core Set)", as the identity appears in the exports): count, title, set.
 */
const LINE = /^(?:(\d+)\s*x?\s+)?(.+?)(?:\s+\(([^)]*)\))?$/i;

/**
 * Reads a deck "recipe" (one `3x Card Title` or `3 Card Title` per line) into card ids. Titles are
 * matched loosely (see `normalizeTitle`), in English and, with `altTitle`, in the current language.
 * Understands what the text exports of NetrunnerDB and jinteki.net add around the cards: comment
 * lines, section headers ("Event (3)") and totals are skipped without being reported; a `(Set)` at
 * the end of a line selects that printing (else the newest one), and the influence dots after it
 * are ignored; the identity line is recognized (returned in `identity`, with or without a count) and
 * is not a deck card; a first line that is nothing else is the deck name (`name`). Repeated lines and
 * reprints of the same card add up on the first printing seen, capped at the card's deck limit.
 */
export function parseCardList(text: string, catalog: Map<string, Card>, options: ParseOptions = {}): ParsedCardList {
  const byTitle = new Map<string, Card[]>();
  const index = (title: string | undefined, card: Card) => {
    if (!title) return;
    const key = normalizeTitle(title);
    const list = byTitle.get(key);
    if (!list) byTitle.set(key, [card]);
    else if (!list.includes(card)) list.push(card);
  };
  catalog.forEach(card => {
    index(card.title, card);
    index(options.altTitle?.(card), card);
  });

  const setIdOf = (name: string): string | undefined => {
    const wanted = normalizeTitle(name);
    return options.packs?.find(p => p.id === name || normalizeTitle(p.name) === wanted)?.id;
  };

  /** The printing a line refers to: the one in the named set, else the newest. */
  const pick = (candidates: Card[], set: string | undefined): Card => {
    const setId = set ? setIdOf(set) : undefined;
    const inSet = setId ? candidates.find(c => c.card_set_id === setId) : undefined;
    return inSet ?? candidates.reduce((best, c) => (c.id > best.id ? c : best));
  };

  const cards: Record<string, number> = {};
  const printingOf = new Map<string, string>(); // card_id -> the printing used in `cards`
  const unknown: string[] = [];
  let identity: Card | null = null;
  let name: string | null = null;
  let firstLine = true;

  for (const raw of text.split('\n')) {
    const line = raw.replace(TRAILING_DOTS, '').trim();
    if (!line || COMMENT.test(line)) continue;
    const isFirst = firstLine;
    firstLine = false;

    const match = line.match(LINE);
    const candidates = match ? byTitle.get(normalizeTitle(match[2])) : undefined;
    if (!match || !candidates) {
      // headers and totals are not cards, and not an error either
      if (SUMMARY.test(line) || SECTION.test(line)) continue;
      if (isFirst) { name = readableName(line); continue; }
      unknown.push(line);
      continue;
    }

    const card = pick(candidates, match[3]);
    if (card.card_type_id.endsWith('_identity')) {
      identity ??= card;
      continue;
    }
    const copies = match[1] ? parseInt(match[1], 10) : 1;
    const key = printingOf.get(card.card_id) ?? card.id;
    printingOf.set(card.card_id, key);
    const limit = card.deck_limit && card.deck_limit > 0 ? card.deck_limit : Infinity;
    cards[key] = Math.min(limit, (cards[key] ?? 0) + copies);
  }
  return { cards, unknown, identity, name };
}
