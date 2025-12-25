export interface Card {
    code: string;
    cost: number;
    base_link?: number;
    deck_limit?: number;
    faction_code?: string;
    faction_cost?: number;
    flavor?: string;
    illustrator?: string;
    influence_limit?: number;
    keywords?: string;
    memory_cost?: number;
    minimum_deck_size?: number;
    pack_code?: string;
    position?: number;
    quantity?: number;
    side_code?: string;
    strength?: number;
    stripped_text?: string;
    stripped_title?: string;
    text?: string;
    title: string;
    type_code?: string;
    uniqueness?: boolean;

    translations?: {
        [lang: string]: CardTranslation;
    };
}

export interface CardTranslation {
    title: string;
    text: string;
    flavor?: string;
    translationApproved: boolean;
    translationReported: boolean;
    translatedAt: any; // Timestamp
}