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
import { CardTranslationService } from '../../../services/card-translation-service';
import { identitiesOfSide } from '../../../utils/card-sort';
import { parseCardList } from '../../../utils/card-list';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { debounceTime } from 'rxjs';

@Component({
  selector: 'app-new-deck-dialog',
  imports: [TranslatePipe, CardTitlePipe, UiDialogContainer, UIButton, FormsModule, ReactiveFormsModule],
  templateUrl: './new-deck-dialog.html',
  styleUrl: './new-deck-dialog.scss',
})
export class NewDeckDialog {
  public dialogRef = inject<DialogRef<DialogResult, NewDeckDialog>>(DialogRef);
  /** `importList`: the dialog also asks for a card list and the new deck is created from it. */
  public data = inject(DIALOG_DATA) as { sides: Side[], signedIn: boolean, side?: 'runner' | 'corp', importList?: boolean };
  public form: FormGroup;
  public sides: Side[] = [];
  private allCards: Card[] = [];
  public identities: Card[] = [];
  private i18n = inject(I18nService);
  private translations = inject(CardTranslationService);
  public get locale(): string { return this.i18n.lang(); }
  /** Import: the identity found in the pasted list (the select follows it until the user picks another). */
  public detectedIdentity: Card | null = null;

  constructor(private fb: FormBuilder, private dc: ChangeDetectorRef) {
    this.form = this.fb.group({
      side: ['runner', Validators.required],
      identity: ['', Validators.required],
      name: ['', [Validators.required, Validators.minLength(3)]],
      // decks are saved on this device unless the user is signed in and picks their account
      storage: [this.data.signedIn ? 'cloud' : 'local'],
      customBackImageURL: [''],
      cardList: ['', this.data.importList ? Validators.required : []],
    });

    if (this.data.side) {
      this.form.get('side')?.setValue(this.data.side);
    }

    this.form.get('side')?.valueChanges.subscribe(side => {
      this.form.get('identity')?.setValue('');
      this.identities = this.identitiesOf(side);
      this.dc.detectChanges();
    });

    // import: the list usually names the identity, so pick its side and identity
    this.form.get('cardList')?.valueChanges.pipe(debounceTime(250), takeUntilDestroyed())
      .subscribe(text => this.detectIdentity(text ?? ''));

    this.sides = this.data.sides;
  }

  async ngAfterViewInit() {
    const db = await nrdbDb;
    this.allCards = await db.getAll('cards') as Card[];
    this.identities = this.identitiesOf(this.form.get('side')?.value);
    this.dc.detectChanges();
  }

  /** The side's identities, one per card, alphabetical by the title shown (translated or English). */
  private identitiesOf(side: string): Card[] {
    return identitiesOfSide(this.allCards, side, c => this.translations.title(c), this.i18n.lang());
  }

  /** Name filled in from the list, so it can be replaced by a newer one but never overwrites the user's. */
  private autoName = '';

  private detectIdentity(text: string) {
    const catalog = new Map(this.allCards.map(c => [c.id, c]));
    const parsed = parseCardList(text, catalog, { altTitle: c => this.translations.title(c) });

    // the first line of a NetrunnerDB export is the deck name
    const name = this.form.get('name');
    if (parsed.name && (!name?.value || name.value === this.autoName)) {
      name?.setValue(parsed.name);
      this.autoName = parsed.name;
    }

    const found = parsed.identity;
    if (found?.card_id !== this.detectedIdentity?.card_id) {
      this.detectedIdentity = found;
      if (found) {
        // changing the side resets the identity and rebuilds the list, so set the side first
        if (this.form.get('side')?.value !== found.side_id) this.form.get('side')?.setValue(found.side_id);
        const option = this.identities.find(c => c.card_id === found.card_id);
        if (option) this.form.get('identity')?.setValue(option.id);
      }
    }
    this.dc.detectChanges();
  }

  onSubmit() {
    if (this.form.valid) {
      const { storage, cardList, ...formValue } = this.form.value;
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
      

      this.dialogRef.close({ status: 'confirmed', data: { deck: newDeckData, cardList: this.data.importList ? cardList : null } });

    }
  }
}
