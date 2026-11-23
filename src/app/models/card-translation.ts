/**
 * A translated card text, from the static files in `public/translations/<lang>.json`
 * (synced with `npm run sync:translations`). Any field can be empty: callers must fall
 * back to the English card (many upstream entries have a title only).
 */
export interface CardTranslation {
    title: string;
    text: string;
    flavor?: string;
    keywords?: string;
}
