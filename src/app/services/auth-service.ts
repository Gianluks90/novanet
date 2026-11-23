import { Injectable } from '@angular/core';
import { browserLocalPersistence, getAuth, GoogleAuthProvider, setPersistence, signInWithPopup } from 'firebase/auth';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  /**
   * Opens the Google sign-in popup. Resolves to `true` when signed in, `false` when the user
   * simply closed/cancelled the popup; throws for real errors (network, blocked popup, ...).
   */
  public async loginWithGoogle(): Promise<boolean> {
    const auth = getAuth();
    await setPersistence(auth, browserLocalPersistence);
    auth.useDeviceLanguage();
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
      return true;
    } catch (error: any) {
      if (error?.code === 'auth/popup-closed-by-user' || error?.code === 'auth/cancelled-popup-request') {
        return false;
      }
      throw error;
    }
  }

  public async logout(): Promise<void> {
    await getAuth().signOut();
  }
}
