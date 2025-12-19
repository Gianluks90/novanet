import { effect, Injectable, signal, WritableSignal } from "@angular/core";
import { initializeApp } from "firebase/app";
import { doc, DocumentData, Firestore, getDoc, getFirestore, onSnapshot, setDoc, Timestamp } from "firebase/firestore";
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

    constructor() {
        const app = initializeApp(FIREBASE_CONFIG);
        this.database = getFirestore(app);

        getAuth().onAuthStateChanged(async user => {
            if (user) {
                await this.ensureUserExists(user);
                await this.getSignalUser();
            }
        });

        effect(() => {
            this.user = this.$user();
        });
    }

    public async getSignalUser() {
        const authUser = getAuth().currentUser!;
        const docRef = doc(this.database, 'users', authUser.uid);
        const unsub = onSnapshot(docRef, (doc) => {
            if (doc.exists()) {
                const user: DocumentData = doc.data();
                this.$user.set({
                    uid: doc.id,
                    createdAt: user['createdAt'],
                    displayName: user['displayName'],
                    email: user['email'],
                    photoURL: user['photoURL'],
                    customPhotoURL: user['customPhotoURL'] ?? null,
                    customAccentColor: user['customAccentColor'] ?? null,
                    nickname: user['nickname'] ?? null,
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
                displayName: user.displayName ?? null,
                photoURL: user.photoURL ?? null,
                createdAt: Timestamp.now(),
            });
        }
    }
}