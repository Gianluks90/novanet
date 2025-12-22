import { Component, inject } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { UiDialogContainer, UIButton } from '../../../ui';
import { DialogRef, DIALOG_DATA } from '@angular/cdk/dialog';
import { DialogResult } from '../../../models/DialogResult';
import { NovaUser } from '../../../models/NovaUser';
import { CardService } from '../../../services/card-service';
import { Card } from '../../../models/card';

@Component({
  selector: 'app-translate-dialog',
  imports: [UiDialogContainer, UIButton, FormsModule, ReactiveFormsModule],
  templateUrl: './translate-dialog.html',
  styleUrl: './translate-dialog.scss',
})
export class TranslateDialog {
  public dialogRef = inject<DialogRef<DialogResult, TranslateDialog>>(DialogRef);
  public data = inject(DIALOG_DATA) as { user: NovaUser | null, card: Card };
  public form: FormGroup;

  constructor(private fb: FormBuilder, private cardService: CardService) {
    this.form = this.fb.group({
      temp: ['']
    })
  }

  public onSubmit() {}
}
