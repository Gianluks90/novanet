import { Injectable } from '@angular/core';
import { FirebaseService } from './firebase-service';
import { collection, DocumentSnapshot, getDocs, updateDoc } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

@Injectable({
  providedIn: 'root',
})
export class AdminService {
  constructor(private firebaseService: FirebaseService) {}

  public async updateEveryTranslationModel(): Promise<void> {
    const translationsCollection = collection(
      this.firebaseService.database,
      'translations'
    );

    const translationsSnapshot = await getDocs(translationsCollection);

    const updatePromises: Promise<void>[] = [];

    translationsSnapshot.forEach((docSnap: DocumentSnapshot) => {
      const data = docSnap.data();
      // if (docSnap.id !== '01001') return; // For testing, only process one document
      if (!data) return;
      const translations = data['translations'] || {};
      const myAdminId = getAuth().currentUser?.uid || 'admin';

      for (const lang in translations) {
        const translation = translations[lang];
        if (!translation.translatedBy) {
          // If translatedBy is missing, set it to 'unknown'
          translation.translatedBy = myAdminId;
        }
        if (translation.approved && !translation.approvedBy) {
          // If approvedBy is missing for approved translations, set it to 'admin'
          translation.approvedBy = myAdminId;
        }
      }

      // Prepare the update promise
      const updatePromise = updateDoc(docSnap.ref, { translations });
      updatePromises.push(updatePromise);
    });

    // Wait for all updates to complete
    await Promise.all(updatePromises);
  }
}
