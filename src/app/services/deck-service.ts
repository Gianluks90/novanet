import { Injectable, signal, WritableSignal } from '@angular/core';
import { FirebaseService } from './firebase-service';
import { Deck } from '../models/deck';
import { collection, deleteDoc, doc, getDoc, onSnapshot, query, setDoc, Timestamp, where } from 'firebase/firestore';

@Injectable({
  providedIn: 'root',
})
export class DeckService {
  public $decks: WritableSignal<Deck[]> = signal<Deck[]>([]);
  public $publicDecks: WritableSignal<Deck[]> = signal<Deck[]>([]);

  constructor(private firebase: FirebaseService) { }

  public getDecksByUser(): void {
     const colRef = collection(this.firebase.database, 'decks');
     const q = query(colRef, where('createdBy', '==', this.firebase.$user()!.uid));
     const unsub = onSnapshot(q, (snapshot) => {
       const decks: Deck[] = [];
       snapshot.forEach((doc) => {
         decks.push(doc.data() as Deck);
       });
       this.$decks.set(decks);
     });
  }

  /**
   * Community gallery: decks anyone can browse. `visibility: 'shared'` decks
   * are deliberately not queryable here -- they're only reachable via a
   * direct link (getDeckById), never listed.
   */
  public getPublicDecks(): void {
     const colRef = collection(this.firebase.database, 'decks');
     const q = query(colRef, where('visibility', '==', 'public'));
     const unsub = onSnapshot(q, (snapshot) => {
       const decks: Deck[] = [];
       snapshot.forEach((doc) => {
         decks.push(doc.data() as Deck);
       });
       this.$publicDecks.set(decks);
     });
  }

  public async getDeckById(deckId: string): Promise<Deck | null> {
    const docRef = doc(this.firebase.database, 'decks', deckId);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      return docSnap.data() as Deck;
    } else {
      return null;
    }
  }

  public async newDeck(deckData: Deck): Promise<void> {
    const docRef = doc(this.firebase.database, 'decks', deckData.id);
    await setDoc(docRef, {
      ...deckData
    }, { merge: true });
  }

  public async deckRemove(deckId: string): Promise<void> {
    const docRef = doc(this.firebase.database, 'decks', deckId);
    await deleteDoc(docRef);
  }

  public async updateDeck(deckId: string, data: any): Promise<void> {
    const docRef = doc(this.firebase.database, 'decks', deckId);
    return await setDoc(docRef,
      { ...data }, { merge: true });
  }

  /**
   * Copies someone else's (public/shared) deck into the current user's own
   * account as a brand new private deck. Never mutates the source deck.
   */
  public async cloneDeck(source: Deck): Promise<string> {
    const newId = Math.random().toString(36).substring(2, 15);
    const cloned: Deck = {
      ...source,
      id: newId,
      createdBy: this.firebase.$user()!.uid,
      visibility: 'private',
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    await this.newDeck(cloned);
    return newId;
  }
}
