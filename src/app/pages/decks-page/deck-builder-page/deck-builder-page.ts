import { ChangeDetectorRef, Component, effect, inject, LOCALE_ID, ViewChild, ElementRef } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FirebaseService } from '../../../services/firebase-service';
import { NotificationService } from '../../../services/notification-service';
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
import { AddCardDialog } from '../../../components/dialogs/add-card-dialog/add-card-dialog';
import { Dialog, DialogRef } from '@angular/cdk/dialog';
import { DialogResult } from '../../../models/DialogResult';
import { DIALOGS_CONFIG } from '../../../const/dialogConfig';
import { CheckAgendaPointsPipe } from "../../../pipes/check-agenda-points-pipe";
import { CheckInfluencePipe } from "../../../pipes/check-influence-pipe";
import { Timestamp } from 'firebase/firestore';
import { DeckService } from '../../../services/deck-service';
import { ImportExportCardListDialog } from '../../../components/dialogs/import-export-card-list-dialog/import-export-card-list-dialog';
import { UIButton } from '../../../ui';

@Component({
  selector: 'app-deck-builder-page',
  imports: [CardDetail, FormsModule, ReactiveFormsModule, FactionLabelPipe, TypeLabelPipe, DotsPipe, CheckAgendaPointsPipe, CheckInfluencePipe, RouterLink, UIButton],
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
  public selectedCards = new Map<string, number>();

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private fb: FormBuilder,
    private cardService: CardService,
    private cd: ChangeDetectorRef,
    private deckService: DeckService,
    public firebase: FirebaseService,
    private notification: NotificationService
  ) {
    this.route.parent?.data.subscribe(data => {
      this.cycles = data['configs'].cycles.data || [];
      this.packs = data['configs'].packs.data || [];
      this.factions = data['configs'].factions.data || [];
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
      if (!this.cardService.$cardsMap()) return;

      this.cardsMap = this.cardService.$cardsMap();
      this.identities = Array.from(this.cardsMap.values()).filter(c => c.type_code === 'identity' && c.side_code === this.deck?.side);
      this.applyFilters();
      this.parseCards();
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
      this.cardService.loadCards();

    this.deck = this.route.snapshot.data['deck'];

    if (!this.isOwner) {
      this.mode = 'edit';
    }

    this.form.patchValue({
      name: this.deck?.name || '',
      // format: this.deck?.format || '',
      identity: this.deck?.identity.code || '',
      notes: this.deck?.notes || ''
    });
  }

  public get isOwner(): boolean {
    return !!this.deck && this.deck.createdBy === this.firebase.$user()?.uid;
  }

  public setVisibility(visibility: 'private' | 'public' | 'shared') {
    if (!this.deck || !this.isOwner) return;
    this.deck.visibility = visibility;
    this.deckService.updateDeck(this.deck.id, { visibility });
  }

  public cloneDeck() {
    if (!this.deck) return;
    this.deckService.cloneDeck(this.deck).then(newId => {
      this.notification.notify($localize`Deck copied to your account.`, 'check');
      this.router.navigate(['/decks/builder', newId]);
    }).catch(err => {
      this.notification.notify($localize`Error copying deck: ${err.message}`, 'dangerous');
    });
  }

  public onCardClick(card: Card) {
    if (this.selectedCard && this.selectedCard.code === card.code) {
      this.cardZoomed = true
    } else {
      this.cardZoomed = false
    }
    this.selectedCard = card;
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

  private dialog = inject(Dialog);
  private dialogRef: DialogRef<DialogResult, any> | null = null;

  public openAddCardDialog(card: Card) {
    if (!this.isOwner) return;

    this.dialogRef = this.dialog.open<DialogResult>(AddCardDialog, {
      ...DIALOGS_CONFIG,
      disableClose: true,
      data: { card: card, packs: this.packs }
    });

    this.dialogRef?.closed.subscribe((result: DialogResult | undefined) => {
      this.selectCard(card);
      if (result?.status === 'confirmed') {
        const next = new Map(this.selectedCards);

        const current = next.get(card.code) || 0;
        const limit = card.deck_limit && card.deck_limit > 0 ? card.deck_limit : Infinity;
        next.set(
          card.code,
          Math.min(limit, current + result.data.quantity)
        );

        this.selectedCards = next;
        this.cd.detectChanges();
      }
    });
  }

  public get totalCards(): number {
    let total = 0;
    this.selectedCards.forEach(qty => total += qty);
    return total;
  }

  public get totalInfluence(): number {
    let influence = 0;

    this.selectedCards.forEach((qty, code) => {
      const card = this.cardsMap.get(code);
      if (!card) return;

      if (card.faction_code !== this.deck?.identity.faction_code &&
        !card.faction_code!.startsWith('neutral')) {
        influence += (card.faction_cost ?? 0) * qty;
      }
    });

    return influence;
  }

  public removeCard(code: string) {
    if (!this.isOwner) return;

    const next = new Map(this.selectedCards);
    next.delete(code);
    this.selectedCards = next;
  }

  public get selectedCardsList(): { card: Card; qty: number }[] {
    return Array.from(this.selectedCards.entries())
      .map(([code, qty]) => ({
        card: this.cardsMap.get(code)!,
        qty
      }))
      .filter(e => !!e.card);
  }

  public saveDeck() {
    if (!this.deck || !this.isOwner) return;

    const cardsPayload: Record<string, number> = {};
    this.selectedCards.forEach((qty, code) => {
      cardsPayload[code] = qty;
    });

    const updatedDeck: Deck = {
      ...this.deck,
      name: this.form.get('name')?.value,
      format: this.form.get('format')?.value,
      identity: this.deck.identity,
      notes: this.form.get('notes')?.value,
      cards: cardsPayload,
      updatedAt: Timestamp.now()
    };

    this.deckService.updateDeck(this.deck.id, updatedDeck).catch(err => {
      console.error('Errore durante il salvataggio del deck:', err);
    });
  }

  public parseCards() {
    if (!this.deck?.cards) return;

    Object.entries(this.deck.cards).forEach(([code, qty]) => {
      if (!this.cardsMap.has(code)) return;
      this.selectedCards.set(code, qty);
    });
  }

  public importCardList() {
    if (!this.isOwner) return;
    this.openImportExportDialog();
  }

  public exportCardList() {
    const exportData: string[] = [];
this.selectedCards.forEach((qty, code) => {
  const card = this.cardsMap.get(code);
  if (card) exportData.push(`${qty}x ${card.title}`);
});

    this.openImportExportDialog(exportData.join('\n'));
  }


  private openImportExportDialog(data?: any) {
    this.dialogRef = this.dialog.open<DialogResult>(ImportExportCardListDialog, {
      ...DIALOGS_CONFIG,
      data: { list: data || '' }
    });

    this.dialogRef?.closed.subscribe((result: DialogResult | undefined) => {
  if (result?.status === 'confirmed' && result.data?.list) {
    const lines = result.data.list.split('\n');
    const next = new Map<string, number>();

    lines.forEach((line: string) => {
      // es: "2x Card Name"
      const match = line.match(/^(\d+)x\s+(.+)$/);
      if (!match) return;
      const qty = parseInt(match[1], 10);
      const title = match[2].trim();

      // trova la carta corrispondente dal title
      const cardEntry = Array.from(this.cardsMap.entries())
        .find(([code, card]) => card.title === title);
      if (cardEntry) {
        const [code, card] = cardEntry;
        const limit = card.deck_limit && card.deck_limit > 0 ? card.deck_limit : Infinity;
        next.set(code, Math.min(limit, qty));
      }
    });

    this.selectedCards = next;
    this.cd.detectChanges();
  }
});
  }
}
