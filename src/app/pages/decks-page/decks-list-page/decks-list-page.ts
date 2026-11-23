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

@Component({
  selector: 'app-decks-list-page',
  imports: [TranslatePipe, FormsModule, UIButton, UiBadge, UiIconButton, UiSegmented, FilterDecksBySidePipe],
  templateUrl: './decks-list-page.html',
  styleUrl: './decks-list-page.scss',
})
export class DecksListPage {
  private i18n = inject(I18nService);
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

  public openNewDeckDialog(side?: 'runner' | 'corp'): void {
    this.dialogRef = this.dialog.open<DialogResult>(NewDeckDialog, {
      ...DIALOGS_CONFIG,
      panelClass: 'dialog-container',
      disableClose: true,
      data: {
        sides: this.sides,
        signedIn: !!this.firebase.$user(),
        side: side ? side : undefined
      }
    });

    this.dialogRef.closed.subscribe((result: DialogResult | undefined) => {
      if (result?.status === 'confirmed') {
        this.deckService.newDeck(result.data.deck).then(() => {
          this.notification.notify(this.i18n.t('notifications.newDeckCreated'), 'check');
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
