import { Component, input, output } from '@angular/core';
import { Card } from '../../models/card';
import { TranslatePipe } from '../../i18n/translate-pipe';
import { CardImage } from '../card-image/card-image';
import { CardTitlePipe } from '../../pipes/card-title-pipe';

/** Floating large picture of a card (cards page, deck builder). The parent decides when to show it. */
@Component({
  selector: 'app-card-zoom',
  imports: [TranslatePipe, CardImage, CardTitlePipe],
  templateUrl: './card-zoom.html',
  styleUrl: './card-zoom.scss',
})
export class CardZoom {
  public card = input.required<Card>();
  public closed = output<void>();
}
