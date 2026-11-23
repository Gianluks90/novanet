import { computed, effect, Injectable, signal, WritableSignal } from '@angular/core';
import { getAuth } from 'firebase/auth';
import { collection, deleteDoc, doc, getDoc, limit, onSnapshot, query, setDoc, Timestamp, where } from 'firebase/firestore';
import { FirebaseService } from './firebase-service';
import { Deck } from '../models/deck';
import { userDb } from '../db/user-indexed-db';

/**
 * Decks live in one of two places:
 *  - on this device (IndexedDB `novanet-user`, `deck.local === true`, `createdBy === 'local'`):
 *    no account needed, never leaves the browser;
 *  - online (Firestore `decks`): needs a signed-in user; can be shared/published.
 * Every method that takes a deck id works for both: local decks are looked up first.
 * A local deck can be moved online with `uploadLocalDeck`.
 */
@Injectable({
  providedIn: 'root',
})
export class DeckService {
  /** Online decks of the signed-in user. */
  public $decks: WritableSignal<Deck[]> = signal<Deck[]>([]);
  public $localDecks: WritableSignal<Deck[]> = signal<Deck[]>([]);
  public $publicDecks: WritableSignal<Deck[]> = signal<Deck[]>([]);
  /** Everything the user can edit: decks on this device + online decks. */
  public readonly $myDecks = computed(() => [...this.$localDecks(), ...this.$decks()]);

  private unsubscribeMine: (() => void) | null = null;
  private mineUid: string | null = null;
  private unsubscribePublic: (() => void) | null = null;
  private localReady: Promise<void>;

  /** Maximum number of public decks listed in the gallery. */
  private static readonly GALLERY_LIMIT = 100;

  constructor(private firebase: FirebaseService) {
    this.localReady = this.loadLocalDecks();

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

  // ---- online decks: live lists ----------------------------------------------

  /** Live list of the signed-in user's online decks. Idempotent for the same user. */
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

  // ---- read / write (local or online) ----------------------------------------

  public async getDeckById(deckId: string): Promise<Deck | null> {
    await this.localReady;
    const local = this.$localDecks().find(d => d.id === deckId);
    if (local) return local;

    const docSnap = await getDoc(doc(this.firebase.database, 'decks', deckId));
    return docSnap.exists() ? (docSnap.data() as Deck) : null;
  }

  /** Original author fields for a deck: kept if the deck already has them, otherwise the current user. */
  public authorFields(deck: Pick<Deck, 'originalAuthorId' | 'originalAuthorName' | 'createdBy'>): { originalAuthorId: string; originalAuthorName: string } {
    const user = this.firebase.$user();
    const auth = getAuth().currentUser;
    return {
      originalAuthorId: deck.originalAuthorId ?? auth?.uid ?? deck.createdBy,
      originalAuthorName: deck.originalAuthorName ?? (user?.nickname || user?.displayName || auth?.displayName || ''),
    };
  }

  /** Creates a deck: on this device when `deck.local`, otherwise online (always recording its original author). */
  public async newDeck(deck: Deck): Promise<void> {
    const { local, ...data } = deck;
    if (local) {
      await this.putLocal({ ...data, local: true });
      return;
    }
    await setDoc(doc(this.firebase.database, 'decks', deck.id), { ...data, ...this.authorFields(data) }, { merge: true });
  }

  public async deckRemove(deckId: string): Promise<void> {
    if (this.findLocal(deckId)) {
      await (await userDb).delete('decks', deckId);
      this.$localDecks.update(list => list.filter(d => d.id !== deckId));
      return;
    }
    await deleteDoc(doc(this.firebase.database, 'decks', deckId));
  }

  public async updateDeck(deckId: string, data: any): Promise<void> {
    const { local: _ignored, ...fields } = data;
    const current = this.findLocal(deckId);
    if (current) {
      await this.putLocal({ ...current, ...fields, local: true });
      return;
    }
    await setDoc(doc(this.firebase.database, 'decks', deckId), { ...fields }, { merge: true });
  }

  /**
   * Copies someone else's (public/shared) deck into the current user's own
   * account as a brand new private online deck. Never mutates the source deck.
   */
  public async cloneDeck(source: Deck): Promise<string> {
    const { local: _ignored, ...base } = source;
    const newId = crypto.randomUUID();
    const cloned: Deck = {
      ...base,
      // a copy keeps the original author (never the person copying it)
      originalAuthorId: base.originalAuthorId ?? base.createdBy,
      originalAuthorName: base.originalAuthorName ?? '',
      clonedFrom: source.id,
      id: newId,
      createdBy: this.firebase.$user()!.uid,
      visibility: 'private',
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    await this.newDeck(cloned);
    return newId;
  }

  /**
   * Moves a deck from this device to the signed-in user's account (as a private deck).
   * Throws if nobody is signed in. Returns the online version of the deck.
   */
  public async uploadLocalDeck(deckId: string): Promise<Deck> {
    const local = this.findLocal(deckId);
    if (!local) throw new Error('Local deck not found');
    const uid = getAuth().currentUser?.uid;
    if (!uid) throw new Error('Not signed in');

    const { local: _ignored, ...base } = local;
    const online: Deck = {
      ...base,
      ...this.authorFields({ ...base, createdBy: uid }),
      createdBy: uid,
      visibility: 'private',
      updatedAt: Timestamp.now(),
    };
    await setDoc(doc(this.firebase.database, 'decks', deckId), { ...online });

    await (await userDb).delete('decks', deckId);
    this.$localDecks.update(list => list.filter(d => d.id !== deckId));
    return online;
  }

  // ---- local storage ---------------------------------------------------------

  private findLocal(deckId: string): Deck | undefined {
    return this.$localDecks().find(d => d.id === deckId);
  }

  private async putLocal(deck: Deck): Promise<void> {
    const { local: _ignored, ...stored } = deck;
    await (await userDb).put('decks', stored, deck.id);
    this.$localDecks.update(list => [...list.filter(d => d.id !== deck.id), deck]);
  }

  private async loadLocalDecks(): Promise<void> {
    try {
      const rows: any[] = await (await userDb).getAll('decks');
      // IndexedDB keeps only the plain fields of a Timestamp: rebuild the real objects.
      const toTimestamp = (t: any) => (t ? new Timestamp(t.seconds, t.nanoseconds) : Timestamp.now());
      this.$localDecks.set(rows.map(d => ({
        ...d,
        local: true,
        createdAt: toTimestamp(d.createdAt),
        updatedAt: toTimestamp(d.updatedAt),
      } as Deck)));
    } catch (err) {
      console.error('[decks] could not load decks saved on this device', err);
    }
  }
}
