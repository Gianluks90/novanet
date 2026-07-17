import { ResolveFn } from '@angular/router';
import { from, Observable } from 'rxjs';
import { nrdbDb } from '../db/nrdb-indexed-db';
import { computePacksSignature } from './packs-signature';

const BASE_URL = 'https://netrunnerdb.com/api/2.0/public/';

async function fetchApi(api: string): Promise<any> {
  const res = await fetch(`${BASE_URL}${api}`);
  if (!res.ok) {
    throw new Error(`Fetch failed for ${api}: ${res.status}`);
  }
  return res.json();
}

/**
 * cycles/factions/packs/sides/types barely ever change, so this is cached in
 * IndexedDB and only re-fetched when the pack list's signature changes (same
 * signal nrdbResolver uses to decide whether to refresh the card catalog).
 * On a network failure it falls back to whatever is cached, even if stale,
 * rather than failing the route navigation outright.
 */
export const cardsConfigResolver: ResolveFn<any> = (): Observable<any> => {
  return from((async () => {
    const db = await nrdbDb;

    let packsJson: any;
    try {
      packsJson = await fetchApi('packs');
    } catch (err) {
      const cached = await db.get('meta', 'cardsConfig');
      if (cached) {
        console.error('[cardsConfigResolver] network error, using cached configs', err);
        return cached;
      }
      throw err;
    }

    const currentSignature = computePacksSignature(packsJson.data);
    const [storedSignature, cached] = await Promise.all([
      db.get('meta', 'cardsConfigSignature'),
      db.get('meta', 'cardsConfig'),
    ]);

    if (cached && storedSignature === currentSignature) {
      return cached;
    }

    try {
      const [cycles, factions, sides, types] = await Promise.all([
        fetchApi('cycles'),
        fetchApi('factions'),
        fetchApi('sides'),
        fetchApi('types'),
      ]);

      const result = { cycles, factions, packs: packsJson, sides, types };

      const tx = db.transaction('meta', 'readwrite');
      tx.objectStore('meta').put(result, 'cardsConfig');
      tx.objectStore('meta').put(currentSignature, 'cardsConfigSignature');
      await tx.done;

      return result;
    } catch (err) {
      if (cached) {
        console.error('[cardsConfigResolver] network error fetching configs, using stale cache', err);
        return cached;
      }
      throw err;
    }
  })());
};
