import { Component, inject } from '@angular/core';
import { UiDialogContainer, UIButton } from "../../../ui";
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { DialogResult } from '../../../models/DialogResult';
import { Form, FormBuilder, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';

@Component({
  selector: 'app-import-export-card-list-dialog',
  imports: [UiDialogContainer, UIButton, FormsModule, ReactiveFormsModule],
  templateUrl: './import-export-card-list-dialog.html',
  styleUrl: './import-export-card-list-dialog.scss',
})
export class ImportExportCardListDialog {
  public dialogRef = inject<DialogRef<DialogResult, ImportExportCardListDialog>>(DialogRef);
  public data = inject(DIALOG_DATA) as { list: string };
  public form: FormGroup;

  constructor(private fb: FormBuilder) {
    this.form = this.fb.group({
      cardList: [this.data.list || '']
    });

    if (this.data.list) {
      this.form.patchValue({
        cardList: this.data.list
      });
    }
  }

  public copyToClipboard() {
    const cardListTextarea = document.getElementById('cardList') as HTMLTextAreaElement;
    cardListTextarea.select();
    document.execCommand('copy');
  }

  public onSubmit() {
    this.dialogRef.close({ status: 'confirmed', data: { list: this.form.value.cardList } });
  }
}
