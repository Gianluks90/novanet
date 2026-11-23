import { Component, input } from '@angular/core';

/** Small status chip: an icon plus an optional text. `label` is always the accessible name. */
@Component({
  selector: 'app-ui-badge',
  templateUrl: './ui-badge.html',
  styleUrl: './ui-badge.scss',
})
export class UiBadge {
  /** Material Symbols name. */
  public icon = input<string>('');
  /** Already translated text; also used as tooltip/accessible name. */
  public label = input.required<string>();
  /** Show only the icon (the label stays as tooltip). */
  public iconOnly = input<boolean>(false);
  public tone = input<'neutral' | 'accent' | 'warn'>('neutral');
}
