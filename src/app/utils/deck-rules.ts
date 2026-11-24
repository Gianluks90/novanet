import { Card } from '../models/card';

/**
 * Agenda points a Corp deck of `deckSize` cards must contain, as a `[min, max]` range
 * (Comprehensive Rules 1.4.6): 40–44 cards: 18–19; 45–49: 20–21; 50–54: 22–23; above 54 two more
 * points for every full 5 cards over 50. Decks under 40 cards use the 40-card requirement (the rules
 * do not tabulate less); learning identities are the exception, see {@link isLearningIdentity}.
 */
export function agendaRequirement(deckSize: number): { min: number; max: number } {
  const min = 18 + 2 * Math.floor((Math.max(deckSize, 40) - 40) / 5);
  return { min, max: min + 1 };
}

/**
 * The learning identities of the System Gateway starter decks (The Catalyst, The Syndicate): they
 * come from the System Gateway set and have a minimum deck size under 40 (30). Their decks do not
 * follow the constructed rules: no agenda point range is checked, and they are only valid in System
 * Gateway (and casual). This mirrors jinteki.net's verdict for the starter decks; it is not written
 * in the Comprehensive Rules. (The Draft identities also have a minimum of 30, but Draft is not a
 * format of the app and they belong to no card pool.)
 */
export function isLearningIdentity(identity: Card): boolean {
  return identity.card_set_id === 'system_gateway' && (identity.minimum_deck_size ?? 40) < 40;
}
