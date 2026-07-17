import { Injectable } from '@angular/core';
import { nrdbDb } from './nrdb-indexed-db';
import { Card } from '../models/card';
import { Timestamp } from 'firebase/firestore';

@Injectable({
  providedIn: 'root',
})
export class NetrunnerDbService {
  private API = 'https://api.netrunnerdb.com/api/2.0/public/cards';

  constructor() { }

  async isInstalled(): Promise<boolean> {
    const db = await nrdbDb;
    return !!(await db.get('meta', 'installed'));
  }

  async getCardByCode(code: string) {
    const db = await nrdbDb;
    const tx = db.transaction('cards', 'readonly');
    const store = tx.objectStore('cards');

    const card = await store.get(code);  // carta specifica per codice
    await tx.done;

    return card;
  }

  async mergeAndSaveTranslations(
    cardCode: string,
    translationDocData: any
  ): Promise<Timestamp | null> {
    const card = await this.getCardByCode(cardCode);
    if (!card) return null;

    const parsedTranslations: Card['translations'] = {};

    for (const [lang, data] of Object.entries(translationDocData)) {
      if (lang === 'updatedAt') continue;
      if (!data || typeof data !== 'object') continue;
      if (!('approved' in data) || !(data as any).approved) continue;

      parsedTranslations[lang] = data as any;
    }

    if (Object.keys(parsedTranslations).length === 0) {
      return translationDocData.updatedAt ?? null;
    }

    card.translations = {
      ...card.translations,
      ...parsedTranslations,
    };

    await this.saveCard(card);

    return translationDocData.updatedAt ?? null;
  }

  private parseTranslations(data: any): Card['translations'] {
    const translations: Card['translations'] = {};

    if (!data) return translations;

    for (const [key, value] of Object.entries(data)) {
      if (key === 'updatedAt') continue;
      if (typeof value !== 'object' || value === null || !('approved' in value) || !(value as any).approved) continue;
      translations[key] = value as any;
    }

    return translations;
  }

  async saveCard(card: Card): Promise<void> {
    const db = await nrdbDb;
    await db.put('cards', card, card.code);
  }

  async getTranslationsLastUpdatedAt(): Promise<any> {
    const db = await nrdbDb;
    return await db.get('meta', 'translationsLastUpdatedAt');
  }

  async setTranslationsLastUpdatedAt(date: any): Promise<void> {
    const db = await nrdbDb;
    await db.put('meta', date, 'translationsLastUpdatedAt');
  }

  setTranslationsVersion(globalVersion: any) {
    const db = nrdbDb;
    db.then(database => {
      database.put('meta', globalVersion, 'translationsVersion');
    });
  }
}
