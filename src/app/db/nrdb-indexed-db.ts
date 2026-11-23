import { openDB, DBSchema } from 'idb';

interface NrdbSchema extends DBSchema {
  cards: {
    key: string;        // card.id (printing id)
    value: any;         // card object
  };
  meta: {
    key: string;        // 'packsSignature', 'cardsConfig', ...
    value: any;
  };
}

export const nrdbDb = openDB<NrdbSchema>('nrdb', 3, {   // versione 3: NRDB v3 data shape
  upgrade(db, oldVersion, _newVersion, tx) {
    if (!db.objectStoreNames.contains('cards')) {
      db.createObjectStore('cards');
    }
    if (!db.objectStoreNames.contains('meta')) {
      db.createObjectStore('meta');
    }
    // Anything cached before v3 has the old NRDB 2.0 shape: drop it so it is re-fetched.
    if (oldVersion > 0 && oldVersion < 3) {
      tx.objectStore('cards').clear();
      tx.objectStore('meta').clear();
    }
  }
});
