import { Component, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { UiDialogContainer, UIButton } from '../../../ui';
import { DialogResult } from '../../../models/DialogResult';
import { TranslatePipe } from '../../../i18n/translate-pipe';
import { CardBackPicker } from '../../card-back-picker/card-back-picker';

/** Picks the card back of a deck. The result carries `data.cardBack`: a catalog id, or null for "my default". */
@Component({
  selector: 'app-card-back-dialog',
  imports: [TranslatePipe, UiDialogContainer, UIButton, CardBackPicker],
  templateUrl: './card-back-dialog.html',
  styleUrl: './card-back-dialog.scss',
})
export class CardBackDialog {
  public dialogRef = inject<DialogRef<DialogResult, CardBackDialog>>(DialogRef);
  public data = inject(DIALOG_DATA) as { side: 'runner' | 'corp'; value: string | null };
  public selected = signal<string | null>(this.data.value);

  public confirm() {
    this.dialogRef.close({ status: 'confirmed', data: { cardBack: this.selected() } });
  }
}
