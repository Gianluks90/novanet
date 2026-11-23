import { ChangeDetectorRef, Component, inject } from '@angular/core';
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
import { TranslatePipe } from '../../../i18n/translate-pipe';
import { I18nService } from '../../../i18n/i18n-service';
import { CardTitlePipe } from '../../../pipes/card-title-pipe';

@Component({
  selector: 'app-new-deck-dialog',
  imports: [TranslatePipe, CardTitlePipe, UiDialogContainer, UIButton, FormsModule, ReactiveFormsModule],
  templateUrl: './new-deck-dialog.html',
  styleUrl: './new-deck-dialog.scss',
})
export class NewDeckDialog {
  public dialogRef = inject<DialogRef<DialogResult, NewDeckDialog>>(DialogRef);
  public data = inject(DIALOG_DATA) as { sides: Side[], signedIn: boolean, side?: 'runner' | 'corp' };
  public form: FormGroup;
  public sides: Side[] = [];
  private allCards: Card[] = [];
  public identities: Card[] = [];
  private i18n = inject(I18nService);
  public get locale(): string { return this.i18n.lang(); }

  constructor(private fb: FormBuilder, private dc: ChangeDetectorRef) {
    this.form = this.fb.group({
      side: ['runner', Validators.required],
      identity: ['', Validators.required],
      name: ['', [Validators.required, Validators.minLength(3)]],
      // decks are saved on this device unless the user is signed in and picks their account
      storage: [this.data.signedIn ? 'cloud' : 'local'],
      customBackImageURL: ['']
    });

    if (this.data.side) {
      this.form.get('side')?.setValue(this.data.side);
    }

    this.form.get('side')?.valueChanges.subscribe(side => {
      this.form.get('identity')?.setValue('');
      this.identities = this.allCards.filter(card => card.card_type_id.endsWith('_identity') && card.side_id === side);
      this.dc.detectChanges();
    });

    this.sides = this.data.sides;
  }

  async ngAfterViewInit() {
    const db = await nrdbDb;
    this.allCards = await db.getAll('cards') as Card[];
    this.identities = this.allCards.filter(card => card.card_type_id.endsWith('_identity') && card.side_id === this.form.get('side')?.value);
    this.dc.detectChanges();
  }

  onSubmit() {
    if (this.form.valid) {
      const { storage, ...formValue } = this.form.value;
      const local = storage !== 'cloud' || !this.data.signedIn;
      const newDeckData = {
        ...formValue,
        local,
        id: crypto.randomUUID(),
        identity: this.allCards.find(card => card.id === this.form.value.identity) || null,
        cards: [],
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        createdBy: local ? 'local' : getAuth().currentUser?.uid,
        customBackImageURL: this.form.value.customBackImageURL || null,
        visibility: 'private',
        format: '',
      }

      // console.log(newDeckData);
      

      this.dialogRef.close({ status: 'confirmed', data: { deck: newDeckData } });

    }
  }
}
