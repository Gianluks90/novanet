import { inject, Injectable } from '@angular/core';
import { browserLocalPersistence, getAuth, GoogleAuthProvider, setPersistence, signInWithPopup } from 'firebase/auth';
import { I18nService } from '../i18n/i18n-service';
import { NotificationService } from './notification-service';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private notification = inject(NotificationService);
  private i18n = inject(I18nService);

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

  /** Entry point for buttons: like `loginWithGoogle` but failures are reported with a notification. */
  public async signIn(): Promise<boolean> {
    try {
      return await this.loginWithGoogle();
    } catch (err) {
      console.error('Authentication error:', err);
      this.notification.notify(this.i18n.t('notifications.authError'), 'dangerous');
      return false;
    }
  }

  /** Entry point for buttons: like `logout` but failures are reported with a notification. */
  public async signOut(): Promise<void> {
    try {
      await this.logout();
    } catch (err) {
      console.error('Authentication error:', err);
      this.notification.notify(this.i18n.t('notifications.authError'), 'dangerous');
    }
  }
}
