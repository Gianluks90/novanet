/**
 * A game session: the one object a UI talks to. `LocalSession` runs the engine in this tab (against
 * the bot or two players on one device). A session over Firestore, or one that calls a Cloud
 * Function, would implement the same interface, so neither the engine nor the UI changes.
 */
import { botCommand } from './bot';
import { DeckList, apply, createGame, legalCommands } from './engine';
import { ApplyResult, Catalog, Command, GameEvent, GameState, Side } from './types';
import { PlayerView, view } from './view';

export interface GameSession {
  /** Full state (only trusted code should read it; UIs use `view`). */
  readonly state: GameState;
  view(side: Side): PlayerView;
  /** Legal commands for the player who has the pending decision. */
  legal(): Command[];
  submit(command: Command): ApplyResult;
  /** Called after every change with the new state and the events it produced. */
  subscribe(listener: (state: GameState, events: GameEvent[]) => void): () => void;
}

export interface LocalSessionOptions {
  catalog: Catalog;
  corp: DeckList;
  runner: DeckList;
  seed?: number;
  /** Sides played by the bot. */
  bots?: Side[];
}

/** Small deterministic generator for the bot (separate from the engine's own). */
function botRandom(seed: number) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class LocalSession implements GameSession {
  private current: GameState;
  private readonly listeners = new Set<(state: GameState, events: GameEvent[]) => void>();
  private readonly rand: () => number;
  /** Every command applied, in order: with the seed it replays the game exactly. */
  readonly history: Command[] = [];
  readonly seed: number;

  constructor(private readonly opts: LocalSessionOptions) {
    this.seed = opts.seed ?? Math.floor(Math.random() * 2 ** 31);
    this.rand = botRandom(this.seed ^ 0x5bd1e995);
    this.current = createGame(opts.catalog, {
      seed: this.seed,
      corp: opts.corp,
      runner: opts.runner,
    });
    this.runBots([]);
  }

  get state(): GameState {
    return this.current;
  }

  view(side: Side): PlayerView {
    return view(this.current, side);
  }

  legal(): Command[] {
    return legalCommands(this.current, this.opts.catalog);
  }

  submit(command: Command): ApplyResult {
    const r = apply(this.current, command, this.opts.catalog);
    if (!r.ok) return r;
    this.current = r.state;
    this.history.push(command);
    const events = [...r.events];
    this.runBots(events);
    for (const l of this.listeners) l(this.current, events);
    return { ok: true, state: this.current, events };
  }

  subscribe(listener: (state: GameState, events: GameEvent[]) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** The bot answers every decision that belongs to one of its sides. */
  private runBots(events: GameEvent[]): void {
    const bots = this.opts.bots ?? [];
    for (let guard = 0; guard < 20_000; guard++) {
      const s = this.current;
      if (s.status === 'ended' || !s.pending || !bots.includes(s.pending.player)) return;
      const cmd = botCommand(s, this.opts.catalog, this.rand);
      if (!cmd) return;
      const r = apply(s, cmd, this.opts.catalog);
      if (!r.ok) throw new Error(`The bot chose an illegal command: ${r.error}`);
      this.current = r.state;
      this.history.push(cmd);
      events.push(...r.events);
    }
    throw new Error('Bot loop did not end');
  }
}

/** Replays a game from its seed and decks: used to resume a saved game or to review it. */
export function replay(opts: LocalSessionOptions, commands: readonly Command[]): GameState {
  let s = createGame(opts.catalog, { seed: opts.seed ?? 1, corp: opts.corp, runner: opts.runner });
  for (const c of commands) {
    const r = apply(s, c, opts.catalog);
    if (!r.ok) throw new Error(`Replay failed: ${r.error}`);
    s = r.state;
  }
  return s;
}
