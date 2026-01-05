import { ChangeDetectorRef, Component, inject, LOCALE_ID } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { UiDialogContainer, UIButton } from '../../../ui';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { DialogResult } from '../../../models/DialogResult';
import { Side } from '../../../models/side';
import { getAuth } from 'firebase/auth';
import { Timestamp } from 'firebase/firestore';
import { ActivatedRoute } from '@angular/router';
import { Card } from '../../../models/card';
import { nrdbDb } from '../../../db/nrdb-indexed-db';

@Component({
  selector: 'app-new-deck-dialog',
  imports: [UiDialogContainer, UIButton, FormsModule, ReactiveFormsModule],
  templateUrl: './new-deck-dialog.html',
  styleUrl: './new-deck-dialog.scss',
})
export class NewDeckDialog {
  public dialogRef = inject<DialogRef<DialogResult, NewDeckDialog>>(DialogRef);
  public data = inject(DIALOG_DATA) as { sides: Side[], side?: 'runner' | 'corp' };
  public form: FormGroup;
  public sides: Side[] = [];
  private allCards: Card[] = [];
  public identities: Card[] = [];
  public locale = inject(LOCALE_ID);

  constructor(private fb: FormBuilder, private dc: ChangeDetectorRef) {
    this.form = this.fb.group({
      side: ['runner', Validators.required],
      identity: ['', Validators.required],
      name: ['', [Validators.required, Validators.minLength(3)]],
      customBackImageURL: ['']
    });

    if (this.data.side) {
      this.form.get('side')?.setValue(this.data.side);
    }

    this.form.get('side')?.valueChanges.subscribe(side => {
      this.form.get('identity')?.setValue('');
      this.identities = this.allCards.filter(card => card.type_code === 'identity' && card.side_code === side);
      this.dc.detectChanges();
    });

    this.sides = this.data.sides;
  }

  async ngAfterViewInit() {
    const db = await nrdbDb;
    this.allCards = await db.getAll('cards') as Card[];
    this.identities = this.allCards.filter(card => card.type_code === 'identity' && card.side_code === this.form.get('side')?.value);
    this.dc.detectChanges();
  }

  onSubmit() {
    if (this.form.valid) {
      const newDeckData = {
        ...this.form.value,
        id: Math.random().toString(36).substring(2, 15),
        identity: this.allCards.find(card => card.code === this.form.value.identity) || null,
        cards: [],
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        createdBy: getAuth().currentUser?.uid,
        customBackImageURL: this.form.value.customBackImage || null,
      }

      // console.log(newDeckData);
      

      this.dialogRef.close({ status: 'confirmed', data: { deck: newDeckData } });

    }
  }
}
