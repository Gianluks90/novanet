import { from, Observable, of, switchMap, map } from 'rxjs';
import { nrdbDb } from '../db/nrdb-indexed-db';
import { ResolveFn } from '@angular/router';
import { computePacksSignature } from './packs-signature';

const API_URL = 'https://netrunnerdb.com/api/2.0/public/cards';
const PACKS_URL = 'https://netrunnerdb.com/api/2.0/public/packs';

export const nrdbResolver: ResolveFn<boolean> = (): Observable<boolean> => {
  return from(nrdbDb).pipe(
    switchMap(db =>
      // Lightweight signal for "is our local card catalog stale": compare the
      // set of NRDB pack codes against what we had at our last install. A new
      // pack/cycle release changes this signature, which triggers a full
      // card re-fetch -- unlike the old boolean `installed` flag, this never
      // goes stale on its own.
      from(fetch(PACKS_URL).then(res => res.json())).pipe(
        switchMap(packsJson => {
          const currentPacksSignature = computePacksSignature(packsJson.data);

          return from(db.get('meta', 'packsSignature')).pipe(
            switchMap(storedPacksSignature => {
              const needsCardRefresh = storedPacksSignature !== currentPacksSignature;

              if (!needsCardRefresh) return of(true);

              return from(fetch(API_URL).then(res => res.json())).pipe(
                switchMap(json => {
                  const tx = db.transaction(['cards', 'meta'], 'readwrite');
                  for (const card of json.data) {
                    tx.objectStore('cards').put(card, card.code);
                  }
                  tx.objectStore('meta').put('true', 'installed');
                  tx.objectStore('meta').put(currentPacksSignature, 'packsSignature');
                  return from(tx.done).pipe(map(() => true));
                })
              );
            })
          );
        })
      )
    )
  );
};
