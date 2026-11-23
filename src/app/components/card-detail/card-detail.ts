import { Component, effect, inject, input, output, signal } from '@angular/core';
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
import { TranslatePipe } from '../../i18n/translate-pipe';
import { I18nService } from '../../i18n/i18n-service';
import { CardTranslationService } from '../../services/card-translation-service';

@Component({
  selector: 'app-card-detail',
  imports: [TranslatePipe, 
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
  private i18n = inject(I18nService);
  private translations = inject(CardTranslationService);
  public get locale(): string { return this.i18n.lang(); }
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

      // Upstream translations are often partial (e.g. title only): fall back field by field.
      const translation = this.translations.translation(card.id);

      if (translation) {
        this.card.set({
          ...card,
          title: translation.title || card.title,
          text: translation.text || card.text,
          flavor: translation.flavor || card.flavor
        });
      } else {
        this.card.set(card);
      }
    });
  }

  public factionCostArray: any[] = [];
  private initFactionCostArray() {
    const cost = this.selectedCard()?.influence_cost || 0;
    if (cost && cost > 0) {
      this.factionCostArray = Array(5).fill(false).map((_, i) => i < cost);
    }
  }

  public scrollToSelected() {
    if (this.selectedCard()?.id) {
      const element = document.getElementById(this.selectedCard()?.id || '');
      element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  public zoomCard() {
    this.zoomCardEmit.emit(true);
  }

  public updateUserFavoriteCaption() {

    const caption = {
      en: this.selectedCard()?.flavor || '',
      [this.locale]: this.card()?.flavor || ''
    }
    if (!this.firebase.$user()) return;
    this.userService.updateUserInfo(this.firebase.$user()!.uid, { favoriteCaption: caption }).then(() => {
      this.notification.notify(this.i18n.t('notifications.favoriteCaptionUpdated'), 'check');
    }).catch((error) => {
      console.error('Error updating favorite caption:', error);
      this.notification.notify(this.i18n.t('notifications.errorUpdatingFavoriteCaption'), 'dangerous');
    });
  }

}
