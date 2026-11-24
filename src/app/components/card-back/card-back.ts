import { Component, computed, inject, input, signal } from '@angular/core';
import { CardBackService } from '../../services/card-back-service';

/**
 * A card back: the one of the catalog that applies (`back`, if given, e.g. a deck's choice;
 * else the player's preferred one for the side, else the side's default). Until the catalog or
 * the image is there (or if it fails) a plain back with the NovaNet logo is shown. Used as the
 * loading state of a card, which flips to its face once the image has loaded.
 */
@Component({
  selector: 'app-card-back',
  templateUrl: './card-back.html',
  styleUrl: './card-back.scss',
  host: { '[attr.data-side]': 'side()', '[class.has-art]': '!!artUrl() && !failed()' },
})
export class CardBack {
  private backs = inject(CardBackService);

  public side = input<string | null | undefined>(null);
  /** Id of a back in the catalog that wins over the player's preference (the deck's back). */
  public back = input<string | null | undefined>(null);
  /**
   * Show the artwork. Turn it off for long lists (the cards grid has thousands of cards): the plain
   * back costs nothing, an image per element froze Safari on an iPad.
   */
  public art = input<boolean>(true);

  public artUrl = computed(() => {
    if (!this.art()) return null;
    const side = this.side();
    if (side !== 'runner' && side !== 'corp') return null;
    const back = this.backs.resolve(side, this.back());
    return back ? this.backs.url(back) : null;
  });
  public failed = signal(false);
}
