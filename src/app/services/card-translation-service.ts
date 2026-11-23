import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { nrdbDb } from '../db/nrdb-indexed-db';
import { CardTranslation } from '../models/card-translation';
import { I18nService } from '../i18n/i18n-service';

type LanguageData = Record<string, CardTranslation>;

/**
 * Card-text translations (title/text/flavor) for the current language.
 *
 * Data comes from the static files `translations/<lang>.json` (+ `index.json` with a content
 * hash per language, see scripts/sync-translations.mjs). A language file is downloaded the
 * first time that language is selected and cached in IndexedDB (`meta`, key
 * `translations:<lang>`); it is downloaded again only when its hash in `index.json` changes.
 * English is the source language and has no file.
 *
 * Everything here reads signals, so templates/effects update when the language changes or
 * its data finishes loading.
 */
@Injectable({ providedIn: 'root' })
export class CardTranslationService {
  private i18n = inject(I18nService);
  private languages = signal<Record<string, LanguageData>>({});
  private loading = new Set<string>();

  /** Translations (by card id) for the current language; undefined for English or while loading. */
  public readonly active = computed<LanguageData | undefined>(() => this.languages()[this.i18n.lang()]);

  constructor() {
    effect(() => {
      const lang = this.i18n.lang();
      untracked(() => {
        if (lang !== 'en' && !this.languages()[lang] && !this.loading.has(lang)) {
          void this.load(lang);
        }
      });
    });
  }

  public translation(cardId: string): CardTranslation | undefined {
    return this.active()?.[cardId];
  }

  /** Translated title, falling back to the English one. */
  public title(card: { id: string; title: string }): string {
    return this.translation(card.id)?.title || card.title;
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
