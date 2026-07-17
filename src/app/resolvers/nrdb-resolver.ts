import { from, Observable, of, switchMap, map } from 'rxjs';
import { nrdbDb } from '../db/nrdb-indexed-db';
import { ResolveFn } from '@angular/router';
import { inject, LOCALE_ID } from '@angular/core';
import { NetrunnerDbService } from '../db/netrunner-db-service';
import { CardService } from '../services/card-service';
import { computePacksSignature } from './packs-signature';

const API_URL = 'https://netrunnerdb.com/api/2.0/public/cards';
const PACKS_URL = 'https://netrunnerdb.com/api/2.0/public/packs';

export const nrdbResolver: ResolveFn<boolean> = (): Observable<boolean> => {
  const nrdbService = inject(NetrunnerDbService);
  const cardService = inject(CardService);
  const locale = inject(LOCALE_ID);

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

              const install$ = !needsCardRefresh
                ? of(false)
                : from(fetch(API_URL).then(res => res.json())).pipe(
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

              return install$;
            })
          );
        })
      ).pipe(
        // dopo l'installazione/refresh, controlliamo le traduzioni
        switchMap(didRefreshCatalog =>
          from(cardService.getGlobalTranslationStatus()).pipe(
            map(configSnap => ({ configSnap, didRefreshCatalog }))
          )
        ),
        switchMap(({ configSnap, didRefreshCatalog }) =>
          from((async () => {
            const globalVersion = configSnap.exists()
              ? configSnap.data()?.version ?? 0
              : 0;

            // UNICA fonte di verità: localStorage
            const localVersionStored = localStorage.getItem('translationsVersion');
            let localVersion = Number(localVersionStored ?? 0);

            // Check if IndexedDB is empty, or if we just refreshed the whole
            // catalog above (which overwrites every card record from NRDB
            // and wipes any locally-merged `translations` field along with
            // it) -- either way, treat this as a fresh install for translations.
            const dbCardsCount = await (await nrdbDb).transaction('cards').objectStore('cards').count();
            if (dbCardsCount === 0 || didRefreshCatalog) {
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

            // 🔁 INCREMENTALE: solo il delta da localVersion a globalVersion.
            // (Il vecchio controllo "missing cards" rileggeva l'intera
            // collezione ad ogni sync -- non serve più: un refresh del
            // catalogo carte forza già localVersion a 0 qui sopra, quindi
            // finisce nel ramo bootstrap che ri-scarica tutto.)
            if (globalVersion > localVersion) {
              console.log('[translations] incremental sync', localVersion, '→', globalVersion);

              return cardService.getApprovedTranslationsSinceVersion(locale, localVersion).then(translations => {
                if (translations.length === 0) {
                  localStorage.setItem(
                    'translationsVersion',
                    String(globalVersion)
                  );
                  nrdbService.setTranslationsVersion(globalVersion);
                  return true;
                }

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

            // ✅ tutto aggiornato
            return true;
          })())
        ),
        map(result => !!result)
      )
    )
  );
};
