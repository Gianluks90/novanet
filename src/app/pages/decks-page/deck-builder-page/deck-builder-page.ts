import { Component, inject, LOCALE_ID } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Deck } from '../../../models/deck';
import { CardDetail } from "../../../components/card-detail/card-detail";
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Pack } from '../../../models/pack';
import { Card } from '../../../models/card';

@Component({
  selector: 'app-deck-builder-page',
  imports: [CardDetail, FormsModule, ReactiveFormsModule],
  templateUrl: './deck-builder-page.html',
  styleUrl: './deck-builder-page.scss',
})
export class DeckBuilderPage {

  public form: FormGroup;
  public packs: Pack[] = [];

  constructor(private route: ActivatedRoute, private fb: FormBuilder) {
    this.route.parent?.data.subscribe(data => {
      this.packs = data['configs'].packs.data || [];
    });

    this.form = this.fb.group({
      name: ['', Validators.required],
      format: [''],
      identity: ['', Validators.required],
      cardInput: [''],
      notes: ['']
    });
  }

  public mode: 'edit' | 'visibility' = 'edit';
  public deck: Deck | null = null;
  public locale = inject(LOCALE_ID);
  public selectedCard: Card | null = null;
  public cardZoomed: boolean = false;

  ngOnInit() {
    this.deck = this.route.snapshot.data['deck'];

    this.form.patchValue({
      name: this.deck?.name || '',
      // format: this.deck?.format || '',
      identity: this.deck?.identity.code || '',
      notes: this.deck?.notes || ''
    });

    console.log(this.deck);
  }

  public onCardClick(card: Card) {

    if (this.selectedCard && this.selectedCard.code === card.code) {
      this.cardZoomed = true
    } else {
      this.cardZoomed = false
    }
    this.selectedCard = card;
    console.log(this.selectedCard);
  }

  onCardZoomEmitted(event: any) {
    this.cardZoomed = event;
  }
}
