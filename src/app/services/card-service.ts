import { Injectable, signal } from '@angular/core';
import { Card } from '../models/card';
import { nrdbDb } from '../db/nrdb-indexed-db';

@Injectable({
  providedIn: 'root',
})
export class CardService {
  public $cardsMap = signal<Map<string, Card>>(new Map());

  private loaded = false;

  /** Call after the catalog in IndexedDB has been replaced. */
  public invalidate() {
    this.loaded = false;
  }

  /** Loads the catalog from IndexedDB into `$cardsMap` (once; no-op if already loaded). */
  async loadCards(): Promise<void> {
    if (this.loaded && this.$cardsMap().size > 0) return;
    const db = await nrdbDb;
    const cards = await db.getAll('cards') as Card[];

    const map = new Map<string, Card>();
    cards.forEach(c => map.set(c.id, c));

    this.$cardsMap.set(map);
    this.loaded = cards.length > 0;
  }
}
