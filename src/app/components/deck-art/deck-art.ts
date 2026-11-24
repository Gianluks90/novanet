import { Component, input } from '@angular/core';
import { Card } from '../../models/card';
import { CardBack } from '../card-back/card-back';
import { CardImage, CardImageSize } from '../card-image/card-image';

/**
 * The picture of a deck: its identity over the deck's card back, which sticks out a little,
 * tilted. The back is the deck's own (`back`), else the player's preferred one for the side.
 * The host is a 2:3 box: the parent sets its width (or its height, as a flex item). The back
 * sticks out on the right, so leave room there.
 */
@Component({
  selector: 'app-deck-art',
  imports: [CardBack, CardImage],
  templateUrl: './deck-art.html',
  styleUrl: './deck-art.scss',
})
export class DeckArt {
  public identity = input.required<Card>();
  public side = input.required<'runner' | 'corp'>();
  /** Id of the deck's card back (none: the player's). */
  public back = input<string | null | undefined>(null);
  /** Title shown as alt text / in the placeholder (e.g. translated). */
  public title = input<string | null>(null);
  public size = input<CardImageSize>('medium');
  public lazy = input<boolean>(true);
}
