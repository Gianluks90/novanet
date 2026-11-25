import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { Card } from '../../models/card';
import { FormsModule } from '@angular/forms';
import { NrIconsPipe } from '../../pipes/nr-icons-pipe';
import { PackCodePipe } from '../../pipes/pack-code-pipe';
import { Pack } from '../../models/pack';
import { UiBadge, UiIconButton } from '../../ui';
import { FirebaseService } from '../../services/firebase-service';
import { NotificationService } from '../../services/notification-service';
import { TypeLabelPipe } from '../../pipes/type-label-pipe';
import { KeywordLabelPipe } from '../../pipes/keyword-label-pipe';
import { FactionLabelPipe } from "../../pipes/faction-label-pipe";
import { UserService } from '../../services/user-service';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { TranslatePipe } from '../../i18n/translate-pipe';
import { I18nService } from '../../i18n/i18n-service';
import { Dialog } from '@angular/cdk/dialog';
import { DIALOGS_CONFIG, LOCKED_DIALOG } from '../../const/dialogConfig';
import { PersonalTranslationDialog } from '../dialogs/personal-translation-dialog/personal-translation-dialog';
import { CardTranslationService } from '../../services/card-translation-service';
import { CardImage } from '../card-image/card-image';
import { ViewportService } from '../../services/viewport-service';

import { scrollToCenter } from '../../utils/scroll';

@Component({
  selector: 'app-card-detail',
  imports: [TranslatePipe, UiBadge,
    FormsModule,
    NrIconsPipe,
    PackCodePipe,
    UiIconButton,
    TypeLabelPipe,
    KeywordLabelPipe,
    FactionLabelPipe,
    CdkMenuTrigger,
    CdkMenu,
    CdkMenuItem,
    CardImage
  ],
  templateUrl: './card-detail.html',
  styleUrl: './card-detail.scss',
})
export class CardDetail {
  public selectedCard = input<Card | null>(null);
  public card = signal<Card | null>(null);
  public packs = input<Pack[]>([]);
  /** The card's subtypes, one per label ("Icebreaker - Decoder" gives two; "G-mod" stays whole). */
  public subtypes = computed(() =>
    (this.card()?.display_subtypes ?? '').split(/\s+-\s+/).map(s => s.trim()).filter(s => s.length > 0));
  public zoomCardEmit = output<boolean>();
  private i18n = inject(I18nService);
  private translations = inject(CardTranslationService);
  private dialog = inject(Dialog);
  /** Mobile layout: the large picture closes the detail (no zoom button). */
  public viewport = inject(ViewportService);
  public get locale(): string { return this.i18n.lang(); }
  public disableZoom = input<boolean>(false);
  public disableCenter = input<boolean>(false);
  public disableMenu = input<boolean>(false);
  /** Show the card in the current language when a translation exists (`false`: English only). */
  public translated = input<boolean>(true);
  /** The effect text shown is a machine translation, not an official one. */
  public machineTranslated = signal(false);

  constructor(
    public firebase: FirebaseService,
    private notification: NotificationService,
    private userService: UserService) {

    effect(() => {
      const card = this.selectedCard();
      if (!card) return;

      this.initFactionCostArray();

      // Upstream translations are often partial (e.g. title only): fall back field by field.
      const translation = this.translated() ? this.translations.translation(card.id) : undefined;
      this.machineTranslated.set(!!translation?.machine);

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
      scrollToCenter(element);
    }
  }

  public zoomCard() {
    this.zoomCardEmit.emit(true);
  }

  /** True when the user already wrote their own translation of the selected card (current language). */
  public hasPersonalTranslation(): boolean {
    const card = this.selectedCard();
    return !!card && !!this.translations.userTranslation(card.id);
  }

  public openTranslationDialog() {
    const card = this.selectedCard();
    if (!card) return;
    this.dialog.open(PersonalTranslationDialog, {
      ...DIALOGS_CONFIG,
      panelClass: 'big-dialog-container',
      ...LOCKED_DIALOG,
      data: { card },
    });
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
