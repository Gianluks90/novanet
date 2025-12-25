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
  getDocs
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
    approved: boolean
  ): Promise<void> {
    await this.setTranslation(card, lang, approved);
  }

  /**
   * Admin approves a translation.
   */
  public async approveTranslation(
    card: Pick<Card, 'code' | 'title' | 'text' | 'flavor'>,
    lang: string
  ): Promise<void> {
    await this.setTranslation(card, lang, true);
    await this.updateGlobalTranslationStatus();
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
    card: Pick<Card, 'code' | 'title' | 'text' | 'flavor'>,
    lang: string,
    approved: boolean
  ): Promise<void> {
    // const cardDocRef = doc(
    //   collection(this.firebaseService.database, 'translations', 'cards'),
    //   card.code
    // );

    const cardDocRef = doc(
      this.firebaseService.database,
      'translations',
      card.code
    );

    await setDoc(
      cardDocRef,
      {
        updatedAt: approved ? Timestamp.now() : null,
        translations: {
          [lang]: {
            code: card.code,
            title: card.title,
            text: card.text,
            flavor: card.flavor,
            approved: approved,
            reported: false,
            translatedAt: Timestamp.now(),
          },
        },
      },
      { merge: true }
    );
  }

  public async getUpdatedTranslations(lastSyncAt: Timestamp): Promise<Array<any>> {
    const translationsRef = collection(
      this.firebaseService.database,
      'translations'
    );

    const q = query(
      translationsRef,
      where('updatedAt', '>', lastSyncAt)
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
  private async updateGlobalTranslationStatus(): Promise<void> {
    const configDocRef = doc(
      collection(this.firebaseService.database, 'config'),
      'translationConfigs'
    );

    await updateDoc(configDocRef, {
      translationsLastUpdatedAt: Timestamp.now(),
    });
  }

  public async getGlobalTranslationStatus(): Promise<any> {
    const configDocRef = doc(this.firebaseService.database, 'config', 'translationConfigs');
    return await getDoc(configDocRef);
  }
}
