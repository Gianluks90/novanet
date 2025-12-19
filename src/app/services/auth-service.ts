import { Injectable, signal, WritableSignal } from '@angular/core';
import { browserLocalPersistence, getAuth, GoogleAuthProvider, setPersistence, signInWithPopup } from 'firebase/auth';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  constructor() { }

  public async loginWithGoogle() {
    const provider = new GoogleAuthProvider();
    const auth = getAuth();
    await setPersistence(auth, browserLocalPersistence);
    auth.useDeviceLanguage();
    signInWithPopup(auth, provider)
      .then((result) => {
        console.log('User logged in:', result.user);
        const credential = GoogleAuthProvider.credentialFromResult(result);
        const token = credential?.accessToken;
      })
      .catch((error) => {
        const errorCode = error.code;
        const errorMessage = error.message;
        const email = error.customData.email;
        const credential = GoogleAuthProvider.credentialFromError(error);
      });
  }

  public logout() {
    getAuth().signOut();
  }

}
