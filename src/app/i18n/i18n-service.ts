import { effect, Injectable, signal } from '@angular/core';
import { EN, TranslationKey } from './en';
import { IT } from './it';

export const SUPPORTED_LANGS = ['en', 'it'] as const;
export type Lang = (typeof SUPPORTED_LANGS)[number];

const DICTIONARIES: Record<Lang, Record<TranslationKey, string>> = { en: EN, it: IT };
const STORAGE_KEY = 'lang';

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && (SUPPORTED_LANGS as readonly string[]).includes(saved)) return saved as Lang;
  } catch { /* storage unavailable */ }
  return navigator.language?.toLowerCase().startsWith('it') ? 'it' : 'en';
}

/**
 * Runtime UI translations. The current language is a signal, so templates using the
 * `t` pipe (and anything reading `lang()`) update live when `setLang` is called.
 * Strings use positional placeholders: `Deck limit: {0}` + `t('key', [3])`.
 */
@Injectable({ providedIn: 'root' })
export class I18nService {
  public readonly lang = signal<Lang>(initialLang());

  constructor() {
    effect(() => {
      const lang = this.lang();
      document.documentElement.lang = lang;
      try { localStorage.setItem(STORAGE_KEY, lang); } catch { /* storage unavailable */ }
    });
  }

  public setLang(lang: Lang) {
    this.lang.set(lang);
  }

  public t(key: TranslationKey, args?: readonly unknown[]): string {
    const text = DICTIONARIES[this.lang()][key] ?? EN[key] ?? key;
    if (!args?.length) return text;
    return text.replace(/\{(\d+)\}/g, (_, i) => String(args[Number(i)] ?? ''));
  }
}
