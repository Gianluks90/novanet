import { Component, inject } from '@angular/core';
import { DialogRef } from '@angular/cdk/dialog';
import { UiDialogContainer, UIButton } from '../../../ui';
import { TranslatePipe } from '../../../i18n/translate-pipe';

/** Credits for the card images, the data and the community translations. */
@Component({
  selector: 'app-attribution-dialog',
  imports: [TranslatePipe, UiDialogContainer, UIButton],
  templateUrl: './attribution-dialog.html',
  styleUrl: './attribution-dialog.scss',
})
export class AttributionDialog {
  public dialogRef = inject<DialogRef<unknown, AttributionDialog>>(DialogRef);
}
