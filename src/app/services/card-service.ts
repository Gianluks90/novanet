import { Injectable } from '@angular/core';
import { FirebaseService } from './firebase-service';
import { Card } from '../models/card';
import { doc, setDoc, Timestamp, updateDoc } from 'firebase/firestore';

@Injectable({
  providedIn: 'root',
})
export class CardService {
  constructor(private firebaseService: FirebaseService) {}

  public async setTranslation(
  cardCode: string,
  lang: string,
  card: Card,
  approved: boolean
) {
  const docRef = doc(
    this.firebaseService.database,
    'translations',
    cardCode,
    lang,
    'current'
  );

  return setDoc(docRef, {
    ...card,
    translationApproved: approved,
    translationReported: false,
    translatedAt: Timestamp.now()
  });
}

public async reportTranslation(cardCode: string, lang: string) {
  const docRef = doc(
    this.firebaseService.database,
    'translations',
    cardCode,
    lang,
    'current'
  );

  return updateDoc(docRef, {
    translationReported: true
  });
}
}
