/** The rules of a restriction list (ban list, points list...) of a format, as NetrunnerDB publishes them. */
export interface Restriction {
  id: string;
  name: string;
  /** Eternal: most points a deck can add up to. */
  pointLimit: number | null;
  /** Card ids (slugs, i.e. `Card.card_id`) that cannot be played. */
  banned: string[];
  /** Only one of these cards can be in a deck (Snapshot). */
  restricted: string[];
  /** Eternal: points each card costs (once per card, not per copy). */
  points: Record<string, number>;
  /** Cards that cost this much influence per copy even in their own faction. */
  universalFactionCost: Record<string, number>;
}

/**
 * A constructed format: the card sets of its latest snapshot (the card pool) plus the
 * restriction list in force. `casual` is not here: it has no rules.
 */
export interface GameFormat {
  id: string;
  name: string;
  snapshotId: string;
  /** Card sets that make up the pool (`Card.card_set_id`). */
  cardSetIds: string[];
  restriction: Restriction | null;
}

/** The format of decks that are only played for fun: no card pool, no lists. */
export const CASUAL_FORMAT = 'casual';
