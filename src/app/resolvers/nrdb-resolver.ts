import { from, Observable } from 'rxjs';
import { ResolveFn } from '@angular/router';
import { inject } from '@angular/core';
import { CardService } from '../services/card-service';
import { nrdbDb } from '../db/nrdb-indexed-db';
import { fetchCards, fetchCardSets } from '../db/nrdb-api';
import { computePacksSignature } from './packs-signature';

/**
 * Keeps the local card catalog (IndexedDB `cards`) in sync with NetrunnerDB v3.
 * The card-set list is a lightweight staleness signal: when its signature
 * (set ids + latest update) differs from the one stored at the last install, the
 * whole catalog is re-downloaded. If the network fails and we already have cards
 * cached, we carry on with the cache.
 */
export const nrdbResolver: ResolveFn<boolean> = (): Observable<boolean> => {
  const cardService = inject(CardService);

  return from((async () => {
    const db = await nrdbDb;

    try {
      const currentSignature = computePacksSignature(await fetchCardSets());
      const [storedSignature, cachedCount] = await Promise.all([
        db.get('meta', 'packsSignature'),
        db.count('cards'),
      ]);

      if (storedSignature === currentSignature && cachedCount > 0) {
        return true;
      }

      const cards = await fetchCards();
      const tx = db.transaction(['cards', 'meta'], 'readwrite');
      tx.objectStore('cards').clear();
      for (const card of cards) {
        tx.objectStore('cards').put(card, card.id);
      }
      tx.objectStore('meta').put('true', 'installed');
      tx.objectStore('meta').put(currentSignature, 'packsSignature');
      await tx.done;
      cardService.invalidate();
      return true;
    } catch (err) {
      if (await db.count('cards') > 0) {
        console.error('[nrdbResolver] network error, using cached cards', err);
        return true;
      }
      throw err;
    }
  })());
};
