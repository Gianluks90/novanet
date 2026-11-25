import { DeckList } from '../engine';

/**
 * The System Gateway introductory (learning) decks. The game recommends a few games with them
 * before adding booster cards, which makes them the decks of the tutorials.
 */
export const STARTER_RUNNER: DeckList = {
  identity: 'the_catalyst_convention_breaker',
  cards: [
    ...copies('unity', 2),
    ...copies('cleaver', 2),
    ...copies('sure_gamble', 3),
    ...copies('creative_commission', 2),
    ...copies('mayfly', 2),
    ...copies('red_team', 1),
    ...copies('telework_contract', 2),
    ...copies('overclock', 2),
    ...copies('tread_lightly', 2),
    ...copies('pennyshaver', 1),
    ...copies('docklands_pass', 1),
    ...copies('vrcation', 2),
    ...copies('verbal_plasticity', 1),
    ...copies('carmen', 2),
    ...copies('smartware_distributor', 2),
    ...copies('jailbreak', 3),
  ],
};

export const STARTER_CORP: DeckList = {
  identity: 'the_syndicate_profit_over_principle',
  cards: [
    ...copies('manegarm_skunkworks', 1),
    ...copies('urtica_cipher', 2),
    ...copies('diviner', 2),
    ...copies('send_a_message', 2),
    ...copies('superconducting_hub', 2),
    ...copies('seamless_launch', 2),
    ...copies('karuna', 2),
    ...copies('government_subsidy', 2),
    ...copies('bran_1_0', 2),
    ...copies('palisade', 3),
    ...copies('tithe', 2),
    ...copies('whitespace', 2),
    ...copies('nico_campaign', 2),
    ...copies('regolith_mining_license', 2),
    ...copies('offworld_office', 3),
    ...copies('hedge_fund', 3),
  ],
};

function copies(cardId: string, n: number): string[] {
  return Array.from({ length: n }, () => cardId);
}

/**
 * The deck with `top` as its first cards (in that order) and the rest of the list after them.
 * Throws when `top` asks for more copies than the list has.
 */
export function stackDeck(deck: DeckList, top: string[]): DeckList {
  const rest = [...deck.cards];
  for (const id of top) {
    const i = rest.indexOf(id);
    if (i < 0) throw new Error(`stackDeck: no more copies of ${id}`);
    rest.splice(i, 1);
  }
  return { identity: deck.identity, cards: [...top, ...rest] };
}
