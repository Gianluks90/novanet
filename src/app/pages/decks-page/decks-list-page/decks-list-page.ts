import { ChangeDetectorRef, Component, effect, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Deck } from '../../../models/deck';
import { FormsModule } from '@angular/forms';
import { Side } from '../../../models/side';
import { UIButton } from '../../../ui';
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

@Component({
  selector: 'app-decks-list-page',
  imports: [FormsModule, UIButton, FilterDecksBySidePipe, RouterLink],
  templateUrl: './decks-list-page.html',
  styleUrl: './decks-list-page.scss',
})
export class DecksListPage {
  public sides: Side[] = [];

  public originalDecks: Deck[] = [];
  public allDesks: Deck[] = [];
  public decks: Deck[] = [];
  public cardsMap: Map<string, any> = new Map();

  constructor(
    private cd: ChangeDetectorRef,
    private route: ActivatedRoute,
    private notification: NotificationService,
    private deckService: DeckService,
    private cardService: CardService,
    private firebase: FirebaseService
  ) {
    this.route.parent?.data.subscribe(data => {
      this.sides = data['configs'].sides.data;
    });

    effect(() => {
      if (this.firebase.$user()) {
        this.cardService.loadCards();
        this.deckService.getDecksByUser();
      }
    });

    effect(() => {
      const decks = this.deckService.$decks();
      this.cardsMap = this.cardService.$cardsMap();

      this.allDesks = decks;
      this.originalDecks = [...decks];
      this.decks = [...decks];

      this.cd.detectChanges();
    });
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
        side: side ? side : undefined
      }
    });

    this.dialogRef.closed.subscribe((result: DialogResult | undefined) => {
      if (result?.status === 'confirmed') {
        this.deckService.newDeck(result.data.deck).then(() => {
          this.notification.notify($localize`New deck created.`, 'check');
        }).catch(err => {
          this.notification.notify($localize`Error creating deck: ${err.message}`, 'dangerous');
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
          this.notification.notify($localize`Deck deleted.`, 'check');
        }).catch(err => {
          this.notification.notify($localize`Error deleting deck: ${err.message}`, 'dangerous');
        });
      }
    })
  }
}
