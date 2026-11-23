import { Injectable, signal } from '@angular/core';
import { Card } from '../models/card';
import { nrdbDb } from '../db/nrdb-indexed-db';

@Injectable({
  providedIn: 'root',
})
export class CardService {
  public $cardsMap = signal<Map<string, Card>>(new Map());

  async loadCards(): Promise<void> {
    const db = await nrdbDb;
    const cards = await db.getAll('cards') as Card[];

    const map = new Map<string, Card>();
    cards.forEach(c => map.set(c.id, c));

    this.$cardsMap.set(map);
  }
}
