import { ChangeDetectorRef, Component, computed, effect, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Deck } from '../../../models/deck';
import { FormsModule } from '@angular/forms';
import { Side } from '../../../models/side';
import { UIButton, UiBadge, UiIconButton, UiSegmented, SegmentedOption } from '../../../ui';
import { Dialog, DialogRef } from '@angular/cdk/dialog';
import { DialogResult } from '../../../models/DialogResult';
import { NewDeckDialog } from '../../../components/dialogs/new-deck-dialog/new-deck-dialog';
import { DIALOGS_CONFIG } from '../../../const/dialogConfig';
import { NotificationService } from '../../../services/notification-service';
import { DeckService } from '../../../services/deck-service';
import { FirebaseService } from '../../../services/firebase-service';
import { FilterDecksBySidePipe } from "../../../pipes/filter-decks-by-side-pipe";
import { CheckAgendaPointsPipe } from '../../../pipes/check-agenda-points-pipe';
import { CheckInfluencePipe } from '../../../pipes/check-influence-pipe';
import { CardService } from '../../../services/card-service';
import { ConfirmDialog } from '../../../components/dialogs/confirm-dialog/confirm-dialog';
import { TranslatePipe } from '../../../i18n/translate-pipe';
import { I18nService } from '../../../i18n/i18n-service';
import { AuthService } from '../../../services/auth-service';
import { Pack } from '../../../models/pack';
import { CardTranslationService } from '../../../services/card-translation-service';
import { DeckArt } from '../../../components/deck-art/deck-art';
import { CardTitlePipe } from '../../../pipes/card-title-pipe';

import { parseCardList } from '../../../utils/card-list';

import { FormatService } from '../../../services/format-service';

@Component({
  selector: 'app-decks-list-page',
  imports: [TranslatePipe, CardTitlePipe, DeckArt, FormsModule, UIButton, UiBadge, UiIconButton, UiSegmented, FilterDecksBySidePipe],
  templateUrl: './decks-list-page.html',
  styleUrl: './decks-list-page.scss',
})
export class DecksListPage {
  private i18n = inject(I18nService);
  public authService = inject(AuthService);
  public sides: Side[] = [];

  public originalDecks: Deck[] = [];
  public allDesks: Deck[] = [];
  public decks: Deck[] = [];
  public cardsMap: Map<string, any> = new Map();
  public viewMode: 'mine' | 'public' = 'mine';
  public readonly viewModeOptions: SegmentedOption[] = [
    { value: 'mine', label: 'decksListPage.viewPersonal' },
    { value: 'public', label: 'decksListPage.viewPublic' },
  ];
  private myDecks: Deck[] = [];
  private publicDecks: Deck[] = [];
  private packs: Pack[] = [];
  private translations = inject(CardTranslationService);

  constructor(
    private cd: ChangeDetectorRef,
    private route: ActivatedRoute,
    private notification: NotificationService,
    private deckService: DeckService,
    private cardService: CardService,
    public firebase: FirebaseService
  ) {
    this.route.parent?.data.subscribe(data => {
      this.sides = data['configs'].sides;
      this.packs = data['configs'].packs || [];
    });

    // only re-run when the signed-in user changes, not on every profile update
    const uid = computed(() => this.firebase.$user()?.uid);

    // the catalog is needed by everybody (guests included)
    void this.cardService.loadCards();

    effect(() => {
      if (uid()) {
        this.deckService.getDecksByUser();
        this.deckService.getPublicDecks();
      }
    });

    effect(() => {
      this.myDecks = this.deckService.$myDecks();
      this.cardsMap = this.cardService.$cardsMap();
      if (this.viewMode === 'mine') this.refreshList();
      this.cd.detectChanges();
    });

    effect(() => {
      this.publicDecks = this.deckService.$publicDecks();
      if (this.viewMode === 'public') this.refreshList();
      this.cd.detectChanges();
    });
  }

  /** Number of cards in the deck (sum of the copies). */
  public deckSize(deck: Deck): number {
    return Object.values(deck.cards ?? {}).reduce((total, qty) => total + Number(qty), 0);
  }

  /** Name of the original author to show on a deck, or null when it is the user's own deck. */
  public authorOf(deck: Deck): string | null {
    if (!deck.originalAuthorName) return null;
    if (deck.originalAuthorId === this.firebase.$user()?.uid) return null;
    return deck.originalAuthorName;
  }

  /** True for decks the current user can edit: saved on this device or owned online. */
  public canEdit(deck: Deck): boolean {
    return !!deck.local || deck.createdBy === this.firebase.$user()?.uid;
  }

  public switchViewMode(mode: 'mine' | 'public') {
    if (this.viewMode === mode) return;
    this.viewMode = mode;
    this.refreshList();
  }

  private refreshList() {
    const source = this.viewMode === 'mine' ? this.myDecks : this.publicDecks;
    this.allDesks = source;
    this.originalDecks = [...source];
    this.decks = [...source];
    this.applyFilters();
  }

  public filters = {
    text: '',
    side: 'all',
  };

  // FILTERS
  // Text filter
  onChangeTextSearch(event: any) {
    this.filters.text = event.target.value.toLowerCase();
    this.applyFilters();
  }

  // Side filter
  onChangeSideFilter(event: any) {
    this.filters.side = event.target.value;
    this.applyFilters();
  }

  private applyFilters() {
    this.decks = this.allDesks.filter(deck => {
      if (
        this.filters.text &&
        !deck.name.toLowerCase().includes(this.filters.text)
      ) {
        return false;
      }

      if (
        this.filters.side !== 'all' &&
        deck.side !== this.filters.side
      ) {
        return false;
      }

      return true;
    });
  }

  public resetFilters() {
    this.filters = {
      text: '',
      side: 'all',
    };

    this.decks = [...this.originalDecks];
  }

  // DIALOG

  private dialog = inject(Dialog);
  private dialogRef: DialogRef<DialogResult, any> | null = null;

  /** New deck from a pasted card list (side, identity and storage are asked in the same dialog). */
  public openImportDeckDialog(): void {
    this.openNewDeckDialog(undefined, true);
  }

  public formatService = inject(FormatService);

  /** The deck with the formats it is legal in worked out (when the formats and the catalog are known). */
  private async withLegality(deck: Deck): Promise<Deck> {
    await this.formatService.load();
    if (this.formatService.formats().length === 0 || this.cardsMap.size === 0) return deck;
    return {
      ...deck,
      legalFormats: this.legalNow(deck),
      legalFormatsBasis: this.formatService.signature(),
    };
  }

  private legalNow(deck: Deck): string[] {
    const identity = this.cardsMap.get(deck.identity.id) ?? deck.identity;
    return this.formatService.legalFormats(
      { identity, cards: new Map(Object.entries(deck.cards ?? {})) }, this.cardsMap);
  }

  private legalCache = new Map<string, { key: string; ids: string[] }>();

  /**
   * Formats the deck is legal in: the ones saved with it, or worked out again here when the card
   * pools or lists changed since (or it was saved before formats were tracked).
   */
  public legalFormatsOf(deck: Deck): string[] {
    const basis = this.formatService.signature();
    if (!basis || this.cardsMap.size === 0) return deck.legalFormats ?? [];
    if (deck.legalFormats && deck.legalFormatsBasis === basis) return deck.legalFormats;

    const key = `${basis}|${deck.updatedAt?.seconds ?? 0}|${deck.identity?.id}|${Object.keys(deck.cards ?? {}).length}`;
    const cached = this.legalCache.get(deck.id);
    if (cached?.key === key) return cached.ids;
    const ids = this.legalNow(deck);
    this.legalCache.set(deck.id, { key, ids });
    return ids;
  }

  /** Display names of formats, in the order of the format list. */
  /** Format pills shown on a deck before collapsing the rest into a "+N". */
  public readonly maxFormatPills = 3;

  public formatNames(ids: string[]): string[] {
    return this.formatService.formats().filter(f => ids.includes(f.id)).map(f => f.name);
  }

  public openNewDeckDialog(side?: 'runner' | 'corp', importList = false): void {
    this.dialogRef = this.dialog.open<DialogResult>(NewDeckDialog, {
      ...DIALOGS_CONFIG,
      panelClass: 'dialog-container',
      disableClose: true,
      data: {
        sides: this.sides,
        signedIn: !!this.firebase.$user(),
        side: side ? side : undefined,
        importList,
      }
    });

    this.dialogRef.closed.subscribe((result: DialogResult | undefined) => {
      if (result?.status === 'confirmed') {
        const deck = result.data.deck;
        let unknown: string[] = [];
        if (result.data.cardList) {
          const parsed = parseCardList(result.data.cardList, this.cardsMap, {
            packs: this.packs,
            altTitle: card => this.translations.title(card),
          });
          deck.cards = parsed.cards;
          unknown = parsed.unknown;
        }
        this.withLegality(deck).then(withFormats => this.deckService.newDeck(withFormats)).then(() => {
          this.notification.notify(this.i18n.t(result.data.cardList ? 'notifications.deckImported' : 'notifications.newDeckCreated'), 'check');
          if (unknown.length > 0) {
            this.notification.notify(this.i18n.t('notifications.cardListUnknown', [unknown.length]), 'warning');
          }
        }).catch(err => {
          this.notification.notify(this.i18n.t('notifications.errorCreatingDeck', [err.message]), 'dangerous');
        });
      }
    })
  }

  public openConfirmDeleteDeckDialog(deck: Deck): void {
    this.dialogRef = this.dialog.open<DialogResult>(ConfirmDialog, {
      ...DIALOGS_CONFIG,
      disableClose: true,
    });

    this.dialogRef?.closed.subscribe((result: DialogResult | undefined) => {
      if (result?.status === 'confirmed') {
        this.deckService.deckRemove(deck.id).then(() => {
          this.notification.notify(this.i18n.t('notifications.deckDeleted'), 'check');
        }).catch(err => {
          this.notification.notify(this.i18n.t('notifications.errorDeletingDeck', [err.message]), 'dangerous');
        });
      }
    })
  }
}
