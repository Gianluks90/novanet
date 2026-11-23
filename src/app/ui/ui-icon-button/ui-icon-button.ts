import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * Icon-only button (a real `<button>`, or an `<a>` when `link` is set).
 * `label` is required: it is the accessible name and the tooltip. Pass it already translated
 * (`[label]="'key' | t"`). Handle clicks with `(click)` on the host element.
 */
@Component({
  selector: 'app-ui-icon-button',
  imports: [RouterLink],
  templateUrl: './ui-icon-button.html',
  styleUrl: './ui-icon-button.scss',
})
export class UiIconButton {
  /** Material Symbols name. */
  public icon = input.required<string>();
  public label = input.required<string>();
  public size = input<'sm' | 'md'>('md');
  /** Highlights the button (e.g. the mode it toggles is on). */
  public active = input<boolean>(false);
  public disabled = input<boolean>(false);
  /** Blinking dot on the corner: something needs attention (e.g. unsaved changes). Say what in `label`. */
  public indicator = input<boolean>(false);
  /** Router link: renders an anchor instead of a button. */
  public link = input<string | any[] | null>(null);
}
