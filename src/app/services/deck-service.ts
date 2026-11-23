import { effect, Injectable, signal, WritableSignal } from '@angular/core';
import { FirebaseService } from './firebase-service';
import { Deck } from '../models/deck';
import { collection, deleteDoc, doc, getDoc, limit, onSnapshot, query, setDoc, Timestamp, where } from 'firebase/firestore';

@Injectable({
  providedIn: 'root',
})
export class DeckService {
  public $decks: WritableSignal<Deck[]> = signal<Deck[]>([]);
  public $publicDecks: WritableSignal<Deck[]> = signal<Deck[]>([]);

  private unsubscribeMine: (() => void) | null = null;
  private mineUid: string | null = null;
  private unsubscribePublic: (() => void) | null = null;

  /** Maximum number of public decks listed in the gallery. */
  private static readonly GALLERY_LIMIT = 100;

  constructor(private firebase: FirebaseService) {
    // Stop listening (and forget the data) when the user signs out.
    effect(() => {
      if (!this.firebase.$user()) {
        this.unsubscribeMine?.();
        this.unsubscribeMine = null;
        this.mineUid = null;
        this.$decks.set([]);
      }
    });
  }

  /** Live list of the signed-in user's decks. Idempotent: calling it again for the same user is a no-op. */
  public getDecksByUser(): void {
    const uid = this.firebase.$user()?.uid;
    if (!uid) return;
    if (this.unsubscribeMine && this.mineUid === uid) return;

    this.unsubscribeMine?.();
    this.mineUid = uid;
    const q = query(collection(this.firebase.database, 'decks'), where('createdBy', '==', uid));
    this.unsubscribeMine = onSnapshot(q, (snapshot) => {
      this.$decks.set(snapshot.docs.map(d => d.data() as Deck));
    });
  }

  /**
   * Community gallery: decks anyone can browse (most recently updated of the first
   * GALLERY_LIMIT). `visibility: 'shared'` decks are deliberately not queryable here --
   * they're only reachable via a direct link (getDeckById), never listed.
   * Idempotent: the listener is created once per session.
   */
  public getPublicDecks(): void {
    if (this.unsubscribePublic) return;

    const q = query(
      collection(this.firebase.database, 'decks'),
      where('visibility', '==', 'public'),
      limit(DeckService.GALLERY_LIMIT)
    );
    this.unsubscribePublic = onSnapshot(q, (snapshot) => {
      const decks = snapshot.docs.map(d => d.data() as Deck);
      decks.sort((a, b) => (b.updatedAt?.toMillis?.() ?? 0) - (a.updatedAt?.toMillis?.() ?? 0));
      this.$publicDecks.set(decks);
    }, () => {
      // e.g. permission denied after sign-out: allow a retry on the next call
      this.unsubscribePublic = null;
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
    const newId = crypto.randomUUID();
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
