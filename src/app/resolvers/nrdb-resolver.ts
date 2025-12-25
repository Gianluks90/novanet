import { from, Observable, of, switchMap, map, tap } from 'rxjs';
import { nrdbDb } from '../db/nrdb-indexed-db';
import { ResolveFn } from '@angular/router';
import { inject } from '@angular/core';
import { NetrunnerDbService } from '../db/netrunner-db-service';
import { CardService } from '../services/card-service';
import { Timestamp } from 'firebase/firestore';

const API_URL = 'https://netrunnerdb.com/api/2.0/public/cards';

export const nrdbResolver: ResolveFn<boolean> = (): Observable<boolean> => {
  const nrdbService = inject(NetrunnerDbService);
  const cardService = inject(CardService);

  return from(nrdbDb).pipe(
    switchMap(db =>
      from(db.get('meta', 'installed')).pipe(
        switchMap(installed => {
          // se già installato, continuiamo comunque al check traduzioni
          const install$ = installed
            ? of(true)
            : from(fetch(API_URL).then(res => res.json())).pipe(
                switchMap(json => {
                  const tx = db.transaction(['cards', 'meta'], 'readwrite');
                  for (const card of json.data) {
                    tx.objectStore('cards').put(card, card.code);
                  }
                  tx.objectStore('meta').put('true', 'installed');
                  return from(tx.done).pipe(map(() => true));
                })
              );

          return install$;
        }),
        // dopo l'installazione, controlliamo le traduzioni
        switchMap(() => from(cardService.getGlobalTranslationStatus())),
        switchMap(configSnap => {
          const globalDate = configSnap.exists()
            ? configSnap.data()?.translationsLastUpdatedAt?.toDate?.() // timestamp a JS date
            : null;

          const localDate = localStorage.getItem('translationsLastUpdatedAt');

          if (!globalDate || globalDate.toISOString() !== localDate) {
            // fetch traduzioni aggiornate da Firebase
            const lastSyncAt = localDate ? Timestamp.fromDate(new Date(localDate)) : new Timestamp(0, 0);
            return from(cardService.getUpdatedTranslations(lastSyncAt)).pipe(
              switchMap(translations => {
                const merge$ = translations.map(tr =>
                  from(nrdbService.mergeAndSaveTranslations(tr.code, tr.translations))
                );
                return from(Promise.all(merge$)).pipe(
                  tap(() => {
                    const newDate = globalDate?.toISOString() ?? new Date().toISOString();
                    localStorage.setItem('translationsLastUpdatedAt', newDate);
                    nrdbService.setTranslationsLastUpdatedAt(newDate);
                  }),
                  map(() => true)
                );
              })
            );
          } else {
            // tutto aggiornato
            return of(true);
          }
        })
      )
    )
  );
};