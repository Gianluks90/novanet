import { Component, input } from '@angular/core';
import { TranslatePipe } from '../../i18n/translate-pipe';
import { Violation } from '../../utils/deck-validation';

/** Is the deck legal in the chosen format, and which of the format's rules it breaks (first five). */
@Component({
  selector: 'app-deck-format-status',
  imports: [TranslatePipe],
  templateUrl: './deck-format-status.html',
  styleUrl: './deck-format-status.scss',
})
export class DeckFormatStatus {
  public formatName = input.required<string>();
  public legal = input.required<boolean>();
  public violations = input<Violation[]>([]);
  /** Turns a violation into its (translated) sentence. Pass a stable function, not a method call result. */
  public describe = input.required<(violation: Violation) => string>();

  public readonly maxShown = 5;
}
