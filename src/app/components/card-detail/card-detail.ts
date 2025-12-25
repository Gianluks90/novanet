import { Component, effect, inject, input, LOCALE_ID, output, signal } from '@angular/core';
import { Card, CardTranslation } from '../../models/card';
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

@Component({
  selector: 'app-card-detail',
  imports: [
    FormsModule,
    NrIconsPipe,
    PackCodePipe,
    UIButton,
    TypeLabelPipe
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

  constructor(public firebase: FirebaseService, private notification: NotificationService, private cardService: CardService) {
    effect(() => {
      if (this.selectedCard()) {
        this.initFactionCostArray();
        if (this.selectedCard()?.translations) {
          const translation = this.selectedCard()?.translations?.[this.locale as string];
          if (translation) {
            console.log('tran', translation);
            
            const translatedCard: Card = {
              ...this.selectedCard()!,
              title: translation.title || this.selectedCard()!.title,
              text: translation.text || this.selectedCard()!.text,
              flavor: translation.flavor || this.selectedCard()!.flavor,
            };
            this.card.set(translatedCard);
          }
        } else {
          this.card.set(this.selectedCard());
        }
      }
    })
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

  // public openConfirmTranslation() {
  //   this.dialogRef = this.dialog.open<DialogResult>(ConfirmDialog, {
  //     ...DIALOGS_CONFIG,
  //     panelClass: 'dialog-container',
  //     disableClose: true,
  //   });
    
  //   this.dialogRef.closed.subscribe((result: DialogResult | undefined) => {
  //     if (result?.status === 'confirmed') {
  //       this.cardService.approveTranslation(this.selectedCard()!, this.locale as string).then(() => {})
  //       .then(() => {
  //         this.notification.notify($localize`Translation confirmed, it's now visibile for everyone.`, 'check', 5000);
  //         // forziamo refresh della card selezionata
  //         const prevTranslation = this.selectedCard()!.translations?.[this.locale as string] || {} as CardTranslation;
  //         const updatedCard = {
  //           ...this.selectedCard()!,
  //           translations: {
  //             ...this.selectedCard()!.translations,
  //             [this.locale]: {
  //               ...prevTranslation,
  //               title: prevTranslation.title ?? this.selectedCard()!.title ?? '',
  //               text: prevTranslation.text ?? this.selectedCard()!.text ?? '',
  //               flavor: prevTranslation.flavor ?? this.selectedCard()!.flavor ?? '',
  //               approved: true,
  //               reported: prevTranslation.reported ?? false,
  //               translatedAt: prevTranslation.translatedAt ?? null
  //             }
  //           }
  //         };
  //         this.card.set(updatedCard);
  //       })
  //       .catch(() => {
  //         this.notification.notify($localize`Error approving translation, please try again later.`, 'dangerous');
  //       });
  //     }
  //   });
  // }

  public openConfirmTranslation() {
  this.dialogRef = this.dialog.open<DialogResult>(ConfirmDialog, {
    ...DIALOGS_CONFIG,
    panelClass: 'dialog-container',
    disableClose: true,
  });
  
  this.dialogRef.closed.subscribe(async (result: DialogResult | undefined) => {
    if (result?.status === 'confirmed') {
      if (!this.selectedCard()) return;

      try {
        // Approve translation via CardService
        
        // Merge back the existing translated fields without overwriting with English
        const prevTranslation = this.selectedCard()!.translations?.[this.locale as string] || {} as CardTranslation;
        const updatedCard: Card = {
          ...this.selectedCard()!,
          translations: {
            ...this.selectedCard()!.translations,
            [this.locale]: {
              ...prevTranslation,
              approved: true,
              reported: prevTranslation.reported ?? false,
              translatedAt: prevTranslation.translatedAt ?? new Date()
            }
          }
        };
        await this.cardService.approveTranslation(updatedCard, this.locale as string);

        // Update the card signal
        this.card.set(updatedCard);

        this.notification.notify($localize`Translation confirmed, it's now visible for everyone.`, 'check', 5000);
      } catch (e) {
        this.notification.notify($localize`Error approving translation, please try again later.`, 'dangerous');
      }
    }
  });
}

}
