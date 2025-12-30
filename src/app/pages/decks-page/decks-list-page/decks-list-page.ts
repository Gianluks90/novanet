import { ChangeDetectorRef, Component, effect, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
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

@Component({
  selector: 'app-decks-list-page',
  imports: [FormsModule, UIButton, FilterDecksBySidePipe],
  templateUrl: './decks-list-page.html',
  styleUrl: './decks-list-page.scss',
})
export class DecksListPage {
  public sides: Side[] = [];

  public originalDecks: Deck[] = [];
  public allDesks: Deck[] = [];
  public decks: Deck[] = [];

  constructor(
    private cd: ChangeDetectorRef,
    private route: ActivatedRoute,
    private notification: NotificationService,
    private deckService: DeckService,
    private firebase: FirebaseService
  ) {
    this.route.parent?.data.subscribe(data => {
      this.sides = data['configs'].sides.data;
    });

    effect(() => {
      if (this.firebase.$user()) {
        this.deckService.getDecksByUser();
      }
    })

    effect(() => {
      this.allDesks = this.deckService.$decks();
      console.log(this.allDesks);

      this.originalDecks = [...this.allDesks];
      this.decks = [...this.allDesks];

      this.cd.detectChanges();

    });
  }

  public filters = {
    text: '',
    side: 'all',
  };

  // ngOnInit() {
  //   this.allDesks = [];
  //   this.originalDecks = [...this.allDesks];
  //   this.decks = [...this.allDesks];

  //   this.cd.detectChanges();
  // }

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
}
