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

export const nrdbDb = openDB<NrdbSchema>('nrdb', 1, {
  upgrade(db) {
    db.createObjectStore('cards');
    db.createObjectStore('meta');
  }
});