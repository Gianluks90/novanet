import { Component, ElementRef, inject, input, model } from '@angular/core';
import { TranslatePipe } from '../../i18n/translate-pipe';
import { TranslationKey } from '../../i18n/en';

export interface SegmentedOption {
  value: string;
  /** Translation key of the visible text. */
  label: TranslationKey;
  /** Optional Material Symbols icon shown before the text. */
  icon?: string;
  /**
   * Hex color: the segment becomes a color swatch (filled with it, a check mark when selected) and
   * `label` is only its accessible name and tooltip. Use together with `fill`.
   */
  color?: string;
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
  /** Stretch to the full width of the container, segments sharing it equally. */
  public fill = input<boolean>(false);
  /** No outer frame and no dividers: for a segmented control placed inside a bordered block. */
  public borderless = input<boolean>(false);
  /** Translation key of the group's accessible name. */
  public groupLabel = input<TranslationKey | null>(null);

  private host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  /** Only the selected segment (or the first one if none is selected) is in the tab order. */
  public isTabStop(index: number): boolean {
    const selected = this.options().findIndex(o => o.value === this.value());
    return index === (selected < 0 ? 0 : selected);
  }

  /** Readable check-mark color (black or white) on top of a hex background. */
  public onColor(hex: string): string {
    const n = parseInt(hex.replace('#', ''), 16);
    const channel = (v: number) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    const luminance = 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
    return luminance > 0.4 ? '#000000' : '#ffffff';
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
