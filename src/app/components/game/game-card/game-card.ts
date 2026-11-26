import { Component, computed, inject, input } from '@angular/core';
import { CardObject } from '../../../engine/types';
import { CardImage } from '../../card-image/card-image';
import { CardBack } from '../../card-back/card-back';
import { TranslatePipe } from '../../../i18n/translate-pipe';
import { TranslationKey } from '../../../i18n/en';
import { gameCard } from '../game-cards';
import { GamePreview } from '../game-preview';

type CounterKind = 'advancement' | 'virus' | 'power' | 'agenda' | 'credit';

/** `icon`: a Material Symbols name; `nr`: the game's own icon (class of `.nr-icon`) where there is one. */
const COUNTERS: { kind: CounterKind; icon: string; nr?: string; label: TranslationKey }[] = [
  { kind: 'advancement', icon: 'upgrade', label: 'game.counterAdvancement' },
  { kind: 'credit', icon: 'paid', nr: 'nr-credit', label: 'game.counterCredit' },
  { kind: 'virus', icon: 'bug_report', label: 'game.counterVirus' },
  { kind: 'power', icon: 'bolt', label: 'game.counterPower' },
  { kind: 'agenda', icon: 'flag', nr: 'nr-agenda', label: 'game.counterAgenda' },
];

/**
 * One card of the game board: its face when the viewer may see it, a card back otherwise (the
 * engine's `view` blanks the `cardId` of hidden objects), with the counters on it. A Corp card
 * installed and not rezzed that the viewer knows (their own) shows its face dimmed. The width
 * comes from `--card-w` (set by the parent); the height follows the 2:3 ratio.
 */
@Component({
  selector: 'app-game-card',
  imports: [CardImage, CardBack, TranslatePipe],
  templateUrl: './game-card.html',
  styleUrl: './game-card.scss',
  host: {
    '[class.unrezzed]': 'unrezzed()',
    '[class.selected]': 'selected()',
    '[class.landscape]': 'landscape()',
    '(mouseenter)': 'onEnter()',
    '(mouseleave)': 'onLeave()',
  },
})
export class GameCard {
  /** Set when the card is on a board, which shows the card the pointer is over. */
  protected preview = inject(GamePreview, { optional: true });

  public object = input.required<CardObject>();

  protected onEnter(): void {
    this.preview?.object.set(this.object());
  }

  protected onLeave(): void {
    this.preview?.object.set(null);
  }

  public selected = input<boolean>(false);
  /**
   * Lay the card on its side: ice protecting a server and the facedown cards of Archives are
   * placed horizontally (CR 3.4.2, 4.4.6). The host becomes 3:2 and only the picture turns, so
   * counters and marks stay upright.
   */
  public landscape = input<boolean>(false);

  /** The printing to show, `null` when the card is hidden from this viewer. */
  public card = computed(() => gameCard(this.object().cardId));
  public unrezzed = computed(() => {
    const o = this.object();
    const installed = o.zone.startsWith('ice:') || o.zone.startsWith('root:');
    return o.owner === 'corp' && installed && !o.faceUp && this.card() !== null;
  });
  public counters = computed(() => {
    const c = this.object().counters;
    return COUNTERS.filter((k) => c[k.kind] > 0).map((k) => ({ ...k, amount: c[k.kind] }));
  });
}
