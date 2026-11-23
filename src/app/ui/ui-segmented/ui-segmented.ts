import { Component, ElementRef, inject, input, model } from '@angular/core';
import { TranslatePipe } from '../../i18n/translate-pipe';
import { TranslationKey } from '../../i18n/en';

export interface SegmentedOption {
  value: string;
  /** Translation key of the visible text. */
  label: TranslationKey;
  /** Optional Material Symbols icon shown before the text. */
  icon?: string;
}

/**
 * Segmented control: a row of mutually exclusive options (a styled radio group).
 * Use `[value]` + `(valueChange)`, or `[(value)]`. Keyboard: arrows/Home/End move the selection.
 */
@Component({
  selector: 'app-ui-segmented',
  imports: [TranslatePipe],
  templateUrl: './ui-segmented.html',
  styleUrl: './ui-segmented.scss',
})
export class UiSegmented {
  public options = input.required<SegmentedOption[]>();
  public value = model<string>('');
  /** `sm`: tighter horizontal padding, for toolbars and filter bars. */
  public size = input<'md' | 'sm'>('md');
  /** Translation key of the group's accessible name. */
  public groupLabel = input<TranslationKey | null>(null);

  private host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  /** Only the selected segment (or the first one if none is selected) is in the tab order. */
  public isTabStop(index: number): boolean {
    const selected = this.options().findIndex(o => o.value === this.value());
    return index === (selected < 0 ? 0 : selected);
  }

  public select(value: string) {
    this.value.set(value);
  }

  public onKeydown(event: KeyboardEvent, index: number) {
    const count = this.options().length;
    let next: number;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown': next = (index + 1) % count; break;
      case 'ArrowLeft':
      case 'ArrowUp': next = (index - 1 + count) % count; break;
      case 'Home': next = 0; break;
      case 'End': next = count - 1; break;
      default: return;
    }
    event.preventDefault();
    this.select(this.options()[next].value);
    this.host.querySelectorAll<HTMLButtonElement>('button')[next]?.focus();
  }
}
