import { Card } from '../models/card';
import { GameFormat } from '../models/format';
import { agendaRequirement, isLearningIdentity } from './deck-rules';

/** The only constructed format a deck with a learning identity can be valid in (NetrunnerDB's format id). */
const LEARNING_FORMAT = 'system_gateway';

/**
 * - `deckSize`, `influence`, `agenda`, `copies`, `side`: the basic deck building rules (every format).
 * - `pool`, `banned`, `restricted`, `points`, `learning`: rules of a format; see {@link FORMAT_RULES}.
 */
export type ViolationCode =
  | 'deckSize' | 'influence' | 'agenda' | 'copies' | 'side'
  | 'pool' | 'banned' | 'restricted' | 'points' | 'learning';

/** The rules that only exist because of a format (the rest apply to any deck). */
export const FORMAT_RULES: readonly ViolationCode[] = ['pool', 'banned', 'restricted', 'points', 'learning'];

export interface Violation {
  code: ViolationCode;
  /** A printing in the deck (or the identity) the problem is about, to show its title. */
  printingId?: string;
  /** How much: cards missing, influence over, copies over, points spent, agenda points... */
  amount?: number;
  /** The limit `amount` is compared with, when there is one. */
  limit?: number;
}

export interface DeckToValidate {
  identity: Card;
  /** Printing id -> copies (the identity is not in here). */
  cards: Map<string, number>;
}

/** Card ids (slugs) of the cards that can be played in the format: any printing in its card sets. */
export function poolOf(format: GameFormat, catalog: Map<string, Card>): Set<string> {
  const sets = new Set(format.cardSetIds);
  const pool = new Set<string>();
  catalog.forEach(card => { if (sets.has(card.card_set_id)) pool.add(card.card_id); });
  return pool;
}

/** Why a single card cannot be played in the format, or null (the deck-level rules are not checked). */
export function cardIssue(card: Card, format: GameFormat, pool: Set<string>): 'pool' | 'banned' | null {
  if (!pool.has(card.card_id)) return 'pool';
  if (format.restriction?.banned.includes(card.card_id)) return 'banned';
  return null;
}

/**
 * Checks a deck against the basic deck building rules and, when a format is given, against its card
 * pool and restriction list. An empty result means the deck is legal. Identity-specific deck building
 * restrictions (written in the identity's text) are not covered.
 */
export function validateDeck(
  deck: DeckToValidate,
  catalog: Map<string, Card>,
  format?: GameFormat | null,
  pool?: Set<string>,
): Violation[] {
  const { identity } = deck;
  const restriction = format?.restriction ?? null;
  const violations: Violation[] = [];

  // copies per card (reprints of a card in the deck add up), without the entries the catalog lacks
  const entries = new Map<string, { card: Card; qty: number }>();
  deck.cards.forEach((qty, printingId) => {
    const card = catalog.get(printingId);
    if (!card || card.card_type_id.endsWith('_identity')) return;
    const entry = entries.get(card.card_id);
    if (entry) entry.qty += qty; else entries.set(card.card_id, { card, qty });
  });
  const list = Array.from(entries.values());

  // ---- basic rules
  const size = list.reduce((sum, e) => sum + e.qty, 0);
  const minimum = identity.minimum_deck_size ?? 0;
  if (size < minimum) violations.push({ code: 'deckSize', amount: minimum - size, limit: minimum });

  const universal = restriction?.universalFactionCost ?? {};
  const influence = list.reduce((sum, { card, qty }) => {
    const outOfFaction = card.faction_id !== identity.faction_id && !card.faction_id.startsWith('neutral');
    return sum + ((outOfFaction ? (card.influence_cost ?? 0) : 0) + (universal[card.card_id] ?? 0)) * qty;
  }, 0);
  if (identity.influence_limit != null && influence > identity.influence_limit) {
    violations.push({ code: 'influence', amount: influence - identity.influence_limit, limit: identity.influence_limit });
  }

  if (identity.side_id === 'corp' && !isLearningIdentity(identity)) {
    const points = list.reduce((sum, { card, qty }) => sum + (card.agenda_points ?? 0) * qty, 0);
    const { min, max } = agendaRequirement(size);
    if (points < min || points > max) violations.push({ code: 'agenda', amount: points, limit: min });
  }

  for (const { card, qty } of list) {
    if (card.side_id !== identity.side_id) {
      violations.push({ code: 'side', printingId: card.id });
      continue;
    }
    if (card.deck_limit && card.deck_limit > 0 && qty > card.deck_limit) {
      violations.push({ code: 'copies', printingId: card.id, amount: qty, limit: card.deck_limit });
    }
  }

  // ---- format rules
  if (!format) return violations;
  const inPool = pool ?? poolOf(format, catalog);
  const everything = [{ card: identity, qty: 1 }, ...list];

  if (isLearningIdentity(identity) && format.id !== LEARNING_FORMAT) {
    violations.push({ code: 'learning', printingId: identity.id });
  }

  for (const { card } of everything) {
    if (!inPool.has(card.card_id)) violations.push({ code: 'pool', printingId: card.id });
    else if (restriction?.banned.includes(card.card_id)) violations.push({ code: 'banned', printingId: card.id });
  }

  if (restriction) {
    const restricted = everything.filter(e => restriction.restricted.includes(e.card.card_id));
    if (restricted.length > 1) {
      restricted.forEach(e => violations.push({ code: 'restricted', printingId: e.card.id }));
    }

    if (restriction.pointLimit != null) {
      // points are paid once per card, whatever the number of copies
      const spent = everything.reduce((sum, e) => sum + (restriction.points[e.card.card_id] ?? 0), 0);
      if (spent > restriction.pointLimit) {
        violations.push({ code: 'points', amount: spent, limit: restriction.pointLimit });
      }
    }
  }

  return violations;
}
