import { Component, computed, signal } from '@angular/core';
import { GameBoard } from '../../components/game/game-board/game-board';
import {
  Command,
  LocalSession,
  LocalSessionOptions,
  STARTER_CORP,
  STARTER_RUNNER,
  Side,
  SYSTEM_GATEWAY_CATALOG,
  replay,
  view,
} from '../../engine';

/**
 * Developer page (not linked, not translated) to look at the game board without playing: a game
 * between two bots, replayed up to the command the slider points at. The seed picks another game.
 */
@Component({
  selector: 'app-game-lab-page',
  imports: [GameBoard],
  templateUrl: './game-lab-page.html',
  styleUrl: './game-lab-page.scss',
})
export class GameLabPage {
  public viewer = signal<Side>('runner');
  public seed = signal(7);
  /** How many commands of the game have been played. */
  public step = signal(0);

  private options = computed<LocalSessionOptions>(() => ({
    catalog: SYSTEM_GATEWAY_CATALOG,
    corp: STARTER_CORP,
    runner: STARTER_RUNNER,
    seed: this.seed(),
    bots: ['corp', 'runner'],
  }));

  /** The whole game, played by the bots once per seed. */
  public history = computed<Command[]>(() => [...new LocalSession(this.options()).history]);

  /** The game after `step` commands, as the viewer sees it. */
  public view = computed(() =>
    view(replay(this.options(), this.history().slice(0, this.step())), this.viewer()),
  );

  public setSeed(value: string): void {
    const seed = parseInt(value, 10);
    if (Number.isFinite(seed)) {
      this.seed.set(seed);
      this.step.set(0);
    }
  }

  public setStep(value: string): void {
    this.step.set(parseInt(value, 10) || 0);
  }
}
