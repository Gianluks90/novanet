import { UiBadge, UiIconButton, UiSegmented, UiStepper, SegmentedOption } from '../../../ui';
import { HasUnsavedChanges } from '../../../guards/unsaved-changes-guard';
import { TranslationKey } from '../../../i18n/en';
import { AfterViewInit, ChangeDetectorRef, Component, effect, inject, ViewChild, ElementRef, HostListener, untracked } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FirebaseService } from '../../../services/firebase-service';
import { NotificationService } from '../../../services/notification-service';
import { Deck } from '../../../models/deck';
import { CardDetail } from "../../../components/card-detail/card-detail";
import { FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Pack } from '../../../models/pack';
import { Card } from '../../../models/card';
import { CardService } from '../../../services/card-service';
import { Faction } from '../../../models/faction';
import { Type } from '../../../models/type';
import { FactionLabelPipe } from "../../../pipes/faction-label-pipe";
import { TypeLabelPipe } from "../../../pipes/type-label-pipe";
import { Cycle } from '../../../models/cycle';
import { DotsPipe } from "../../../pipes/dots-pipe";
import { Dialog, DialogRef } from '@angular/cdk/dialog';
import { DialogResult } from '../../../models/DialogResult';
import { DIALOGS_CONFIG } from '../../../const/dialogConfig';
import { CardZoom } from '../../../components/card-zoom/card-zoom';
import { Timestamp } from 'firebase/firestore';
import { DeckService } from '../../../services/deck-service';
import { ImportExportCardListDialog } from '../../../components/dialogs/import-export-card-list-dialog/import-export-card-list-dialog';
import { UIButton } from '../../../ui';
import { TranslatePipe } from '../../../i18n/translate-pipe';
import { I18nService } from '../../../i18n/i18n-service';
import { CardTranslationService } from '../../../services/card-translation-service';
import { CardTitlePipe } from '../../../pipes/card-title-pipe';
import { AuthService } from '../../../services/auth-service';
import { getAuth } from 'firebase/auth';

import { parseCardList } from '../../../utils/card-list';
import { agendaRequirement } from '../../../utils/deck-rules';

@Component({
  selector: 'app-deck-builder-page',
  imports: [TranslatePipe, CardTitlePipe, UiBadge, UiIconButton, UiSegmented, UiStepper, CardDetail, CardZoom, NgTemplateOutlet, FormsModule, ReactiveFormsModule, FactionLabelPipe, TypeLabelPipe, DotsPipe, RouterLink, UIButton],
  templateUrl: './deck-builder-page.html',
  styleUrl: './deck-builder-page.scss',
})
export class DeckBuilderPage implements AfterViewInit {

  @ViewChild('cardInputEl', { read: ElementRef }) cardInputEl!: ElementRef<HTMLInputElement>;

  public form: FormGroup;
  public cardForm: FormGroup;
  public filtersForm!: FormGroup;

  /** The deck name, edited in the header of the deck view. */
  public get nameControl(): FormControl {
    return this.form.get('name') as FormControl;
  }
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
    private notification: NotificationService,
    public authService: AuthService
  ) {
    this.route.parent?.data.subscribe(data => {
      this.cycles = data['configs'].cycles || [];
      this.packs = data['configs'].packs || [];
      this.factions = data['configs'].factions || [];
      this.types = data['configs'].types || [];
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
      this.identities = Array.from(this.cardsMap.values()).filter(c => c.card_type_id.endsWith('_identity') && c.side_id === this.deck?.side);
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

    // A shared/online deck opened while signed out can't be read: once the user signs in, load it.
    effect(() => {
      if (this.firebase.$user() && !this.deck && this.routeDeckResolved) {
        untracked(() => void this.loadDeckAfterSignIn());
      }
    });
  }

  public mode: 'edit' | 'visibility' = 'edit';
  public deck: Deck | null = null;
  private i18n = inject(I18nService);
  private translations = inject(CardTranslationService);
  public get locale(): string { return this.i18n.lang(); }
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
      format: this.deck?.format || '',
      identity: this.deck?.identity.id || '',
      notes: this.deck?.notes || ''
    });
    this.routeDeckResolved = true;
  }

  /** Ready to search: the search field has the focus when the editor opens. */
  ngAfterViewInit() {
    if (this.isOwner) setTimeout(() => this.cardInputEl?.nativeElement.focus());
  }

  // ---- unsaved changes ------------------------------------------------------

  private routeDeckResolved = false;
  /** True once the saved cards are in `selectedCards` (before that the deck would look "edited"). */
  private cardsParsed = false;
  /** Snapshot of the editable state as last loaded/saved. */
  private baseline = '';

  private currentSnapshot(): string {
    const v = this.form.value;
    return JSON.stringify({
      name: (v.name ?? '').trim(),
      format: v.format ?? '',
      identity: v.identity ?? '',
      notes: v.notes ?? '',
      cards: Array.from(this.selectedCards.entries()).sort(([a], [b]) => a.localeCompare(b)),
    });
  }

  /** The user changed the deck since it was loaded or last saved. */
  public get dirty(): boolean {
    return this.isOwner && this.cardsParsed && this.currentSnapshot() !== this.baseline;
  }

  public hasUnsavedChanges(): boolean {
    return this.dirty;
  }

  /** Closing/reloading the tab with unsaved changes asks for confirmation (the browser's own dialog). */
  @HostListener('window:beforeunload', ['$event'])
  public onBeforeUnload(event: BeforeUnloadEvent) {
    if (this.dirty) event.preventDefault();
  }

  private async loadDeckAfterSignIn() {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) return;
    try {
      const deck = await this.deckService.getDeckById(id);
      if (deck) this.applyDeck(deck);
    } catch (err) {
      console.warn('[deck-builder] deck still not available after sign-in', err);
    }
  }

  private applyDeck(deck: Deck) {
    this.deck = deck;
    this.mode = 'edit';
    this.form.patchValue({
      name: deck.name || '',
      format: deck.format || '',
      identity: deck.identity?.id || '',
      notes: deck.notes || ''
    });
    this.selectedCards = new Map();
    this.cardsParsed = false;
    this.identities = Array.from(this.cardsMap.values()).filter(c => c.card_type_id.endsWith('_identity') && c.side_id === deck.side);
    this.applyFilters();
    this.parseCards();
    this.cd.detectChanges();
  }

  /** The user can edit this deck: it is saved on this device, or it is theirs online. */
  public get isOwner(): boolean {
    return !!this.deck && (!!this.deck.local || this.deck.createdBy === this.firebase.$user()?.uid);
  }

  /** Moves a deck saved on this device to the user's account (asks to sign in first if needed). */
  public async uploadDeck() {
    if (!this.deck?.local) return;
    try {
      await this.saveDeck();
      if (!getAuth().currentUser) {
        const signedIn = await this.authService.signIn();
        if (!signedIn) return;
      }
      this.deck = await this.deckService.uploadLocalDeck(this.deck.id);
      this.notification.notify(this.i18n.t('notifications.deckUploaded'), 'check');
      this.cd.detectChanges();
    } catch (err: any) {
      console.error('Error uploading deck:', err);
      this.notification.notify(this.i18n.t('notifications.errorUploadingDeck', [err?.message ?? '']), 'dangerous');
    }
  }

  public readonly visibilityOptions: SegmentedOption[] = [
    { value: 'private', label: 'deckBuilderPage.visibilityPrivate', icon: 'lock' },
    { value: 'shared', label: 'deckBuilderPage.visibilityShared', icon: 'link' },
    { value: 'public', label: 'deckBuilderPage.visibilityPublic', icon: 'public' },
  ];

  /** Explains what the currently selected visibility means. */
  public get visibilityHint(): TranslationKey {
    switch (this.deck?.visibility) {
      case 'public': return 'deckBuilderPage.publicListedInTheCommunity';
      case 'shared': return 'deckBuilderPage.sharedAnyoneWithTheDirect';
      default: return 'deckBuilderPage.privateOnlyYouCanSee';
    }
  }

  /** Forces the visibility selector to show a value other than the deck's (to undo a refused click). */
  public visibilityShown: string | null = null;

  public async setVisibility(visibility: 'private' | 'public' | 'shared') {
    if (!this.deck || !this.isOwner) return;
    if (visibility === 'public' && !(await this.canPublish())) {
      // The selector already switched on its own: show the real value again.
      this.visibilityShown = visibility;
      this.cd.detectChanges();
      this.visibilityShown = null;
      this.cd.detectChanges();
      this.notification.notify(this.i18n.t('deckBuilderPage.verifyToPublish'), 'warning');
      this.authService.openAccount();
      return;
    }
    // Decks created before authors were tracked get theirs recorded the first time they are shared.
    const author = this.deck.originalAuthorId ? {} : this.deckService.authorFields(this.deck);
    Object.assign(this.deck, author, { visibility });
    this.deckService.updateDeck(this.deck.id, { visibility, ...author });
  }

  /** Public decks need a verified email; the account may have been verified since the page loaded. */
  private async canPublish(): Promise<boolean> {
    if (this.authService.info()?.emailVerified) return true;
    return this.authService.refreshVerification().catch(() => false);
  }

  public cloneDeck() {
    if (!this.deck) return;
    this.deckService.cloneDeck(this.deck).then(newId => {
      this.notification.notify(this.i18n.t('notifications.deckCopied'), 'check');
      this.router.navigate(['/decks/builder', newId]);
    }).catch(err => {
      this.notification.notify(this.i18n.t('notifications.errorCopyingDeck', [err.message]), 'dangerous');
    });
  }

  public onCardClick(card: Card) {
    if (this.selectedCard && this.selectedCard.id === card.id) {
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
  }

  private applyFilters() {
    if (!this.deck) return;

    const search = (this.cardForm.get('cardInput')?.value || '').toLowerCase();
    const { faction, pack, type } = this.filtersForm.value;

    this.filteredCards = Array.from(this.cardsMap.values())
      // regole di gioco
      .filter(c => c.card_type_id.endsWith('_identity') === false)
      .filter(c => c.side_id === this.deck!.side)

      // filtro fazione
      .filter(c => faction === 'all' || c.faction_id === faction)

      // filtro pack / set
      .filter(c => pack === 'all' || c.card_set_id === pack)

      // filtro tipo
      .filter(c => type === 'all' || c.card_type_id === type)

      // filtro testuale (tutte le lingue)
      .filter(c => {
        if (!search) return true;

        // English title plus the one in the current language (if any).
        const titles = [c.title, this.translations.translation(c.id)?.title];

        return titles.some(t => t?.toLowerCase().includes(search));
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

  // ---- copies in the deck --------------------------------------------------------

  /** Copies of the card in the deck. */
  public qtyOf(code: string): number {
    return this.selectedCards.get(code) ?? 0;
  }

  /** Most copies of the card a deck can have (`null`: no limit). */
  public limitOf(card: Card): number | null {
    return card.deck_limit && card.deck_limit > 0 ? card.deck_limit : null;
  }

  /** Adds or removes copies, within 0 and the card's deck limit. */
  public changeQuantity(card: Card, delta: number) {
    if (!this.isOwner) return;
    const limit = this.limitOf(card) ?? Infinity;
    const quantity = Math.min(limit, Math.max(0, this.qtyOf(card.id) + delta));
    const next = new Map(this.selectedCards);
    if (quantity > 0) next.set(card.id, quantity); else next.delete(card.id);
    this.selectedCards = next;
  }

  /** Enter in the search field: one more copy of the first result, ready to type the next search. */
  public addFirstResult() {
    const card = this.filteredCards[0];
    if (!card || !this.isOwner) return;
    this.changeQuantity(card, 1);
    this.cardInputEl?.nativeElement.select();
  }

  /** Esc in the search field clears it (and does not also close the card detail). */
  public clearSearch(event?: Event) {
    event?.stopPropagation();
    this.cardForm.patchValue({ cardInput: '' });
  }

  public closeDetail() {
    this.selectedCard = null;
    this.cardZoomed = false;
  }

  /** Esc closes the zoom first, then the card detail (unless a dialog is open). */
  @HostListener('document:keydown.escape')
  public onEscape() {
    if (document.querySelector('.dialog-container')) return;
    if (this.cardZoomed) this.cardZoomed = false;
    else if (this.selectedCard) this.selectedCard = null;
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

      if (card.faction_id !== this.deck?.identity.faction_id &&
        !card.faction_id!.startsWith('neutral')) {
        influence += (card.influence_cost ?? 0) * qty;
      }
    });

    return influence;
  }

  // ---- deck validity ---------------------------------------------------------------

  /** Cards still needed to reach the identity's minimum deck size. */
  public get missingCards(): number {
    return Math.max(0, (this.deck?.identity.minimum_deck_size ?? 0) - this.totalCards);
  }

  /** The identity's influence limit (`null`: unlimited). */
  public get influenceLimit(): number | null {
    return this.deck?.identity.influence_limit ?? null;
  }

  public get influenceOver(): number {
    const limit = this.influenceLimit;
    return limit === null ? 0 : Math.max(0, this.totalInfluence - limit);
  }

  /** Agenda points in the deck (Corp). */
  public get agendaPoints(): number {
    let total = 0;
    this.selectedCards.forEach((qty, code) => total += (this.cardsMap.get(code)?.agenda_points ?? 0) * qty);
    return total;
  }

  /** Agenda points the deck needs for its current size. */
  public get agendaNeeded(): { min: number; max: number } {
    return agendaRequirement(this.totalCards);
  }

  public get agendaValid(): boolean {
    const { min, max } = this.agendaNeeded;
    return this.agendaPoints >= min && this.agendaPoints <= max;
  }

  // ---- deck list: groups by type, list or grid ------------------------------------------

  /** Order of the card types in the deck list, per side (types not listed go last). */
  private static readonly TYPE_ORDER: Record<string, string[]> = {
    runner: ['event', 'hardware', 'resource', 'program'],
    corp: ['agenda', 'asset', 'ice', 'operation', 'upgrade'],
  };

  /** The deck's cards grouped by type, each group sorted by title. */
  public get selectedCardGroups(): { type: string; entries: { card: Card; qty: number }[]; total: number }[] {
    const order = DeckBuilderPage.TYPE_ORDER[this.deck?.side ?? ''] ?? [];
    const rank = (type: string) => { const i = order.indexOf(type); return i < 0 ? order.length : i; };
    const groups = new Map<string, { card: Card; qty: number }[]>();
    for (const entry of this.selectedCardsList) {
      const list = groups.get(entry.card.card_type_id) ?? [];
      list.push(entry);
      groups.set(entry.card.card_type_id, list);
    }
    return Array.from(groups.entries())
      .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
      .map(([type, entries]) => ({
        type,
        entries: entries.sort((a, b) => a.card.title.localeCompare(b.card.title)),
        total: entries.reduce((sum, e) => sum + e.qty, 0),
      }));
  }

  /** How the deck's cards are shown; remembered on this device. */
  public deckView: 'list' | 'grid' = DeckBuilderPage.loadDeckView();

  private static loadDeckView(): 'list' | 'grid' {
    try {
      return localStorage.getItem('deckListView') === 'grid' ? 'grid' : 'list';
    } catch {
      return 'list';
    }
  }

  public toggleDeckView() {
    this.deckView = this.deckView === 'list' ? 'grid' : 'list';
    try { localStorage.setItem('deckListView', this.deckView); } catch { /* not remembered */ }
  }

  /** Card picture for the grid tiles. */
  public tileImage(card: Card): string {
    return 'https://card-images.netrunnerdb.com/v2/medium/' + card.id + '.jpg';
  }

  public get selectedCardsList(): { card: Card; qty: number }[] {
    return Array.from(this.selectedCards.entries())
      .map(([code, qty]) => ({
        card: this.cardsMap.get(code)!,
        qty
      }))
      .filter(e => !!e.card);
  }

  public async saveDeck(): Promise<void> {
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

    try {
      await this.deckService.updateDeck(this.deck.id, updatedDeck);
      this.deck = { ...updatedDeck };
      this.baseline = this.currentSnapshot();
      this.notification.notify(this.i18n.t('notifications.deckSaved'), 'check');
    } catch (err: any) {
      console.error('Errore durante il salvataggio del deck:', err);
      this.notification.notify(this.i18n.t('notifications.errorSavingDeck', [err?.message ?? '']), 'dangerous');
    }
  }

  public parseCards() {
    if (!this.deck) return;

    Object.entries(this.deck.cards ?? {}).forEach(([code, qty]) => {
      if (!this.cardsMap.has(code)) return;
      this.selectedCards.set(code, qty);
    });

    // first time the catalog and the deck are both there: this is the "clean" state
    if (!this.cardsParsed && this.cardsMap.size > 0) {
      this.cardsParsed = true;
      this.baseline = this.currentSnapshot();
    }
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
        const { cards, unknown } = parseCardList(result.data.list, this.cardsMap);
        this.selectedCards = new Map(Object.entries(cards));
        if (unknown.length > 0) {
          this.notification.notify(this.i18n.t('notifications.cardListUnknown', [unknown.length]), 'warning');
        }
        this.cd.detectChanges();
      }
    });
  }
}
