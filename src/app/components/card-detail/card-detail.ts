import { Component, effect, inject, input, LOCALE_ID, output, signal } from '@angular/core';
import { Card } from '../../models/card';
import { FormsModule } from '@angular/forms';
import { NrIconsPipe } from '../../pipes/nr-icons-pipe';
import { PackCodePipe } from '../../pipes/pack-code-pipe';
import { Pack } from '../../models/pack';
import { UIButton } from '../../ui';
import { FirebaseService } from '../../services/firebase-service';
import { NotificationService } from '../../services/notification-service';
import { TypeLabelPipe } from '../../pipes/type-label-pipe';
import { KeywordLabelPipe } from '../../pipes/keyword-label-pipe';
import { FactionLabelPipe } from "../../pipes/faction-label-pipe";
import { UserService } from '../../services/user-service';
import { CdkMenu, CdkMenuTrigger } from '@angular/cdk/menu';

@Component({
  selector: 'app-card-detail',
  imports: [
    FormsModule,
    NrIconsPipe,
    PackCodePipe,
    UIButton,
    TypeLabelPipe,
    KeywordLabelPipe,
    FactionLabelPipe,
    CdkMenuTrigger, 
    CdkMenu
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
  public disableZoom = input<boolean>(false);
  public disableCenter = input<boolean>(false);
  public disableMenu = input<boolean>(false);

  constructor(
    public firebase: FirebaseService,
    private notification: NotificationService,
    private userService: UserService) {

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

  public updateUserFavoriteCaption() {

    const caption = {
      en: this.selectedCard()?.flavor || '',
      [this.locale]: this.selectedCard()?.translations?.[this.locale]?.flavor || ''
    }
    if (!this.firebase.$user()) return;
    this.userService.updateUserInfo(this.firebase.$user()!.uid, { favoriteCaption: caption }).then(() => {
      this.notification.notify($localize`Favorite caption updated.`, 'check');
    }).catch((error) => {
      console.error('Error updating favorite caption:', error);
      this.notification.notify($localize`Error updating favorite caption, please try again later.`, 'dangerous');
    });
  }

}
