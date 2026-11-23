/**
 * A card *printing* as returned by NetrunnerDB v3 (`/printings`), trimmed to the
 * attributes the app uses. `id` is the 5-digit printing code (e.g. "01056", also
 * used for image URLs); `card_id` is the slug shared by every reprint of a card.
 */
export interface Card {
    id: string;
    card_id: string;
    card_set_id: string;
    card_cycle_id: string;
    position: number;
    quantity?: number | null;
    flavor?: string | null;
    illustrator_names?: string[];

    title: string;
    stripped_title?: string;
    text?: string | null;
    stripped_text?: string | null;

    card_type_id: string;
    side_id: string;
    faction_id: string;
    card_subtype_ids?: string[];
    /** e.g. "Icebreaker - Decoder" */
    display_subtypes?: string | null;

    /** String in v3: a number, "X", or null when the card has no cost. */
    cost?: string | null;
    /** String in v3 (agendas). */
    advancement_requirement?: string | null;
    agenda_points?: number | null;
    base_link?: number | null;
    deck_limit?: number | null;
    influence_cost?: number | null;
    /** null on identities means "no limit". */
    influence_limit?: number | null;
    memory_cost?: number | null;
    minimum_deck_size?: number | null;
    strength?: number | null;
    trash_cost?: number | null;
    is_unique?: boolean;

    translations?: {
        [lang: string]: CardTranslation;
    };
}

export interface CardTranslation {
    title: string;
    text: string;
    flavor?: string;
    keywords?: string;
}
