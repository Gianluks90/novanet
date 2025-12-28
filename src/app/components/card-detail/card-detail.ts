import { Component, effect, inject, input, LOCALE_ID, output, signal } from '@angular/core';
import { Card } from '../../models/card';
import { FormsModule } from '@angular/forms';
import { NrIconsPipe } from '../../pipes/nr-icons-pipe';
import { PackCodePipe } from '../../pipes/pack-code-pipe';
import { Pack } from '../../models/pack';
import { UIButton } from '../../ui';
import { Dialog, DialogRef } from '@angular/cdk/dialog';
import { DIALOGS_CONFIG } from '../../const/dialogConfig';
import { DialogResult } from '../../models/DialogResult';
import { TranslateDialog } from '../dialogs/translate-dialog/translate-dialog';
import { FirebaseService } from '../../services/firebase-service';
import { NotificationService } from '../../services/notification-service';
import { TypeLabelPipe } from '../../pipes/type-label-pipe';
import { ConfirmDialog } from '../dialogs/confirm-dialog/confirm-dialog';
import { CardService } from '../../services/card-service';
import { NetrunnerDbService } from '../../db/netrunner-db-service';
import { KeywordLabelPipe } from '../../pipes/keyword-label-pipe';
import { FactionLabelPipe } from "../../pipes/faction-label-pipe";
import { UserService } from '../../services/user-service';

@Component({
  selector: 'app-card-detail',
  imports: [
    FormsModule,
    NrIconsPipe,
    PackCodePipe,
    UIButton,
    TypeLabelPipe,
    KeywordLabelPipe,
    FactionLabelPipe
  ],
  templateUrl: './card-detail.html',
  styleUrl: './card-detail.scss',
})
export class CardDetail {
  public selectedCard = input<Card | null>(null);
  public card = signal<Card | null>(null);
  public packs = input<Pack[]>([]);
  public zoomCardEmit = output<boolean>();
  public locale = inject(LOCALE_ID);

  constructor(
    public firebase: FirebaseService,
    private notification: NotificationService,
    private cardService: CardService,
    private nrdbService: NetrunnerDbService,
    private userService: UserService) {
    // effect(() => {
    //   if (this.selectedCard()) {
    //     this.initFactionCostArray();
    //     if (this.selectedCard()?.translations) {
    //       const translation = this.selectedCard()?.translations?.[this.locale as string];
    //       if (translation) {
    //         const translatedCard: Card = {
    //           ...this.selectedCard()!,
    //           title: translation.title || this.selectedCard()!.title,
    //           text: translation.text || this.selectedCard()!.text,
    //           flavor: translation.flavor || this.selectedCard()!.flavor,
    //         };
    //         this.card.set(translatedCard);
    //       }
    //     } else {
    //       this.card.set(this.selectedCard());
    //     }
    //   }
    // })

    effect(() => {
      const card = this.selectedCard();
      if (!card) return;

      this.initFactionCostArray();

      const translation = card.translations?.[this.locale as string];

      if (translation) {
        this.card.set({
          ...card,
          title: translation.title,
          text: translation.text,
          flavor: translation.flavor
        });
      } else {
        this.card.set(card);
      }
    });
  }

  public factionCostArray: any[] = [];
  private initFactionCostArray() {
    const cost = this.selectedCard()?.faction_cost || 0;
    if (cost && cost > 0) {
      this.factionCostArray = Array(5).fill(false).map((_, i) => i < cost);
    }
  }

  public scrollToSelected() {
    if (this.selectedCard()?.code) {
      const element = document.getElementById(this.selectedCard()?.code || '');
      element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  public zoomCard() {
    this.zoomCardEmit.emit(true);
  }

  // DIALOG

  private dialog = inject(Dialog);
  private dialogRef: DialogRef<DialogResult, any> | null = null;

  public openTranslateDialog() {
    this.dialogRef = this.dialog.open<DialogResult>(TranslateDialog, {
      ...DIALOGS_CONFIG,
      panelClass: 'big-dialog-container',
      disableClose: true,
      data: { user: this.firebase.$user(), card: this.selectedCard },
    });

    this.dialogRef.closed.subscribe((result: DialogResult | undefined) => {
      if (result?.status === 'confirmed') {
        this.notification.notify($localize`Translation submitted. Thank you.`, 'check')
      }
    });
  }

  public openConfirmTranslation() {
    this.dialogRef = this.dialog.open<DialogResult>(ConfirmDialog, {
      ...DIALOGS_CONFIG,
      panelClass: 'dialog-container',
      disableClose: true,
    });

    this.dialogRef.closed.subscribe(async (result: DialogResult | undefined) => {
      if (result?.status !== 'confirmed' || !this.selectedCard()) {
        return;
      }

      try {

        const existingTranslation =
          this.selectedCard()!.translations?.[this.locale as string];

        if (!existingTranslation) {
          throw new Error('Trying to approve a non-existing translation');
        }

        const updatedCard: Card = {
          ...this.selectedCard()!,
          translations: {
            ...this.selectedCard()!.translations,
            [this.locale]: {
              ...existingTranslation,
              approved: true
            }
          }
        };
        await this.cardService.approveTranslation(
          this.selectedCard()!,
          this.locale as string
        );

        await this.nrdbService.mergeAndSaveTranslations(
          this.selectedCard()!.code,
          {
            [this.locale]: {
              ...this.selectedCard()!.translations?.[this.locale as string],
              approved: true,
            },
            updatedAt: new Date()
          }
        );

        // this.card.set(updatedCard);

        this.notification.notify($localize`Translation confirmed, soon it will be visible for everyone (or refresh the page to see the changes).`, 'check', 6000);
      } catch (error) {
        this.notification.notify($localize`Error approving translation, please try again later.`, 'dangerous');
      }
    });
  }

  public updateUserFavoriteCaption(caption: string) {
    if (!this.firebase.$user()) return;
    this.userService.updateUserInfo(this.firebase.$user()!.uid, { favoriteCaption: caption }).then(() => {
      this.notification.notify($localize`Favorite caption updated.`, 'check');
    }).catch((error) => {
      console.error('Error updating favorite caption:', error);
      this.notification.notify($localize`Error updating favorite caption, please try again later.`, 'dangerous');
    });
  }

}
