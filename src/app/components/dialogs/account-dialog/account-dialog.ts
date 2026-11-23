import { Component, DestroyRef, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { DialogRef } from '@angular/cdk/dialog';
import { UiBadge, UiDialogContainer, UIButton } from '../../../ui';
import { TranslatePipe } from '../../../i18n/translate-pipe';
import { TranslationKey } from '../../../i18n/en';
import { I18nService } from '../../../i18n/i18n-service';
import { DialogResult } from '../../../models/DialogResult';
import { AuthService } from '../../../services/auth-service';
import { NotificationService } from '../../../services/notification-service';

/** Seconds between two verification emails (Firebase rate-limits them anyway). */
const RESEND_COOLDOWN = 60;

/**
 * The signed-in account: email verification, password (change it, or set one for Google-only
 * accounts) and account deletion. Opened with `AuthService.openAccount()`.
 */
@Component({
  selector: 'app-account-dialog',
  imports: [TranslatePipe, UiDialogContainer, UIButton, UiBadge, ReactiveFormsModule],
  templateUrl: './account-dialog.html',
  styleUrl: './account-dialog.scss',
})
export class AccountDialog {
  private dialogRef = inject<DialogRef<DialogResult, AccountDialog>>(DialogRef);
  private auth = inject(AuthService);
  private notification = inject(NotificationService);
  private i18n = inject(I18nService);
  private fb = inject(FormBuilder).nonNullable;

  public readonly info = this.auth.info;
  public readonly busy = signal(false);
  /** Translation key of the last error. */
  public readonly error = signal<TranslationKey | null>(null);
  /** Translated confirmation of the last successful action (verification sent, password changed, ...). */
  public readonly notice = signal<string | null>(null);
  public readonly resendIn = signal(0);
  public readonly confirmingDelete = signal(false);

  public readonly passwordForm = this.fb.group({
    current: ['', Validators.required],
    next: ['', [Validators.required, Validators.minLength(6)]],
    confirm: ['', Validators.required],
  });
  public readonly deletePassword = this.fb.control('', Validators.required);

  private timer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stopTimer());
    // The email may have been verified in the meantime.
    void this.auth.refreshVerification().catch(() => undefined);
  }

  public get passwordMismatch(): boolean {
    const { next, confirm } = this.passwordForm.controls;
    return confirm.touched && confirm.value !== next.value;
  }

  public invalid(control: AbstractControl): boolean {
    return control.touched && control.invalid;
  }

  // --- email verification -------------------------------------------------------------------

  public resend() {
    void this.run(async () => {
      await this.auth.resendVerification();
      this.notice.set(this.i18n.t('account.verificationSent', [this.info()?.email ?? '']));
      this.startCooldown();
    });
  }

  public checkVerification() {
    void this.run(async () => {
      const verified = await this.auth.refreshVerification();
      if (verified) {
        this.notice.set(this.i18n.t('account.verificationDone'));
      } else {
        this.error.set('account.verificationPending');
      }
    });
  }

  private startCooldown() {
    this.stopTimer();
    this.resendIn.set(RESEND_COOLDOWN);
    this.timer = setInterval(() => {
      this.resendIn.update(n => n - 1);
      if (this.resendIn() <= 0) this.stopTimer();
    }, 1000);
  }

  private stopTimer() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  // --- password -----------------------------------------------------------------------------

  public changePassword() {
    this.passwordForm.markAllAsTouched();
    if (this.passwordForm.invalid || this.passwordMismatch) return;
    const { current, next } = this.passwordForm.getRawValue();
    void this.run(async () => {
      await this.auth.changePassword(current, next);
      this.passwordForm.reset();
      this.notice.set(this.i18n.t('account.passwordChanged'));
    });
  }

  public sendSetPasswordLink() {
    void this.run(async () => {
      await this.auth.sendSetPasswordLink();
      this.notice.set(this.i18n.t('account.setPasswordSent', [this.info()?.email ?? '']));
    });
  }

  // --- deletion -----------------------------------------------------------------------------

  public startDelete() {
    this.clearMessages();
    this.deletePassword.reset();
    this.confirmingDelete.set(true);
  }

  public cancelDelete() {
    this.clearMessages();
    this.confirmingDelete.set(false);
  }

  public confirmDelete() {
    const usesPassword = !!this.info()?.hasPassword;
    if (usesPassword) {
      this.deletePassword.markAsTouched();
      if (this.deletePassword.invalid) return;
    }
    void this.run(async () => {
      await this.auth.deleteAccount(usesPassword ? this.deletePassword.value : undefined);
      this.notification.notify(this.i18n.t('account.deleted'), 'check');
      this.dialogRef.close({ status: 'confirmed' });
    });
  }

  public close() {
    this.dialogRef.close({ status: 'cancelled' });
  }

  // --- helpers ------------------------------------------------------------------------------

  private clearMessages() {
    this.error.set(null);
    this.notice.set(null);
  }

  /** Runs an account operation with the busy flag and error reporting. */
  private async run(action: () => Promise<void>) {
    if (this.busy()) return;
    this.busy.set(true);
    this.clearMessages();
    try {
      await action();
    } catch (err) {
      if (!this.auth.isCancelled(err)) {
        console.error('Account error:', err);
        this.error.set(this.auth.errorKey(err));
      }
    } finally {
      this.busy.set(false);
    }
  }
}
