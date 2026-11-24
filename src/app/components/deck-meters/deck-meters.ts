import { Component, computed, input } from '@angular/core';
import { Card } from '../../models/card';
import { TranslatePipe } from '../../i18n/translate-pipe';
import { agendaRequirement, isLearningIdentity } from '../../utils/deck-rules';

/**
 * The deck's basic validity meters: size, influence and (Corp) agenda points. Presentational:
 * the parent passes the identity and the totals, the limits are derived here.
 */
@Component({
  selector: 'app-deck-meters',
  imports: [TranslatePipe],
  templateUrl: './deck-meters.html',
  styleUrl: './deck-meters.scss',
})
export class DeckMeters {
  public identity = input.required<Card>();
  public totalCards = input.required<number>();
  public totalInfluence = input.required<number>();
  public agendaPoints = input<number>(0);

  public minimumSize = computed(() => this.identity().minimum_deck_size ?? 0);
  public missingCards = computed(() => Math.max(0, this.minimumSize() - this.totalCards()));
  /** The identity's influence limit (`null`: unlimited). */
  public influenceLimit = computed(() => this.identity().influence_limit ?? null);
  public influenceOver = computed(() => {
    const limit = this.influenceLimit();
    return limit === null ? 0 : Math.max(0, this.totalInfluence() - limit);
  });
  /** Learning identities have no agenda point range to meet (see `isLearningIdentity`). */
  public learning = computed(() => isLearningIdentity(this.identity()));
  /** Agenda points the deck needs for its current size. */
  public agendaNeeded = computed(() => agendaRequirement(this.totalCards()));
  public agendaValid = computed(() => {
    if (this.learning()) return true;
    const { min, max } = this.agendaNeeded();
    return this.agendaPoints() >= min && this.agendaPoints() <= max;
  });
}
