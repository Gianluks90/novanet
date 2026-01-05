import { Injectable, signal, WritableSignal } from '@angular/core';
import { FirebaseService } from './firebase-service';
import { Deck } from '../models/deck';
import { addDoc, arrayRemove, arrayUnion, collection, doc, documentId, getDoc, onSnapshot, query, setDoc, where } from 'firebase/firestore';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class DeckService {
  public $decks: WritableSignal<Deck[]> = signal<Deck[]>([]);

  constructor(private firebase: FirebaseService) { }

  public getDecksByUser(): void {
     const colRef = collection(this.firebase.database, 'decks');
     console.log(this.firebase.$user()!.uid);
     
     const q = query(colRef, where('createdBy', '==', this.firebase.$user()!.uid));
     const unsub = onSnapshot(q, (snapshot) => {
       const decks: Deck[] = [];
       snapshot.forEach((doc) => {
         decks.push(doc.data() as Deck);
       });
       this.$decks.set(decks);
     });
  }

  public async newDeck(deckData: Deck): Promise<void> {
    const docRef = doc(this.firebase.database, 'decks', deckData.id);
    const userRef = doc(this.firebase.database, 'users', this.firebase.$user()!.uid);
    Promise.all([
      setDoc(docRef, { 
        ...deckData 
      }, { merge: true }),
      setDoc(userRef, {
        deckIds: arrayUnion(deckData.id)
      }, { merge: true })
    ])
  }

  public async deckRemove(deckId: string): Promise<void> {
    const docRef = doc(this.firebase.database, 'decks', deckId);
    const userRef = doc(this.firebase.database, 'users', deckId);
    Promise.all([
      setDoc(docRef, { 
        visibility: 'private' 
      }, { merge: true }),
      setDoc(userRef, {
        deckIds: arrayRemove(deckId)
      }, { merge: true })
    ])
  }

  public async updateDeck(deckId: string, data: any): Promise<void> {
    const docRef = doc(this.firebase.database, 'decks', deckId);
    return await setDoc(docRef, 
      { ...data }, { merge: true });
  }
}
