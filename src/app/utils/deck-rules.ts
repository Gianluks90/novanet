/**
 * Agenda points a Corp deck of `deckSize` cards must contain, as a `[min, max]` range
 * (Comprehensive Rules 1.4.6): 40–44 cards: 18–19; 45–49: 20–21; 50–54: 22–23; above 54 two more
 * points for every full 5 cards over 50. Decks under 40 cards use the 40-card requirement.
 */
export function agendaRequirement(deckSize: number): { min: number; max: number } {
  const min = 18 + 2 * Math.floor((Math.max(deckSize, 40) - 40) / 5);
  return { min, max: min + 1 };
}
