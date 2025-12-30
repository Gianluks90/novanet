import { Component, inject } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { UiDialogContainer, UIButton } from '../../../ui';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { DialogResult } from '../../../models/DialogResult';
import { Side } from '../../../models/side';
import { getAuth } from 'firebase/auth';
import { Timestamp } from 'firebase/firestore';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-new-deck-dialog',
  imports: [UiDialogContainer, UIButton, FormsModule, ReactiveFormsModule],
  templateUrl: './new-deck-dialog.html',
  styleUrl: './new-deck-dialog.scss',
})
export class NewDeckDialog {
  public dialogRef = inject<DialogRef<DialogResult,NewDeckDialog>>(DialogRef);
  public data = inject(DIALOG_DATA) as { sides: Side[], side?: 'runner' | 'corp' };
  public form: FormGroup;
  public sides: Side[] = [];

  constructor(private fb: FormBuilder) {
    this.form = this.fb.group({
      side: ['runner', Validators.required],
      name: ['', [Validators.required, Validators.minLength(3)]],
      customBackImageURL: ['']
    });

    if (this.data.side) {
      this.form.get('side')?.setValue(this.data.side);
    }

    this.sides = this.data.sides;
  }

  onSubmit() {
    if (this.form.valid) {
      const newDeckData = {
        ...this.form.value,
        id: Math.random().toString(36).substring(2, 15),
        cards: {},
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        createdBy: getAuth().currentUser?.uid,
        customBackImageURL: this.form.value.customBackImage || null,
      }

      this.dialogRef.close({ status: 'confirmed', data: { deck: newDeckData } });
      
    }
  }
}
