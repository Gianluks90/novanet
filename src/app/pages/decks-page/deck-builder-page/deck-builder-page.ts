import { UiIconButton, UiSegmented, UiStepper, UiToggle, SegmentedOption } from '../../../ui';
import { HasUnsavedChanges } from '../../../guards/unsaved-changes-guard';
import { TranslationKey } from '../../../i18n/en';
import { AfterViewInit, ChangeDetectorRef, Component, effect, inject, ViewChild, ElementRef, HostListener, untracked } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FirebaseService } from '../../../services/firebase-service';
import { NotificationService } from '../../../services/notification-service';
import { Deck } from '../../../models/deck';
import { DetailDrawer } from "../../../components/detail-drawer/detail-drawer";
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
import { CardImage } from '../../../components/card-image/card-image';
import { DeckArt } from '../../../components/deck-art/deck-art';
import { CardBackDialog } from '../../../components/dialogs/card-back-dialog/card-back-dialog';
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
import { identitiesOfSide } from '../../../utils/card-sort';
import { FormatService } from '../../../services/format-service';
import { CASUAL_FORMAT, GameFormat } from '../../../models/format';
import { cardIssue, FORMAT_RULES, Violation } from '../../../utils/deck-validation';
import { DeckMeters } from '../../../components/deck-meters/deck-meters';
import { DeckFormatStatus } from '../../../components/deck-format-status/deck-format-status';

@Component({
  selector: 'app-deck-builder-page',
  imports: [TranslatePipe, CardTitlePipe, UiIconButton, UiSegmented, UiStepper, UiToggle, DetailDrawer, CardZoom, CardImage, DeckArt, DeckMeters, DeckFormatStatus, NgTemplateOutlet, CdkMenu, CdkMenuItem, CdkMenuTrigger, FormsModule, ReactiveFormsModule, FactionLabelPipe, TypeLabelPipe, DotsPipe, RouterLink, UIButton],
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
  public cardsMap: Map<string, Card> = new Map();
  public formatService = inject(FormatService);
  public filteredCards: Card[] = [];
  /** The identities of the deck's side for the "change identity" menu: alphabetical by displayed title. */
  public get identities(): Card[] {
    return identitiesOfSide(this.cardsMap.values(), this.deck?.side,
      c => this.showTranslated ? this.translations.title(c) : c.title, this.i18n.lang());
  }
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
      notes: [''],
      // id of a card back of the catalog, '' = the player's preferred one
      cardBack: [''],
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
      this.updateLegality();
    });

    this.form.get('format')?.valueChanges.subscribe(() => {
      this.updateLegality();
      this.applyFilters();
    });

    // the formats arrive after the page (cache, then network): validate again, and fix an old format value
    effect(() => {
      this.formatService.formats();
      untracked(() => {
        this.normalizeFormat();
        this.updateLegality();
        this.applyFilters();
        this.cd.detectChanges();
      });
    });

    effect(() => {
      if (!this.cardService.$cardsMap()) return;

      this.cardsMap = this.cardService.$cardsMap();
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
      format: this.formatService.normalize(this.deck?.format),
      identity: this.deck?.identity.id || '',
      notes: this.deck?.notes || '',
      cardBack: this.deck?.cardBack || '',
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
      cardBack: v.cardBack ?? '',
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
      format: this.formatService.normalize(deck.format),
      identity: deck.identity?.id || '',
      notes: deck.notes || '',
      cardBack: deck.cardBack || '',
    });
    this.selectedCards = new Map();
    this.cardsParsed = false;
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

      // only the cards that can be played in the chosen format (on request)
      .filter(c => !this.onlyLegal || !this.currentFormat || !this.currentPool
        || cardIssue(c, this.currentFormat, this.currentPool) === null)

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

  // ---- format and legality ---------------------------------------------------------

  /** The chosen format when it is one of NetrunnerDB's (null for casual or none: no card pool, no lists). */
  public currentFormat: GameFormat | null = null;
  private currentPool: Set<string> | null = null;
  /** For every format: is the deck legal in it? */
  public formatStatus = new Map<string, boolean>();
  /** Problems of the deck with the chosen format's own rules (card pool, bans, points). */
  public formatViolations: Violation[] = [];
  /** Hide the cards that cannot be played in the chosen format from the search. */
  public onlyLegal = false;

  public readonly casualFormat = CASUAL_FORMAT;

  /** Re-checks the deck against every format. Called whenever the cards, identity or format change. */
  private updateLegality() {
    const formats = this.formatService.formats();
    this.currentFormat = formats.find(f => f.id === this.form.get('format')?.value) ?? null;
    this.currentPool = this.currentFormat && this.cardsMap.size > 0
      ? this.formatService.pool(this.currentFormat, this.cardsMap) : null;
    this.formatStatus = new Map();
    this.formatViolations = [];

    const identity = this.deck?.identity && (this.cardsMap.get(this.deck.identity.id) ?? this.deck.identity);
    if (!identity || this.cardsMap.size === 0) return;

    for (const format of formats) {
      const violations = this.formatService.validate({ identity, cards: this.selectedCards }, this.cardsMap, format);
      this.formatStatus.set(format.id, violations.length === 0);
      if (format.id === this.currentFormat?.id) {
        this.formatViolations = violations.filter(v => FORMAT_RULES.includes(v.code));
      }
    }
  }

  /** The stored format may be one of the app's old ones: show it as the closest current one. */
  private normalizeFormat() {
    const control = this.form.get('format');
    if (!control) return;
    const normalized = this.formatService.normalize(control.value);
    if (normalized === control.value) return;
    const wasDirty = this.dirty;
    control.setValue(normalized, { emitEvent: false });
    if (!wasDirty) this.baseline = this.currentSnapshot();
  }

  /** ` ✓` / ` ✗` after a format's name in the select: is the deck legal in it? */
  public formatMark(id: string): string {
    const legal = this.formatStatus.get(id);
    return legal === undefined ? '' : legal ? ' ✓' : ' ✗';
  }

  /** The chosen format and whether the deck is legal in it (null when there is no format to check). */
  public get formatVerdict(): { name: string; legal: boolean } | null {
    const format = this.currentFormat;
    const legal = format ? this.formatStatus.get(format.id) : undefined;
    return format && legal !== undefined ? { name: format.name, legal } : null;
  }

  /** Why a card cannot be played in the chosen format (null when it can, or there is no format). */
  public cardIssueKey(card: Card): TranslationKey | null {
    if (!this.currentFormat || !this.currentPool) return null;
    const issue = cardIssue(card, this.currentFormat, this.currentPool);
    return issue === 'pool' ? 'deckBuilderPage.issuePool' : issue === 'banned' ? 'deckBuilderPage.issueBanned' : null;
  }

  public setOnlyLegal(value: boolean) {
    this.onlyLegal = value;
    this.applyFilters();
  }

  /** A format rule the deck breaks, as a sentence. */
  /** Stable function reference for `app-deck-format-status` (an input must not change on every check). */
  public violationLabel = (violation: Violation): string => this.violationText(violation);

  public violationText(violation: Violation): string {
    const card = violation.printingId ? this.cardsMap.get(violation.printingId) : undefined;
    const name = card ? (this.showTranslated ? this.translations.title(card) : card.title) : '';
    switch (violation.code) {
      case 'pool': return this.i18n.t('deckBuilderPage.violationPool', [name]);
      case 'banned': return this.i18n.t('deckBuilderPage.violationBanned', [name]);
      case 'learning': return this.i18n.t('deckBuilderPage.violationLearning', [name]);
      case 'restricted': return this.i18n.t('deckBuilderPage.violationRestricted', [name]);
      case 'points': return this.i18n.t('deckBuilderPage.violationPoints', [violation.amount ?? 0, violation.limit ?? 0]);
      default: return '';
    }
  }

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
    this.updateLegality();
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

  /** Changes the deck's identity (the menu lists the identities of the deck's side). */
  public setIdentity(id: string) {
    this.form.get('identity')?.setValue(id);
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

  /** Agenda points in the deck (Corp). */
  public get agendaPoints(): number {
    let total = 0;
    this.selectedCards.forEach((qty, code) => total += (this.cardsMap.get(code)?.agenda_points ?? 0) * qty);
    return total;
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

  /** Card titles and texts in the app language (when translations exist) or English only: the device setting. */
  public get showTranslated(): boolean {
    return this.locale !== 'en' && this.translations.enabled();
  }

  public toggleTranslated() {
    this.translations.setEnabled(!this.translations.enabled());
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

    // which formats the deck is legal in, for this version of the card pools and lists
    const identity = this.cardsMap.get(this.deck.identity.id) ?? this.deck.identity;
    const legality = this.formatService.formats().length > 0 && this.cardsMap.size > 0
      ? {
          legalFormats: this.formatService.legalFormats({ identity, cards: this.selectedCards }, this.cardsMap),
          legalFormatsBasis: this.formatService.signature(),
        }
      : {};

    const updatedDeck: Deck = {
      ...this.deck,
      ...legality,
      name: this.form.get('name')?.value,
      format: this.form.get('format')?.value,
      identity: this.deck.identity,
      notes: this.form.get('notes')?.value,
      cardBack: this.form.get('cardBack')?.value || null,
      cards: cardsPayload,
      updatedAt: Timestamp.now()
    };

    try {
      await this.deckService.updateDeck(this.deck.id, updatedDeck);
      this.deck = { ...updatedDeck };
      this.baseline = this.currentSnapshot();
      // no zone.js: the "unsaved changes" badge only goes away if the view is refreshed by hand
      this.cd.detectChanges();
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
    this.updateLegality();
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


  /** Opens the chooser of the deck's card back (none chosen = the player's preferred one). */
  public openCardBackDialog() {
    if (!this.deck || !this.isOwner) return;
    this.dialogRef = this.dialog.open<DialogResult>(CardBackDialog, {
      ...DIALOGS_CONFIG,
      panelClass: 'dialog-container',
      data: { side: this.deck.side, value: this.form.get('cardBack')?.value || null },
    });
    this.dialogRef.closed.subscribe((result: DialogResult | undefined) => {
      if (result?.status !== 'confirmed') return;
      this.form.get('cardBack')?.setValue(result.data?.cardBack ?? '');
      this.cd.detectChanges();
    });
  }

  private openImportExportDialog(data?: any) {
    this.dialogRef = this.dialog.open<DialogResult>(ImportExportCardListDialog, {
      ...DIALOGS_CONFIG,
      data: { list: data || '' }
    });

    this.dialogRef?.closed.subscribe((result: DialogResult | undefined) => {
      if (result?.status === 'confirmed' && result.data?.list) {
        const { cards, unknown } = parseCardList(result.data.list, this.cardsMap, {
          packs: this.packs,
          altTitle: card => this.translations.title(card),
        });
        this.selectedCards = new Map(Object.entries(cards));
        this.updateLegality();
        if (unknown.length > 0) {
          this.notification.notify(this.i18n.t('notifications.cardListUnknown', [unknown.length]), 'warning');
        }
        this.cd.detectChanges();
      }
    });
  }
}
