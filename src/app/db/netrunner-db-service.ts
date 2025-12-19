import { Injectable } from '@angular/core';
import { nrdbDb } from './nrdb-indexed-db';

@Injectable({
  providedIn: 'root',
})
export class NetrunnerDbService {
  private API = 'https://api.netrunnerdb.com/api/2.0/public/cards';

  async isInstalled(): Promise<boolean> {
    const db = await nrdbDb;
    return !!(await db.get('meta', 'installed'));
  }

  async install(): Promise<void> {
    const res = await fetch(this.API);
    const json = await res.json();

    const db = await nrdbDb;
    const tx = db.transaction(['cards', 'meta'], 'readwrite');

    for (const card of json.data) {
      tx.objectStore('cards').put(card, card.code);
    }

    tx.objectStore('meta').put('true', 'installed');
    await tx.done;
  }

  async getAllCards() {
    const db = await nrdbDb;
    const tx = db.transaction('cards', 'readonly');
    const store = tx.objectStore('cards');

    const cards = await store.getAll();  // tutte le carte
    await tx.done;

    return cards;
  }

  async getCardByCode(code: string) {
    const db = await nrdbDb;
    const tx = db.transaction('cards', 'readonly');
    const store = tx.objectStore('cards');

    const card = await store.get(code);  // carta specifica per codice
    await tx.done;

    return card;
  }
}
