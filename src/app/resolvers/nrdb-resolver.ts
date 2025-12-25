import { from, Observable, of, switchMap, map, tap } from 'rxjs';
import { nrdbDb } from '../db/nrdb-indexed-db';
import { ResolveFn } from '@angular/router';
import { inject, LOCALE_ID } from '@angular/core';
import { NetrunnerDbService } from '../db/netrunner-db-service';
import { CardService } from '../services/card-service';

const API_URL = 'https://netrunnerdb.com/api/2.0/public/cards';

export const nrdbResolver: ResolveFn<boolean> = (): Observable<boolean> => {
  const nrdbService = inject(NetrunnerDbService);
  const cardService = inject(CardService);
  const locale = inject(LOCALE_ID);

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
        switchMap(configSnap => 
          from((async () => {
            const globalVersion = configSnap.exists()
              ? configSnap.data()?.version ?? 0
              : 0;

            // UNICA fonte di verità: localStorage
            const localVersionStored = localStorage.getItem('translationsVersion');
            let localVersion = Number(localVersionStored ?? 0);

            // Check if IndexedDB is empty
            const dbCardsCount = await (await nrdbDb).transaction('cards').objectStore('cards').count();
            if (dbCardsCount === 0) {
              localVersion = 0;
            }

            console.log('[translations] localVersionEffective', localVersion, 'globalVersion', globalVersion);

            // 🧱 BOOTSTRAP: DB nuovo / cache vuota
            if (localVersion === 0 && globalVersion > 0) {
              console.log('[translations] bootstrap full fetch');

              return cardService.getAllApprovedTranslations(locale).then(translations => {
                const merge$ = translations.map(tr =>
                  nrdbService.mergeAndSaveTranslations(tr.code, tr.translations)
                );
                return Promise.all(merge$).then(() => {
                  localStorage.setItem(
                    'translationsVersion',
                    String(globalVersion)
                  );
                  nrdbService.setTranslationsVersion(globalVersion);
                  return true;
                });
              });
            }

            // 🔁 INCREMENTALE with missing cards check
            if (globalVersion > localVersion) {
              console.log('[translations] incremental sync with missing cards check', localVersion, '→', globalVersion);

              // First, check for missing cards in IndexedDB
              return cardService.getApprovedTranslationsSinceVersion(locale, 0).then(async allTranslations => {
                // Filter translations that are missing in local DB
                const db = await nrdbDb;
                const results = await Promise.all(
                  allTranslations.map(async tr => {
                    const card = await db.get('cards', tr.code);
                    return { translation: tr, isMissing: !card };
                  })
                );
                const missingTranslations = results.filter(r => r.isMissing).map(r => r.translation);
                const translationsToMerge = [...missingTranslations];

                // Also get incremental translations since localVersion
                const incrementalTranslations = await cardService.getApprovedTranslationsSinceVersion(locale, localVersion);
                incrementalTranslations.forEach(tr => {
                  if (!translationsToMerge.find(t => t.code === tr.code)) {
                    translationsToMerge.push(tr);
                  }
                });

                if (translationsToMerge.length === 0) {
                  // No translations to merge, just update version
                  localStorage.setItem(
                    'translationsVersion',
                    String(globalVersion)
                  );
                  nrdbService.setTranslationsVersion(globalVersion);
                  return true;
                }

                const merge$ = translationsToMerge.map(tr =>
                  nrdbService.mergeAndSaveTranslations(tr.code, tr.translations)
                );

                return Promise.all(merge$).then(() => {
                  localStorage.setItem(
                    'translationsVersion',
                    String(globalVersion)
                  );
                  nrdbService.setTranslationsVersion(globalVersion);
                  return true;
                });
              });
            }

            // ✅ tutto aggiornato
            return true;
          })())
        ),
        map(result => !!result)
      )
    )
  );
};