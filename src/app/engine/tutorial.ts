/**
 * Guided games. A tutorial is a normal game with stacked decks and a script: the steps say what
 * the learner must do (nothing else is allowed), what the other side plays by itself, and where
 * the text of the lesson goes. Because the engine is deterministic a tutorial can be restarted,
 * or resumed at any step, by replaying the script.
 */
import { CommandSpec, findBySpec, matchesSpec } from './command-spec';
import { DeckList } from './engine';
import { GameSession, LocalSession } from './session';
import { ApplyResult, Catalog, Command, GameEvent, GameState, Side } from './types';
import { PlayerView } from './view';

export type TutorialStep =
  | {
      /** Text only: the learner reads it and acknowledges. */
      kind: 'info';
      /** Translation key of the lesson text. */
      text: string;
    }
  | {
      /** The learner has to play exactly one of these commands. */
      kind: 'player';
      text: string;
      spec: CommandSpec | CommandSpec[];
      /** What the UI should draw attention to (a zone, a card id, `credits`, `clicks`…). */
      focus?: string[];
    }
  | {
      /** The script plays for the other side (or for an automatic decision). */
      kind: 'script';
      spec: CommandSpec;
    };

export interface TutorialScript {
  id: string;
  /** The side the learner plays. */
  learner: Side;
  corp: DeckList;
  runner: DeckList;
  steps: TutorialStep[];
}

const specsOf = (step: TutorialStep): CommandSpec[] =>
  step.kind === 'player' ? (Array.isArray(step.spec) ? step.spec : [step.spec]) : [];

export class TutorialSession implements GameSession {
  private inner!: LocalSession;
  private position = 0;
  private readonly listeners = new Set<(state: GameState, events: GameEvent[]) => void>();

  constructor(
    private readonly script: TutorialScript,
    private readonly catalog: Catalog,
  ) {
    this.restart();
  }

  get state(): GameState {
    return this.inner.state;
  }
  get learner(): Side {
    return this.script.learner;
  }
  /** Index of the current step and the number of steps. */
  get index(): number {
    return this.position;
  }
  get total(): number {
    return this.script.steps.length;
  }
  get finished(): boolean {
    return this.position >= this.script.steps.length;
  }
  /** The step to show (null when finished). */
  get step(): TutorialStep | null {
    return this.script.steps[this.position] ?? null;
  }

  view(side: Side): PlayerView {
    return this.inner.view(side);
  }

  /** Only the commands of the current step: everything else is not allowed. */
  legal(): Command[] {
    const step = this.step;
    if (!step || step.kind !== 'player') return [];
    const specs = specsOf(step);
    const s = this.inner.state;
    return this.inner.legal().filter((c) => specs.some((sp) => matchesSpec(s, c, sp)));
  }

  submit(command: Command): ApplyResult {
    const step = this.step;
    if (!step || step.kind !== 'player') return { ok: false, error: 'Nothing to play in this step' };
    const s = this.inner.state;
    if (!specsOf(step).some((sp) => matchesSpec(s, command, sp))) {
      return { ok: false, error: 'This move is not part of the lesson' };
    }
    const events: GameEvent[] = [];
    const r = this.apply(command, events);
    if (!r.ok) return r;
    this.position++;
    this.settle(events);
    this.notify(events);
    return { ok: true, state: this.inner.state, events };
  }

  /** The learner has read an `info` step. */
  acknowledge(): void {
    if (this.step?.kind !== 'info') return;
    this.position++;
    const events: GameEvent[] = [];
    this.settle(events);
    this.notify(events);
  }

  restart(): void {
    this.inner = new LocalSession({
      catalog: this.catalog,
      corp: this.script.corp,
      runner: this.script.runner,
      seed: 1,
      stacked: true,
    });
    this.position = 0;
    const events: GameEvent[] = [];
    this.settle(events);
    this.notify(events);
  }

  /** Restarts and plays the script up to `index` (the learner's moves are made for them). */
  goTo(index: number): void {
    this.restart();
    while (!this.finished && this.position < index) {
      const step = this.step!;
      if (step.kind === 'info') {
        this.acknowledge();
        continue;
      }
      const spec = step.kind === 'script' ? step.spec : specsOf(step)[0];
      const cmd = findBySpec(this.inner.state, this.catalog, spec);
      if (!cmd) throw new Error(`Tutorial ${this.script.id}: step ${this.position} cannot be played`);
      this.apply(cmd, []);
      this.position++;
      this.settle([]);
    }
    this.notify([]);
  }

  subscribe(listener: (state: GameState, events: GameEvent[]) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private apply(command: Command, events: GameEvent[]): ApplyResult {
    const r = this.inner.submit(command);
    if (r.ok) events.push(...r.events);
    return r;
  }

  /** Plays the scripted steps that come next. */
  private settle(events: GameEvent[]): void {
    for (let guard = 0; guard < 1000; guard++) {
      const step = this.step;
      if (!step || step.kind !== 'script') return;
      const cmd = findBySpec(this.inner.state, this.catalog, step.spec);
      if (!cmd) {
        throw new Error(
          `Tutorial ${this.script.id}: scripted step ${this.position} (${JSON.stringify(step.spec)}) is not legal; pending ${JSON.stringify(this.inner.state.pending)}`,
        );
      }
      const r = this.apply(cmd, events);
      if (!r.ok) throw new Error(`Tutorial ${this.script.id}: ${r.error}`);
      this.position++;
    }
    throw new Error('Tutorial script loop did not end');
  }

  private notify(events: GameEvent[]): void {
    for (const l of this.listeners) l(this.inner.state, events);
  }
}
