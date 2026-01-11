import { ChangeDetectorRef, Component, effect, inject, LOCALE_ID, ViewChild, ElementRef } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Deck } from '../../../models/deck';
import { CardDetail } from "../../../components/card-detail/card-detail";
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Pack } from '../../../models/pack';
import { Card } from '../../../models/card';
import { CardService } from '../../../services/card-service';
import { Faction } from '../../../models/faction';
import { Type } from '../../../models/type';
import { FactionLabelPipe } from "../../../pipes/faction-label-pipe";
import { TypeLabelPipe } from "../../../pipes/type-label-pipe";
import { Cycle } from '../../../models/cycle';
import { DotsPipe } from "../../../pipes/dots-pipe";

@Component({
  selector: 'app-deck-builder-page',
  imports: [CardDetail, FormsModule, ReactiveFormsModule, FactionLabelPipe, TypeLabelPipe, DotsPipe],
  templateUrl: './deck-builder-page.html',
  styleUrl: './deck-builder-page.scss',
})
export class DeckBuilderPage {

  @ViewChild('cardInputEl', { read: ElementRef }) cardInputEl!: ElementRef<HTMLInputElement>;

  public form: FormGroup;
  public cardForm: FormGroup;
  public filtersForm!: FormGroup;
    public cycles: Cycle[] = [];
  
  public packs: Pack[] = [];
  public factions: Faction[] = [];
  public types: Type[] = [];
  public formats: string[] = [
    'standard',
    'throwback',
    'startup',
    'system gateway',
    'core',
    'preconstructed',
    'chimera',
    'eternal',
    'casual'
  ];

  public cardsMap: Map<string, Card> = new Map();
  public filteredCards: Card[] = [];
  public identities: Card[] = [];

  constructor(
    private route: ActivatedRoute,
    private fb: FormBuilder,
    private cardService: CardService,
    private cd: ChangeDetectorRef,
  ) {
    this.route.parent?.data.subscribe(data => {
      this.cycles = data['configs'].cycles.data || [];
      this.packs = data['configs'].packs.data || [];
      this.factions = data['configs'].factions.data || [];
      console.log(this.factions);
      
      this.types = data['configs'].types.data || [];
    });

    this.form = this.fb.group({
      name: ['', Validators.required],
      format: [''],
      identity: ['', Validators.required],
      cardInput: [''],
      notes: ['']
    });

    this.cardForm = this.fb.group({
      cardInput: [''],
    });

    this.filtersForm = this.fb.group({
      faction: ['all'],
      pack: ['all'],
      type: ['all']
    });

    this.form.get('identity')?.valueChanges.subscribe(code => {
      this.selectedCard = null;
      const newIdentity = this.cardsMap.get(code);
      if (newIdentity && this.deck) {
        this.deck.identity = newIdentity;
      }
    });

    effect(() => {
      this.cardService.loadCards();
      if (!this.cardService.$cardsMap()) return;

      this.cardsMap = this.cardService.$cardsMap();
      this.identities = Array.from(this.cardsMap.values()).filter(c => c.type_code === 'identity' && c.side_code === this.deck?.side);
      this.applyFilters();
      this.cd.detectChanges();
    });

    this.cardForm.get('cardInput')!.valueChanges.subscribe(() => {
      this.applyFilters();
    });

    this.filtersForm.valueChanges.subscribe(() => {
      this.applyFilters();
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

  public selectCard(card: Card) {
    this.selectedCard = card;
    // this.cardForm.patchValue({ cardInput: card.translations?.[this.locale]?.title || card.title });
  }

  private applyFilters() {
    if (!this.deck) return;

    const search = (this.cardForm.get('cardInput')?.value || '').toLowerCase();
    const { faction, pack, type } = this.filtersForm.value;

    this.filteredCards = Array.from(this.cardsMap.values())
      // regole di gioco
      .filter(c => c.type_code !== 'identity')
      .filter(c => c.side_code === this.deck!.side)

      // filtro fazione
      .filter(c => faction === 'all' || c.faction_code === faction)

      // filtro pack / set
      .filter(c => pack === 'all' || c.pack_code === pack)

      // filtro tipo
      .filter(c => type === 'all' || c.type_code === type)

      // filtro testuale (tutte le lingue)
      .filter(c => {
        if (!search) return true;

        const titles: string[] = [];

        if (c.title) titles.push(c.title.toLowerCase());

        if (c.translations) {
          Object.values(c.translations).forEach(t => {
            if (t?.title) titles.push(t.title.toLowerCase());
          });
        }

        return titles.some(t => t.includes(search));
      });
  }

  public resetFilters() {
    this.cardForm.patchValue({ cardInput: '' });
    this.filtersForm.patchValue({
      faction: 'all',
      pack: 'all',
      type: 'all'
    });
    this.applyFilters();

    // focus sull'input
    setTimeout(() => {
      this.cardInputEl.nativeElement.focus();
    }, 0);
  }
}
