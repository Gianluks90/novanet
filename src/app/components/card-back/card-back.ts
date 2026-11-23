import { Component, input } from '@angular/core';

/**
 * Generic card back (NovaNet logo on a side-colored background). Used as the loading state of a
 * card, which flips to its face once the image has loaded.
 */
@Component({
  selector: 'app-card-back',
  templateUrl: './card-back.html',
  styleUrl: './card-back.scss',
  host: { '[attr.data-side]': 'side()' },
})
export class CardBack {
  public side = input<string | null | undefined>(null);
}
