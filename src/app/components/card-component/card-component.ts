import { Component, input } from '@angular/core';
import { Card } from '../../models/card';
import { CardBack } from '../card-back/card-back';
import { CardImage, CardImageSize } from '../card-image/card-image';
import { CardTiltDirective } from '../../directives/card-tilt';
import { CardTitlePipe } from '../../pipes/card-title-pipe';

export type { CardImageSize };

@Component({
  selector: 'app-card-component',
  imports: [CardBack, CardImage, CardTiltDirective, CardTitlePipe],
  templateUrl: './card-component.html',
  styleUrl: './card-component.scss',
})
export class CardComponent {
  public card = input<Card | null>(null);
  public selectedCard = input<Card | null>(null);
  public selectedCardClass = input<boolean | null>(false);
  public notSelectedCardClass = input<boolean | null>(false);
  /** Image size to download: pick the smallest one that still looks sharp at the displayed size. */
  public imageSize = input<CardImageSize>('large');
}
