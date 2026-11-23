import { computed, Injectable, signal } from '@angular/core';
import { fetchFormats, fetchFormatsSignature } from '../db/nrdb-api';
import { nrdbDb } from '../db/nrdb-indexed-db';
import { Card } from '../models/card';
import { CASUAL_FORMAT, GameFormat } from '../models/format';
import { DeckToValidate, poolOf, validateDeck, Violation } from '../utils/deck-validation';

/** Order the formats are listed in (the ones not named go last, by name). */
const FORMAT_ORDER = ['standard', 'startup', 'system_gateway', 'core', 'eternal', 'snapshot', 'ram'];

/** Formats before the app used NetrunnerDB's: where they map to now ("casual" for the ones that no longer exist). */
const LEGACY_FORMATS: Record<string, string> = { 'system gateway': 'system_gateway' };

/**
 * NetrunnerDB's formats with their card pool and restriction list in force, and deck validation
 * against them. Cached in IndexedDB (`meta.formats`) and refreshed when NetrunnerDB's formats change.
 */
@Injectable({ providedIn: 'root' })
export class FormatService {
  private readonly _formats = signal<GameFormat[]>([]);
  public readonly formats = this._formats.asReadonly();
  /** Changes whenever a card pool or restriction list does: decks validated under another one are stale. */
  public readonly signature = computed(() =>
    this._formats().map(f => `${f.id}:${f.snapshotId}:${f.restriction?.id ?? ''}`).join('|'));

  private loading: Promise<void> | null = null;
  private pools = new WeakMap<Map<string, Card>, Map<string, Set<string>>>();

  constructor() {
    void this.load();
  }

  /** Loads the formats once (cache first, then refreshed from NetrunnerDB when they changed). */
  public load(): Promise<void> {
    this.loading ??= this.fetch();
    return this.loading;
  }

  private async fetch(): Promise<void> {
    const db = await nrdbDb;
    const cached = await db.get('meta', 'formats') as { signature: string; formats: GameFormat[] } | undefined;
    if (cached) this._formats.set(this.sorted(cached.formats));

    try {
      const signature = await fetchFormatsSignature();
      if (cached?.signature === signature) return;
      const formats = await fetchFormats();
      await db.put('meta', { signature, formats }, 'formats');
      this._formats.set(this.sorted(formats));
    } catch (err) {
      // offline or NetrunnerDB down: whatever is cached keeps working
      console.warn('[formats] could not refresh the formats', err);
      this.loading = null;
    }
  }

  private sorted(formats: GameFormat[]): GameFormat[] {
    const rank = (f: GameFormat) => { const i = FORMAT_ORDER.indexOf(f.id); return i < 0 ? FORMAT_ORDER.length : i; };
    return [...formats].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
  }

  /** A stored `Deck.format` as one the app knows today: NetrunnerDB's id, `casual`, or '' (not chosen). */
  public normalize(format: string | null | undefined): string {
    if (!format) return '';
    const value = LEGACY_FORMATS[format] ?? format;
    if (value === CASUAL_FORMAT || this._formats().some(f => f.id === value)) return value;
    // an id of the app's old list that NetrunnerDB has no format for (throwback, chimera...), or a
    // format not loaded yet: only drop it once the formats are known
    return this._formats().length > 0 ? CASUAL_FORMAT : value;
  }

  public find(id: string | null | undefined): GameFormat | null {
    return this._formats().find(f => f.id === id) ?? null;
  }

  /** Card ids playable in the format (memoized per catalog and snapshot). */
  public pool(format: GameFormat, catalog: Map<string, Card>): Set<string> {
    let byFormat = this.pools.get(catalog);
    if (!byFormat) this.pools.set(catalog, byFormat = new Map());
    const key = `${format.id}:${format.snapshotId}`;
    let pool = byFormat.get(key);
    if (!pool) byFormat.set(key, pool = poolOf(format, catalog));
    return pool;
  }

  public validate(deck: DeckToValidate, catalog: Map<string, Card>, format: GameFormat | null): Violation[] {
    return validateDeck(deck, catalog, format, format ? this.pool(format, catalog) : undefined);
  }

  /** Ids of the formats the deck is legal in. */
  public legalFormats(deck: DeckToValidate, catalog: Map<string, Card>): string[] {
    return this._formats()
      .filter(format => this.validate(deck, catalog, format).length === 0)
      .map(format => format.id);
  }
}
