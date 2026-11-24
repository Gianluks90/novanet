import { Component, computed, input, linkedSignal, output } from '@angular/core';
import { Card } from '../../models/card';
import { TranslatePipe } from '../../i18n/translate-pipe';

/** Sizes served by card-images.netrunnerdb.com: 51x71, 116x162, 165x230 and 300x418 px. */
export type CardImageSize = 'tiny' | 'small' | 'medium' | 'large';

/**
 * Picture of a card. The card title is its alternative text; when the image cannot be loaded it is
 * replaced by a card-shaped placeholder with a "broken image" icon and, only when the card is big
 * enough to be read (container query on the host's width), the title.
 *
 * The host fills its parent's width with a 2:3 ratio; the parent can override size and
 * `--card-image-radius`. `settled` is emitted once the image has loaded or failed.
 */
@Component({
  selector: 'app-card-image',
  imports: [TranslatePipe],
  templateUrl: './card-image.html',
  styleUrl: './card-image.scss',
})
export class CardImage {
  public card = input.required<Card>();
  public size = input<CardImageSize>('large');
  /** Text for the alt/placeholder (e.g. the translated title); defaults to the English title. */
  public title = input<string | null>(null);
  /** Native lazy loading, for long lists. */
  public lazy = input<boolean>(false);
  public settled = output<void>();

  public url = computed(
    () => `https://card-images.netrunnerdb.com/v2/${this.size()}/${this.card().id}.jpg`);
  public label = computed(() => this.title() || this.card().title);

  /** Reset when the url changes (another card or size), so a retry is possible. */
  public failed = linkedSignal<string, boolean>({ source: this.url, computation: () => false });

  public onError() {
    this.failed.set(true);
    this.settled.emit();
  }
}
