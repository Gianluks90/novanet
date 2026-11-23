import { Component, inject } from '@angular/core';
import { UiDialogContainer, UIButton } from '../../../ui';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { DialogResult } from '../../../models/DialogResult';
import { TranslatePipe } from '../../../i18n/translate-pipe';
import { TranslationKey } from '../../../i18n/en';

/** Optional texts (translation keys); without data the dialog is the generic "confirm this operation". */
export interface ConfirmDialogData {
  title?: TranslationKey;
  message?: TranslationKey;
  confirmLabel?: TranslationKey;
}

@Component({
  selector: 'app-confirm-dialog',
  imports: [TranslatePipe, UiDialogContainer, UIButton],
  templateUrl: './confirm-dialog.html',
  styleUrl: './confirm-dialog.scss',
})
export class ConfirmDialog {
  public dialogRef = inject<DialogRef<DialogResult,ConfirmDialog>>(DialogRef);
  private data = inject<ConfirmDialogData | null>(DIALOG_DATA, { optional: true });

  public title: TranslationKey = this.data?.title ?? 'confirmDialog.confirm';
  public message: TranslationKey = this.data?.message ?? 'confirmDialog.pressConfirmIfYouWish';
  public confirmLabel: TranslationKey = this.data?.confirmLabel ?? 'confirmDialog.confirm';

  public confirm() {
    this.dialogRef.close({ status: 'confirmed' });
  }
}
