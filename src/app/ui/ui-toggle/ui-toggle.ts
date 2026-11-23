import { Component, input, model } from '@angular/core';
import { TranslatePipe } from '../../i18n/translate-pipe';
import { TranslationKey } from '../../i18n/en';

/** On/off switch with a text label. Use `[value]` + `(valueChange)`, or `[(value)]`. */
@Component({
  selector: 'app-ui-toggle',
  imports: [TranslatePipe],
  templateUrl: './ui-toggle.html',
  styleUrl: './ui-toggle.scss',
})
export class UiToggle {
  /** Translation key of the label. */
  public label = input.required<TranslationKey>();
  public value = model<boolean>(false);
  public disabled = input<boolean>(false);

  public toggle() {
    if (!this.disabled()) this.value.set(!this.value());
  }
}
