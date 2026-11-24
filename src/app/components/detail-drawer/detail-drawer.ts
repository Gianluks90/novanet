import { Component, input, output } from '@angular/core';
import { Card } from '../../models/card';
import { Pack } from '../../models/pack';
import { UiIconButton } from '../../ui';
import { TranslatePipe } from '../../i18n/translate-pipe';
import { CardDetail } from '../card-detail/card-detail';

/**
 * The card detail of the deck builder. Narrow window: a drawer that slides in from the right over
 * its positioned ancestor while `open`; from `$wide-breakpoint` it is a plain panel (the parent
 * decides where it sits). The host is `display: contents`, so the inner `aside` is the layout item.
 */
@Component({
  selector: 'app-detail-drawer',
  imports: [CardDetail, UiIconButton, TranslatePipe],
  templateUrl: './detail-drawer.html',
  styleUrl: './detail-drawer.scss',
})
export class DetailDrawer {
  public card = input<Card | null>(null);
  public packs = input<Pack[]>([]);
  public translated = input<boolean>(true);
  public open = input<boolean>(false);
  public closed = output<void>();
  public zoomed = output<boolean>();
}
