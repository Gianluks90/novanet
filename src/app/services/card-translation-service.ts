import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { nrdbDb } from '../db/nrdb-indexed-db';
import { userDb } from '../db/user-indexed-db';
import { CardTranslation } from '../models/card-translation';
import { I18nService } from '../i18n/i18n-service';

type LanguageData = Record<string, CardTranslation>;

/** A translation written by the user, kept on top of the official files. */
export interface UserTranslation extends CardTranslation {
  updatedAt: string;
}
type UserData = Record<string, Record<string, UserTranslation>>; // lang -> card id -> translation

const EXPORT_FORMAT = 'novanet-translations';

// Personal translations live in the `novanet-user` database (see db/user-indexed-db.ts), so a
// future change/wipe of the card cache schema (`nrdb` DB) can never delete user-written data.

/**
 * Card-text translations (title/text/flavor) for the current language, in layers:
 * personal translation (user, local) > official file > English (the caller's fallback).
 *
 * Official data comes from the static files `translations/<lang>.json` (+ `index.json` with a
 * content hash per language, see scripts/sync-translations.mjs). A language file is downloaded
 * the first time that language is selected and cached in IndexedDB (`nrdb` DB, `meta`, key
 * `translations:<lang>`); it is downloaded again only when its hash in `index.json` changes.
 * English is the source language and has no file.
 *
 * Everything here reads signals, so templates/effects update when the language changes, its
 * data finishes loading, or a personal translation is saved.
 */
@Injectable({ providedIn: 'root' })
export class CardTranslationService {
  private i18n = inject(I18nService);
  private languages = signal<Record<string, LanguageData>>({});
  private user = signal<UserData>({});
  private loading = new Set<string>();

  /** Official translations (by card id) for the current language; undefined for English or while loading. */
  public readonly active = computed<LanguageData | undefined>(() => this.languages()[this.i18n.lang()]);

  /** Changes whenever anything that affects the translations of the current language changes. */
  public readonly revision = computed(() => [this.active(), this.user()[this.i18n.lang()]]);

  /** Total number of personal translations (all languages). */
  public readonly userCount = computed(() =>
    Object.values(this.user()).reduce((n, byCard) => n + Object.keys(byCard).length, 0));

  constructor() {
    void this.loadUser();
    effect(() => {
      const lang = this.i18n.lang();
      untracked(() => {
        if (lang !== 'en' && !this.languages()[lang] && !this.loading.has(lang)) {
          void this.load(lang);
        }
      });
    });
  }

  /** Effective translation for the current language (personal fields override official ones). */
  public translation(cardId: string): CardTranslation | undefined {
    const lang = this.i18n.lang();
    const official = this.languages()[lang]?.[cardId];
    const mine = this.user()[lang]?.[cardId];
    if (!mine) return official;
    return {
      title: mine.title || official?.title || '',
      text: mine.text || official?.text || '',
      flavor: mine.flavor || official?.flavor,
      keywords: official?.keywords,
    };
  }

  /** Translated title, falling back to the English one. */
  public title(card: { id: string; title: string }): string {
    return this.translation(card.id)?.title || card.title;
  }

  // ---- personal translations -------------------------------------------------

  public userTranslation(cardId: string): UserTranslation | undefined {
    return this.user()[this.i18n.lang()]?.[cardId];
  }

  public async saveUserTranslation(cardId: string, value: CardTranslation): Promise<void> {
    const lang = this.i18n.lang();
    const entry: UserTranslation = {
      title: value.title.trim(),
      text: value.text.trim(),
      ...(value.flavor?.trim() ? { flavor: value.flavor.trim() } : {}),
      updatedAt: new Date().toISOString(),
    };
    await (await userDb).put('translations', { lang, id: cardId, ...entry }, `${lang}:${cardId}`);
    this.user.update(all => ({ ...all, [lang]: { ...all[lang], [cardId]: entry } }));
  }

  public async removeUserTranslation(cardId: string): Promise<void> {
    const lang = this.i18n.lang();
    await (await userDb).delete('translations', `${lang}:${cardId}`);
    this.user.update(all => {
      const { [cardId]: _removed, ...rest } = all[lang] ?? {};
      return { ...all, [lang]: rest };
    });
  }

  /** All personal translations as a JSON document (backup / sharing). */
  public exportUserTranslations(): string {
    return JSON.stringify({ format: EXPORT_FORMAT, version: 1, translations: this.user() }, null, 2) + '\n';
  }

  /** Imports a document produced by `exportUserTranslations`; imported entries overwrite existing ones. */
  public async importUserTranslations(json: string): Promise<number> {
    let doc: any;
    try { doc = JSON.parse(json); } catch { throw new Error('Invalid JSON'); }
    if (doc?.format !== EXPORT_FORMAT || typeof doc.translations !== 'object' || !doc.translations) {
      throw new Error('Not a Novanet translations file');
    }

    const tx = (await userDb).transaction('translations', 'readwrite');
    const merged: UserData = structuredClone(this.user());
    let count = 0;
    for (const [lang, cards] of Object.entries<any>(doc.translations)) {
      for (const [id, t] of Object.entries<any>(cards ?? {})) {
        if (typeof t?.title !== 'string' || !t.title.trim()) continue;
        const entry: UserTranslation = {
          title: t.title,
          text: typeof t.text === 'string' ? t.text : '',
          ...(typeof t.flavor === 'string' && t.flavor ? { flavor: t.flavor } : {}),
          updatedAt: typeof t.updatedAt === 'string' ? t.updatedAt : new Date().toISOString(),
        };
        (merged[lang] ??= {})[id] = entry;
        tx.store.put({ lang, id, ...entry }, `${lang}:${id}`);
        count++;
      }
    }
    await tx.done;
    this.user.set(merged);
    return count;
  }

  // ---- loading ---------------------------------------------------------------

  private async loadUser(): Promise<void> {
    try {
      const rows: Array<{ lang: string; id: string } & UserTranslation> = await (await userDb).getAll('translations');
      const data: UserData = {};
      for (const { lang, id, ...entry } of rows) (data[lang] ??= {})[id] = entry;
      this.user.set(data);
    } catch (err) {
      console.error('[translations] could not load personal translations', err);
    }
  }

  private async load(lang: string): Promise<void> {
    this.loading.add(lang);
    try {
      const db = await nrdbDb;
      const key = `translations:${lang}`;
      const cached: { hash?: string; data: LanguageData } | undefined = await db.get('meta', key);

      let hash: string | undefined;
      try {
        const res = await fetch('translations/index.json', { cache: 'no-cache' });
        if (res.ok) hash = (await res.json()).languages?.[lang]?.hash;
      } catch { /* offline: fall through to the cache */ }

      if (cached && (!hash || cached.hash === hash)) {
        this.setLanguage(lang, cached.data);
        return;
      }

      try {
        const res = await fetch(`translations/${lang}.json${hash ? `?v=${hash}` : ''}`);
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        const data: LanguageData = await res.json();
        await db.put('meta', { hash, data }, key);
        this.setLanguage(lang, data);
      } catch (err) {
        console.error(`[translations] could not load "${lang}"`, err);
        if (cached) this.setLanguage(lang, cached.data);
      }
    } finally {
      this.loading.delete(lang);
    }
  }

  private setLanguage(lang: string, data: LanguageData) {
    this.languages.update(all => ({ ...all, [lang]: data }));
  }
}
