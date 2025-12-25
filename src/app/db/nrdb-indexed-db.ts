import { openDB, DBSchema } from 'idb';

interface NrdbSchema extends DBSchema {
  cards: {
    key: string;        // card.code
    value: any;         // card object
  };
  meta: {
    key: string;        // 'version'
    value: string;
  };
}

export const nrdbDb = openDB<NrdbSchema>('nrdb', 2, {   // versione 2
  upgrade(db, oldVersion) {
    if (!db.objectStoreNames.contains('cards')) {
      db.createObjectStore('cards');
    }
    if (!db.objectStoreNames.contains('meta')) {
      db.createObjectStore('meta');
    }
  }
});
