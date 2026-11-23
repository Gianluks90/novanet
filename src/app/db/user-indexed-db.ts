import { openDB } from 'idb';

/**
 * Data that belongs to the user (and must survive a wipe of the card cache in the `nrdb` DB):
 *  - `translations`: personal card translations, key `${lang}:${cardId}`
 *  - `decks`: decks saved on this device (no account needed), key = deck id
 */
export const userDb = openDB('novanet-user', 2, {
  upgrade(db) {
    for (const store of ['translations', 'decks']) {
      if (!db.objectStoreNames.contains(store)) {
        db.createObjectStore(store);
      }
    }
  },
});
