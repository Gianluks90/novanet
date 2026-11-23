import { inject, Injectable, signal } from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import {
  Auth,
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  deleteUser,
  EmailAuthProvider,
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  sendEmailVerification,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  updatePassword,
  updateProfile,
  User,
} from 'firebase/auth';
import { AccountDialog } from '../components/dialogs/account-dialog/account-dialog';
import { AuthDialog } from '../components/dialogs/auth-dialog/auth-dialog';
import { DIALOGS_CONFIG } from '../const/dialogConfig';
import { TranslationKey } from '../i18n/en';
import { I18nService } from '../i18n/i18n-service';
import { DialogResult } from '../models/DialogResult';
import { FirebaseService } from './firebase-service';
import { NotificationService } from './notification-service';

/** Firebase Auth error codes mapped to the message shown to the user. */
const AUTH_ERROR_KEYS: Record<string, TranslationKey> = {
  'auth/invalid-credential': 'authDialog.errorInvalidCredentials',
  'auth/invalid-login-credentials': 'authDialog.errorInvalidCredentials',
  'auth/wrong-password': 'authDialog.errorInvalidCredentials',
  'auth/user-not-found': 'authDialog.errorInvalidCredentials',
  'auth/invalid-email': 'authDialog.errorEmailInvalid',
  'auth/missing-password': 'authDialog.errorPasswordRequired',
  'auth/email-already-in-use': 'authDialog.errorEmailInUse',
  'auth/weak-password': 'authDialog.errorWeakPassword',
  'auth/too-many-requests': 'authDialog.errorTooManyRequests',
  'auth/network-request-failed': 'authDialog.errorNetwork',
  'auth/user-disabled': 'authDialog.errorUserDisabled',
  'auth/account-exists-with-different-credential': 'authDialog.errorAccountExists',
  'auth/popup-blocked': 'authDialog.errorPopupBlocked',
  'auth/requires-recent-login': 'authDialog.errorRecentLogin',
};

/** Codes that just mean "the user changed their mind" (closed the Google popup, opened another one). */
const CANCELLED_CODES = ['auth/popup-closed-by-user', 'auth/cancelled-popup-request'];

/** What the account signed in right now looks like (the Firebase Auth side, not the Firestore profile). */
export interface AuthInfo {
  email: string;
  emailVerified: boolean;
  /** Can sign in with email + password. */
  hasPassword: boolean;
  hasGoogle: boolean;
}

/**
 * Sign-in methods: email + password and Google. Both are optional (see CLAUDE.md): the app works
 * signed out, and the sign-in dialog ([signIn]) is opened wherever an account is needed.
 * The low-level methods throw Firebase errors; [errorKey] turns them into a translation key.
 */
@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private notification = inject(NotificationService);
  private i18n = inject(I18nService);
  private dialog = inject(Dialog);
  private firebase = inject(FirebaseService);

  private pendingDialog: Promise<boolean> | null = null;
  private accountDialogOpen = false;

  private readonly _info = signal<AuthInfo | null>(null);
  /** Email, verification state and sign-in methods of the signed-in account (`null` when signed out). */
  public readonly info = this._info.asReadonly();

  constructor() {
    onAuthStateChanged(getAuth(), user => this.syncInfo(user));
    // The user verifies the email in another tab or on their phone and comes back here.
    window.addEventListener('focus', () => {
      const info = this._info();
      if (info?.hasPassword && !info.emailVerified) void this.refreshVerification().catch(() => undefined);
    });
  }

  private syncInfo(user: User | null) {
    this._info.set(user ? {
      email: user.email ?? '',
      emailVerified: user.emailVerified,
      hasPassword: user.providerData.some(p => p.providerId === 'password'),
      hasGoogle: user.providerData.some(p => p.providerId === 'google.com'),
    } : null);
  }

  /** Auth instance with local persistence and the e-mails (verification, reset) in the app language. */
  private async auth(): Promise<Auth> {
    const auth = getAuth();
    await setPersistence(auth, browserLocalPersistence);
    auth.languageCode = this.i18n.lang();
    return auth;
  }

  /**
   * Entry point for the "sign in / register" buttons: opens the sign-in dialog.
   * Resolves to `true` when the user ends up signed in, `false` when they close the dialog.
   * Calling it while the dialog is already open returns the same pending promise.
   */
  public signIn(): Promise<boolean> {
    if (getAuth().currentUser) return Promise.resolve(true);
    if (!this.pendingDialog) {
      const ref = this.dialog.open<DialogResult>(AuthDialog, { ...DIALOGS_CONFIG });
      this.pendingDialog = new Promise<boolean>(resolve => {
        ref.closed.subscribe(result => {
          this.pendingDialog = null;
          resolve(result?.status === 'confirmed');
        });
      });
    }
    return this.pendingDialog;
  }

  /** Opens the account dialog (email verification, password, account deletion). */
  public openAccount(): void {
    if (!getAuth().currentUser || this.accountDialogOpen) return;
    this.accountDialogOpen = true;
    this.dialog.open<DialogResult>(AccountDialog, { ...DIALOGS_CONFIG })
      .closed.subscribe(() => this.accountDialogOpen = false);
  }

  /**
   * Opens the Google sign-in popup. Resolves to `true` when signed in, `false` when the user
   * simply closed/cancelled the popup; throws for real errors (network, blocked popup, ...).
   */
  public async loginWithGoogle(): Promise<boolean> {
    const auth = await this.auth();
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
      return true;
    } catch (error: any) {
      if (CANCELLED_CODES.includes(error?.code)) return false;
      throw error;
    }
  }

  public async loginWithEmail(email: string, password: string): Promise<void> {
    await signInWithEmailAndPassword(await this.auth(), email.trim(), password);
  }

  /**
   * Creates an email/password account, stores the display name (auth profile and Firestore
   * profile) and sends the verification email. Verification is not required to use the app.
   */
  public async registerWithEmail(email: string, password: string, displayName: string): Promise<void> {
    const auth = await this.auth();
    const name = displayName.trim();
    // `onAuthStateChanged` creates the Firestore profile as soon as the account exists, before
    // `updateProfile` has run: hand it the name so the profile is not created without one.
    this.firebase.pendingDisplayName = name;
    try {
      const { user } = await createUserWithEmailAndPassword(auth, email.trim(), password);
      await updateProfile(user, { displayName: name });
      await sendEmailVerification(user).catch(err => console.error('Verification email error:', err));
      this.notification.notify(this.i18n.t('notifications.accountCreated', [user.email ?? email.trim()]), 'info');
    } finally {
      this.firebase.pendingDisplayName = null;
    }
  }

  /** Sends the password reset email. An unknown address is not reported (it would reveal who has an account). */
  public async sendPasswordReset(email: string): Promise<void> {
    try {
      await sendPasswordResetEmail(await this.auth(), email.trim());
    } catch (error: any) {
      if (error?.code !== 'auth/user-not-found') throw error;
    }
  }

  /** Sends (again) the verification email to the signed-in account. */
  public async resendVerification(): Promise<void> {
    const user = getAuth().currentUser;
    if (!user) return;
    await this.auth();
    await sendEmailVerification(user);
  }

  /**
   * Re-reads the account from Firebase after the user (maybe) verified the email, and refreshes
   * the ID token so the Firestore rules see `email_verified` too. Resolves to the new state.
   */
  public async refreshVerification(): Promise<boolean> {
    const user = getAuth().currentUser;
    if (!user) return false;
    await user.reload();
    if (user.emailVerified) await user.getIdToken(true);
    this.syncInfo(user);
    return user.emailVerified;
  }

  /** Changes the password of an email/password account (asks for the current one again). */
  public async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    const user = getAuth().currentUser;
    if (!user?.email) return;
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, currentPassword));
    await updatePassword(user, newPassword);
  }

  /** Google-only accounts get a link to choose a password: after that they can use both methods. */
  public async sendSetPasswordLink(): Promise<void> {
    const email = getAuth().currentUser?.email;
    if (email) await this.sendPasswordReset(email);
  }

  /**
   * Deletes the account for good: confirms the identity again (password, or the Google popup),
   * removes the decks and the profile stored online, then the auth account itself.
   * Data kept on this device (local decks, personal translations) is not touched.
   */
  public async deleteAccount(password?: string): Promise<void> {
    const user = getAuth().currentUser;
    if (!user) return;
    // Re-authenticate first: if it fails nothing has been deleted yet.
    if (password && user.email) {
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
    } else {
      await reauthenticateWithPopup(user, new GoogleAuthProvider());
    }
    await this.firebase.deleteUserData(user.uid);
    await deleteUser(user);
  }

  /** The user just dismissed a popup (not a real error). */
  public isCancelled(error: unknown): boolean {
    return CANCELLED_CODES.includes((error as { code?: string } | null)?.code ?? '');
  }

  /** Translation key of the message to show for an error thrown by the methods above. */
  public errorKey(error: unknown): TranslationKey {
    const code = (error as { code?: string } | null)?.code ?? '';
    return AUTH_ERROR_KEYS[code] ?? 'authDialog.errorGeneric';
  }

  public async logout(): Promise<void> {
    await getAuth().signOut();
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
