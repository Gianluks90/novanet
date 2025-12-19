import { from, Observable, switchMap, mapTo, of } from 'rxjs';
import { nrdbDb } from '../db/nrdb-indexed-db';
import { ResolveFn } from '@angular/router';

const API_URL = 'https://netrunnerdb.com/api/2.0/public/cards';

export const nrdbResolver: ResolveFn<boolean> = (): Observable<boolean> => {
  return from(nrdbDb).pipe(
    switchMap(db => {
      return from(db.get('meta', 'installed')).pipe(
        switchMap(installed => {
          if (installed) return of(true);

          // fetch + store come Observable
          return from(fetch(API_URL).then(res => res.json())).pipe(
            switchMap(json => {
              const tx = db.transaction(['cards', 'meta'], 'readwrite');
              for (const card of json.data) {
                tx.objectStore('cards').put(card, card.code);
              }
              tx.objectStore('meta').put('true', 'installed');
              return from(tx.done).pipe(mapTo(true));
            })
          );
        })
      );
    })
  );
};