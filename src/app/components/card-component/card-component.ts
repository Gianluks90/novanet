import { Component, computed, input, signal } from '@angular/core';
import { Card } from '../../models/card';
import { CardBack } from '../card-back/card-back';
import { CardTiltDirective } from '../../directives/card-tilt';

/** Sizes served by card-images.netrunnerdb.com: 51x71, 116x162, 165x230 and 300x418 px. */
export type CardImageSize = 'tiny' | 'small' | 'medium' | 'large';

@Component({
  selector: 'app-card-component',
  imports: [CardBack, CardTiltDirective],
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

  /** The card shows its back until the face image has loaded, then flips. */
  public loaded = signal(false);

  public imageUrl = computed(() =>
    `https://card-images.netrunnerdb.com/v2/${this.imageSize()}/${this.card()?.id}.jpg`);
}
