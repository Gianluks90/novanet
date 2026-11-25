import { Component, computed, inject, input, model } from '@angular/core';
import { CardBackDef } from '../../models/card-back';
import { CardBackService } from '../../services/card-back-service';
import { TranslatePipe } from '../../i18n/translate-pipe';

/**
 * Chooser of a card back of one side: a row of thumbnails. `value` is the id of the picked back.
 * With `allowDefault` (a deck) `value` null means "follow the player's preferred back": that back
 * is marked "default" and shown as picked, and picking it again sets `value` back to null.
 */
@Component({
  selector: 'app-card-back-picker',
  imports: [TranslatePipe],
  templateUrl: './card-back-picker.html',
  styleUrl: './card-back-picker.scss',
})
export class CardBackPicker {
  public service = inject(CardBackService);

  public side = input.required<'runner' | 'corp'>();
  public value = model<string | null>(null);
  public allowDefault = input<boolean>(false);
  /** One horizontal row that scrolls (no scrollbar) instead of wrapping onto several rows. */
  public carousel = input<boolean>(false);
  /** Two columns of thumbnails in a box that scrolls vertically (the deck's dialog). */
  public grid = input<boolean>(false);

  /** Carousel with a mouse: the wheel scrolls it sideways. */
  public onWheel(event: WheelEvent, el: HTMLElement): void {
    if (!this.carousel() || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
    el.scrollLeft += event.deltaY;
    event.preventDefault();
  }

  public options = computed(() => this.service.backs(this.side()));
  /** The player's preferred back for the side (what a deck without a choice shows). */
  public defaultBack = computed(() => this.service.resolve(this.side()));

  public isSelected(back: CardBackDef): boolean {
    const value = this.value();
    if (value) return value === back.id;
    return this.allowDefault() && back.id === this.defaultBack()?.id;
  }

  public pick(back: CardBackDef): void {
    this.value.set(this.allowDefault() && back.id === this.defaultBack()?.id ? null : back.id);
  }
}
