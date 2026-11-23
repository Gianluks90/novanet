import { effect, Injectable, signal, WritableSignal } from "@angular/core";
import { initializeApp } from "firebase/app";
import { collection, deleteDoc, doc, DocumentData, Firestore, getDoc, getDocs, getFirestore, onSnapshot, query, setDoc, Timestamp, where, writeBatch } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { FIREBASE_CONFIG } from "../environment/firebaseConfig";
import { NovaUser } from "../models/NovaUser";

@Injectable({
    providedIn: 'root',
})
export class FirebaseService {
    public database: Firestore;
    public $user: WritableSignal<NovaUser | null> = signal(null);
    public user: NovaUser | null = null;
    /** Name chosen at registration, used while the auth profile does not have a display name yet. */
    public pendingDisplayName: string | null = null;

    constructor() {
        const app = initializeApp(FIREBASE_CONFIG);
        this.database = getFirestore(app);

        getAuth().onAuthStateChanged(async user => {
            this.stopProfileListener();
            if (user) {
                await this.ensureUserExists(user);
                await this.getSignalUser();
            } else {
                this.$user.set(null);
            }
        });

        effect(() => {
            this.user = this.$user();
        });
    }

    private unsubscribeProfile: (() => void) | null = null;

    private stopProfileListener() {
        this.unsubscribeProfile?.();
        this.unsubscribeProfile = null;
    }

    public async getSignalUser() {
        const authUser = getAuth().currentUser;
        if (!authUser) return;
        this.stopProfileListener();
        const docRef = doc(this.database, 'users', authUser.uid);
        this.unsubscribeProfile = onSnapshot(docRef, (doc) => {
            if (doc.exists()) {
                const user: DocumentData = doc.data();
                this.$user.set({
                    uid: doc.id,
                    createdAt: user['createdAt'],
                    displayName: user['displayName'],
                    email: user['email'],
                    photoURL: user['photoURL'],
                    customPhotoURL: user['customPhotoURL'] ?? null,
                    accentColors: user['accentColors'] ?? null,
                    customBackgroundURL: user['customBackgroundURL'] ?? null,
                    nickname: user['nickname'] ?? null,
                    favoriteCaption: user['favoriteCaption'] ?? null,
                    favoriteFaction: user['favoriteFaction'] ?? null,
                    role: user['role'] ?? null,
                });
            }
        })
    };

    public async ensureUserExists(user: any) {
        const docRef = doc(this.database, 'users', user.uid);
        const snap = await getDoc(docRef);
        if (!snap.exists()) {
            await setDoc(docRef, {
                uid: user.uid,
                email: user.email ?? null,
                displayName: user.displayName ?? this.pendingDisplayName ?? null,
                photoURL: user.photoURL ?? null,
                createdAt: Timestamp.now(),
            });
        }
    }

    /**
     * Deletes everything the account has online: its decks, then its profile. Must run while the
     * user is still signed in (the Firestore rules need it), i.e. before the auth account is deleted.
     */
    public async deleteUserData(uid: string): Promise<void> {
        this.stopProfileListener();
        const decks = await getDocs(query(collection(this.database, 'decks'), where('createdBy', '==', uid)));
        // a batch holds at most 500 writes
        for (let i = 0; i < decks.docs.length; i += 400) {
            const batch = writeBatch(this.database);
            decks.docs.slice(i, i + 400).forEach(d => batch.delete(d.ref));
            await batch.commit();
        }
        await deleteDoc(doc(this.database, 'users', uid));
    }
}
