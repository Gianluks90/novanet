import { Component, inject } from '@angular/core';
import { UiDialogContainer, UIButton } from '../../../ui';
import { DialogRef } from '@angular/cdk/dialog';
import { DialogResult } from '../../../models/DialogResult';

@Component({
  selector: 'app-confirm-dialog',
  imports: [UiDialogContainer, UIButton],
  templateUrl: './confirm-dialog.html',
  styleUrl: './confirm-dialog.scss',
})
export class ConfirmDialog {
  public dialogRef = inject<DialogRef<DialogResult,ConfirmDialog>>(DialogRef);

  public confirm() {
    this.dialogRef.close({ status: 'confirmed' });
  }
}
