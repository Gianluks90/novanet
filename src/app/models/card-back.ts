/** One card back of the catalog (`public/images/card-back/catalog.json`). */
export interface CardBackDef {
  /** `<side>-<name>`, like the file: `runner-base`, `corp-base`. */
  id: string;
  side: 'runner' | 'corp';
  /** File inside `public/images/card-back/`. */
  file: string;
  /** Display name by language; `en` is the fallback. */
  names: Record<string, string>;
}

export interface CardBackCatalog {
  version: number;
  /** Back used when neither the deck nor the player picked one, per side. */
  defaults: Record<'runner' | 'corp', string>;
  backs: CardBackDef[];
}

/** The back a player prefers, per side (backs are side specific). */
export type PreferredBacks = Partial<Record<'runner' | 'corp', string>>;
