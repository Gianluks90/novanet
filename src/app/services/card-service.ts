import { Injectable } from '@angular/core';
import { FirebaseService } from './firebase-service';
import { Card } from '../models/card';
import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  Timestamp,
  getDoc,
  query,
  where,
  getDocs,
  increment,
  limit,
  orderBy
} from 'firebase/firestore';

@Injectable({
  providedIn: 'root',
})
export class CardService {
  constructor(private firebaseService: FirebaseService) { }

  /**
   * User submits a translation.
   * If not approved, it is added to pending.
   */
  public async submitTranslation(
    card: Pick<Card, 'code' | 'title' | 'text' | 'flavor'>,
    lang: string,
    approved: boolean,
    version?: number
  ): Promise<void> {
    await this.setTranslation(card, lang, approved, version);
    await this.updateGlobalTranslationStatus();
  }

  /**
   * Admin approves a translation.
   */
  public async approveTranslation(
    card: Pick<Card, 'code' | 'title' | 'text' | 'flavor'>,
    lang: string
  ): Promise<void> {
    // Atomically increment the global version and get the new value
    const newVersion = await this.incrementGlobalTranslationVersion();

    // Use the new version for the translation
    await this.setTranslation(card, lang, true, newVersion);
  }

  /**
   * Marks a translation as reported.
   */
  public async reportTranslation(
    cardCode: string,
    lang: string
  ): Promise<void> {
    const cardDocRef = doc(
      this.firebaseService.database,
      'translations',
      cardCode
    );

    await updateDoc(cardDocRef, {
      [`translations.${lang}.reported`]: true,
    });
  }

  /**
   * Writes or updates a translation inside translations/cards/{cardCode}
   */
  private async setTranslation(
    card: Pick<Card, 'code'>,
    lang: string,
    approved: boolean,
    version?: number
  ): Promise<void> {
    const cardDocRef = doc(
      this.firebaseService.database,
      'translations',
      card.code
    );

    const existingDoc = await getDoc(cardDocRef);
    const existingTranslations = existingDoc.data()?.['translations'] || {};
    const existingLangTranslation = existingTranslations[lang] || {};

    await setDoc(
      cardDocRef,
      {
        translations: {
          [lang]: {
            ...existingLangTranslation,
            approved: approved,
            reported: existingLangTranslation.reported ?? false,
            translatedAt: existingLangTranslation.translatedAt ?? Timestamp.now(),
            version: version ?? existingLangTranslation.version ?? null,
          }
        }
      },
      { merge: true }
    );
  }

  public async getApprovedTranslationsSinceVersion(
    lang: string,
    lastVersion: number
  ): Promise<Array<any>> {
    const translationsRef = collection(
      this.firebaseService.database,
      'translations'
    );

    const q = query(
      translationsRef,
      where(`translations.${lang}.approved`, '==', true),
      where(`translations.${lang}.version`, '>', lastVersion)
    );

    const snapshot = await getDocs(q);

    return snapshot.docs.map(doc => ({
      code: doc.id,
      ...doc.data()
    }));
  }

  public async getAllApprovedTranslations(lang: string): Promise<Array<any>> {
    const translationsRef = collection(
      this.firebaseService.database,
      'translations'
    );

    const q = query(
      translationsRef,
      where(`translations.${lang}.approved`, '==', true)
    );

    const snapshot = await getDocs(q);

    return snapshot.docs.map(doc => ({
      code: doc.id,
      ...doc.data()
    }));
  }

  /**
   * Updates the global translations version.
   * Called ONLY when an admin approves a translation.
   */
  private async incrementGlobalTranslationVersion(): Promise<number> {
    const configDocRef = doc(
      collection(this.firebaseService.database, 'configs'),
      'translationsConfig'
    );

    // Atomically increment version
    await updateDoc(configDocRef, { version: increment(1) });

    // Read back the updated version
    const snap = await getDoc(configDocRef);
    return snap.data()?.['version'] ?? 0;
  }

  private async updateGlobalTranslationStatus(): Promise<void> {
    const configDocRef = doc(
      collection(this.firebaseService.database, 'configs'),
      'translationsConfig'
    );

    const snap = await getDoc(configDocRef);
    if (!snap.exists()) {
      // Only initialize if config does not exist
      await setDoc(configDocRef, { version: 0 });
    }
  }

  public async getGlobalTranslationStatus(): Promise<any> {
    const configDocRef = doc(this.firebaseService.database, 'configs', 'translationsConfig');
    return await getDoc(configDocRef);
  }

  public async getNotApprovedTranslationsCards(lang: string): Promise<Array<any>> {
    const translationsRef = collection(
      this.firebaseService.database,
      'translations'
    );

    const q = query(
      translationsRef,
      where(`translations.${lang}.approved`, '==', false),
      limit(200)
    );

    const snapshot = await getDocs(q);

    return snapshot.docs.map(doc => ({
      code: doc.id,
      ...doc.data()
    }));
  }
}