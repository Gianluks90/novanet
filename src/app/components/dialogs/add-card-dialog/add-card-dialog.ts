import { Component, inject, LOCALE_ID } from '@angular/core';
import { UIButton, UiDialogContainer } from "../../../ui";
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { DialogResult } from '../../../models/DialogResult';
import { NewDeckDialog } from '../new-deck-dialog/new-deck-dialog';
import { Card } from '../../../models/card';
import { CardDetail } from "../../card-detail/card-detail";
import { Pack } from '../../../models/pack';

@Component({
  selector: 'app-add-card-dialog',
  imports: [UiDialogContainer, UIButton, CardDetail],
  templateUrl: './add-card-dialog.html',
  styleUrl: './add-card-dialog.scss',
})
export class AddCardDialog {
  public dialogRef = inject<DialogRef<DialogResult, NewDeckDialog>>(DialogRef);
  public data = inject(DIALOG_DATA) as { card: Card, packs: Pack[] };
  public locale = inject(LOCALE_ID);

  public addCard(quantity: number) {
    this.dialogRef.close({ status: 'confirmed', data: { card: this.data.card, quantity } });
  }
}
