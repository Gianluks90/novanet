import { Component, inject, Signal } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { UiDialogContainer, UIButton, UIDiagonalLine } from '../../../ui';
import { DialogRef, DIALOG_DATA } from '@angular/cdk/dialog';
import { DialogResult } from '../../../models/DialogResult';
import { NovaUser } from '../../../models/NovaUser';
import { CardService } from '../../../services/card-service';
import { Card } from '../../../models/card';
import { CardDetail } from '../../card-detail/card-detail';
import { NrIconsPipe } from "../../../pipes/nr-icons-pipe";
import { CdkMenu, CdkMenuTrigger } from '@angular/cdk/menu';

@Component({
  selector: 'app-translate-dialog',
  imports: [UiDialogContainer, UIButton, FormsModule, ReactiveFormsModule, NrIconsPipe, CdkMenuTrigger, CdkMenu],
  templateUrl: './translate-dialog.html',
  styleUrl: './translate-dialog.scss',
})
export class TranslateDialog {
  public dialogRef = inject<DialogRef<DialogResult, TranslateDialog>>(DialogRef);
  public data = inject(DIALOG_DATA) as { user: NovaUser | null, card: Signal<Card> };
  public form: FormGroup;

  constructor(private fb: FormBuilder, private cardService: CardService) {
    this.form = this.fb.group({
      title: ['', Validators.required],
      flavor: ['', Validators.required],
      text: ['', Validators.required],
    });

    this.form.patchValue({
      title: this.data.card().title,
      flavor: this.data.card().flavor,
      text: this.data.card().text,
    });

    console.log(this.data.card());
    
    if(!this.data.card().flavor) {
      this.form.get('flavor')?.clearValidators();
      this.form.get('flavor')?.updateValueAndValidity();
    }
  }
  
  public onSubmit() {
    if (this.form.valid) {
      this.cardService.submitTranslation(
        {
          code: this.data.card().code,
          title: this.form.value.title,
          text: this.form.value.text,
          flavor: this.form.value.flavor || '',
        },
        'it',
        false
      ).then(() => {
        this.dialogRef.close({ status: 'confirmed' });
      }).catch((error) => {
        console.error('Error submitting translation:', error);
        this.dialogRef.close({ status: 'cancelled' });
      });
    }
  }

  public addSpecialCharacter(id: string) {
    const currentText = this.form.get('text')?.value || '';
    switch (id) {
      case 'bold_text':
        this.form.get('text')?.setValue(currentText + '<strong>text</strong>');
        break;
      case 'credit':
        this.form.get('text')?.setValue(currentText + '[credit]');
        break;
      case 'click':
        this.form.get('text')?.setValue(currentText + '[click]');
        break;
      case 'mu':
        this.form.get('text')?.setValue(currentText + '[mu]');
        break;


      default:
        break;
    }
  }
}
