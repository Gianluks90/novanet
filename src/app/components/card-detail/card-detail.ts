import { Component, effect, inject, input, output } from '@angular/core';
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
  public packs = input<Pack[]>([]);
  public zoomCardEmit = output<boolean>();

  constructor(private firebase: FirebaseService, private notification: NotificationService) {
    effect(() => {
      if (this.selectedCard()) {
        this.initFactionCostArray();
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

  // public cardZoomed: boolean = false;
  public zoomCard() {
    // this.cardZoomed = true;
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
        this.notification.notify('Settings updated', 'check')
      }
    });
  }
}
