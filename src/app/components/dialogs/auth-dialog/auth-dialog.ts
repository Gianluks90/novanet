import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { DialogRef } from '@angular/cdk/dialog';
import { UiDialogContainer, UIButton, UiField } from '../../../ui';
import { TranslatePipe } from '../../../i18n/translate-pipe';
import { TranslationKey } from '../../../i18n/en';
import { DialogResult } from '../../../models/DialogResult';
import { AuthService } from '../../../services/auth-service';

export type AuthMode = 'signin' | 'register' | 'reset';

const TITLES: Record<AuthMode, TranslationKey> = {
  signin: 'authDialog.signInTitle',
  register: 'authDialog.registerTitle',
  reset: 'authDialog.resetTitle',
};

const INTROS: Record<AuthMode, TranslationKey> = {
  signin: 'authDialog.signInIntro',
  register: 'authDialog.registerIntro',
  reset: 'authDialog.resetIntro',
};

const SUBMIT_LABELS: Record<AuthMode, TranslationKey> = {
  signin: 'authDialog.signInButton',
  register: 'authDialog.registerButton',
  reset: 'authDialog.resetButton',
};

/**
 * Sign-in / registration / password reset in one dialog: email + password, plus "Sign in with
 * Google". Closes with `{status: 'confirmed'}` once the user is signed in, `cancelled` otherwise.
 */
@Component({
  selector: 'app-auth-dialog',
  imports: [TranslatePipe, UiDialogContainer, UIButton, UiField, ReactiveFormsModule],
  templateUrl: './auth-dialog.html',
  styleUrl: './auth-dialog.scss',
})
export class AuthDialog {
  private dialogRef = inject<DialogRef<DialogResult, AuthDialog>>(DialogRef);
  private auth = inject(AuthService);
  private fb = inject(FormBuilder).nonNullable;

  public readonly mode = signal<AuthMode>('signin');
  public readonly busy = signal(false);
  /** Translation key of the last error, shown above the form. */
  public readonly error = signal<TranslationKey | null>(null);
  /** Address a reset link was just sent to (replaces the form with a confirmation). */
  public readonly resetSentTo = signal<string | null>(null);

  public readonly title = computed(() => TITLES[this.mode()]);
  public readonly intro = computed(() => INTROS[this.mode()]);
  public readonly submitLabel = computed(() => SUBMIT_LABELS[this.mode()]);

  public readonly form = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
    confirm: [''],
  });

  constructor() {
    this.applyMode('signin');
  }

  public setMode(mode: AuthMode) {
    this.applyMode(mode);
    this.error.set(null);
    this.resetSentTo.set(null);
    this.mode.set(mode);
  }

  /** Only the fields of the current mode take part in validation. */
  private applyMode(mode: AuthMode) {
    const { name, password, confirm } = this.form.controls;
    const toggle = (control: { enable(): void; disable(): void }, on: boolean) => on ? control.enable() : control.disable();
    toggle(name, mode === 'register');
    toggle(confirm, mode === 'register');
    toggle(password, mode !== 'reset');
    this.form.markAsUntouched();
  }

  /** The "confirm password" field is filled in and different from the password. */
  public get passwordMismatch(): boolean {
    const { password, confirm } = this.form.controls;
    return this.mode() === 'register' && confirm.touched && confirm.value !== password.value;
  }

  public showError(control: 'name' | 'email' | 'password'): boolean {
    const c = this.form.controls[control];
    return c.enabled && c.touched && c.invalid;
  }

  public async submit() {
    this.form.markAllAsTouched();
    if (this.busy() || this.form.invalid || this.passwordMismatch) return;

    const { name, email, password } = this.form.getRawValue();
    this.busy.set(true);
    this.error.set(null);
    try {
      switch (this.mode()) {
        case 'signin':
          await this.auth.loginWithEmail(email, password);
          this.signedIn();
          break;
        case 'register':
          await this.auth.registerWithEmail(email, password, name);
          this.signedIn();
          break;
        case 'reset':
          await this.auth.sendPasswordReset(email);
          this.resetSentTo.set(email.trim());
          break;
      }
    } catch (err) {
      this.fail(err);
    } finally {
      this.busy.set(false);
    }
  }

  public async google() {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      if (await this.auth.loginWithGoogle()) this.signedIn();
    } catch (err) {
      this.fail(err);
    } finally {
      this.busy.set(false);
    }
  }

  public close() {
    this.dialogRef.close({ status: 'cancelled' });
  }

  private signedIn() {
    this.dialogRef.close({ status: 'confirmed' });
  }

  private fail(err: unknown) {
    console.error('Authentication error:', err);
    this.error.set(this.auth.errorKey(err));
  }
}
