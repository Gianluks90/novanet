import { Injectable } from '@angular/core';
import { FirebaseService } from './firebase-service';
import { doc, setDoc } from 'firebase/firestore';

@Injectable({
  providedIn: 'root',
})
export class UserService {
  constructor(private firebaseService: FirebaseService) { }

  // public async changeUserNickname(uid: string, newNickname: string): Promise<void> {
  //   const docRef = doc(this.firebaseService.database, 'users', uid);
  //   return await setDoc(docRef, { nickname: newNickname }, { merge: true });
  // }

  public async updateUserInfo(uid: string, data: any): Promise<void> {
    const docRef = doc(this.firebaseService.database, 'users', uid);
    return await setDoc(docRef, { ...data }, { merge: true });
  }
}
