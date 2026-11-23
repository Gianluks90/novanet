import { ResolveFn } from '@angular/router';
import { from, Observable } from 'rxjs';
import { nrdbDb } from '../db/nrdb-indexed-db';
import { CardsConfig, fetchCardSets, fetchReferenceData } from '../db/nrdb-api';
import { computePacksSignature } from './packs-signature';

/**
 * cycles/factions/packs/sides/types barely ever change, so this is cached in
 * IndexedDB and only re-fetched when the card-set signature changes (same signal
 * nrdbResolver uses for the card catalog). On a network failure it falls back to
 * whatever is cached, even if stale, rather than failing the route navigation.
 */
export const cardsConfigResolver: ResolveFn<CardsConfig> = (): Observable<CardsConfig> => {
  return from((async () => {
    const db = await nrdbDb;
    const cached: CardsConfig | undefined = await db.get('meta', 'cardsConfig');

    try {
      const packs = await fetchCardSets();
      const currentSignature = computePacksSignature(packs);
      const storedSignature = await db.get('meta', 'cardsConfigSignature');

      if (cached && storedSignature === currentSignature) {
        return cached;
      }

      const result: CardsConfig = { ...(await fetchReferenceData()), packs };

      const tx = db.transaction('meta', 'readwrite');
      tx.objectStore('meta').put(result, 'cardsConfig');
      tx.objectStore('meta').put(currentSignature, 'cardsConfigSignature');
      await tx.done;

      return result;
    } catch (err) {
      if (cached) {
        console.error('[cardsConfigResolver] network error, using cached configs', err);
        return cached;
      }
      throw err;
    }
  })());
};
