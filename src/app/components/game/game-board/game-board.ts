import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, input } from '@angular/core';
import { SYSTEM_GATEWAY_CATALOG } from '../../../engine/cards';
import {
  CLICKS,
  agendaPoints,
  agendaPointsToWin,
  memoryLimit,
  memoryUsed,
} from '../../../engine/engine';
import { CardObject, Catalog, GameState, Side, other } from '../../../engine/types';
import { PlayerView } from '../../../engine/view';
import {
  Z,
  deckZone,
  discardZone,
  handZone,
  identityZone,
  scoreZone,
} from '../../../engine/zones';
import { TranslatePipe } from '../../../i18n/translate-pipe';
import { TranslationKey } from '../../../i18n/en';
import { CardBack } from '../../card-back/card-back';
import { UiBadge } from '../../../ui';
import { CardImage } from '../../card-image/card-image';
import { GameCard } from '../game-card/game-card';
import { gameCard } from '../game-cards';
import { GamePreview } from '../game-preview';

/** A pile of cards (deck, discard): how many, and the card on top if it can be shown. */
interface Pile {
  label: TranslationKey;
  count: number;
  top: CardObject | null;
  /** The card on top is laid on its side (a facedown card in Archives, CR 4.4.6b). */
  topSideways: boolean;
  /** Side of the card back drawn for the pile. */
  side: Side;
}

/**
 * A server of the Corp. `head` is what sits at the server itself (the Archives pile, R&D, the
 * identity that marks HQ), `root` the cards installed in its root, `ice` the pieces protecting it
 * (innermost first: the outermost is the last, furthest from the server, CR 3.4.2a).
 */
interface Server {
  id: string;
  name: { key: TranslationKey; args: string[] };
  head: Pile | null;
  identity: CardObject | null;
  root: CardObject[];
  ice: CardObject[];
}

/** The numbers shown in a player's panel. */
interface Panel {
  side: Side;
  credits: number;
  /** One entry per click of the turn: `true` while it is still to spend. */
  clicks: boolean[];
  handCount: number;
  points: number;
  pointsToWin: number;
  tags: number;
  badPublicity: number;
  memoryUsed: number;
  memoryLimit: number;
}

const RUN_PHASE_KEY: Record<string, TranslationKey> = {
  initiation: 'game.runInitiation',
  approach: 'game.runApproach',
  encounter: 'game.runEncounter',
  movement: 'game.runMovement',
  server: 'game.runServer',
  success: 'game.runSuccess',
};

const PHASE_KEY: Record<string, TranslationKey> = {
  draw: 'game.phaseDraw',
  action: 'game.phaseAction',
  discard: 'game.phaseDiscard',
};

/**
 * The game board for one player: the opponent's side on top, the viewer's below, the run and turn
 * strip between them and the viewer's hand under everything. It only draws a `PlayerView` (what
 * that player may see): the rules, and which things can be clicked, stay in the engine.
 */
@Component({
  selector: 'app-game-board',
  imports: [GameCard, CardBack, CardImage, UiBadge, TranslatePipe, NgTemplateOutlet],
  providers: [GamePreview],
  templateUrl: './game-board.html',
  styleUrl: './game-board.scss',
})
export class GameBoard {
  private previewState = inject(GamePreview);

  /** The card under the pointer, if the viewer can see it: shown large in the middle column. */
  public preview = computed(() => gameCard(this.previewState.object()?.cardId ?? ''));

  public view = input.required<PlayerView>();
  public catalog = input<Catalog>(SYSTEM_GATEWAY_CATALOG);

  public viewer = computed(() => this.view().viewer);
  public opponent = computed(() => other(this.viewer()));

  /** The view as a state, for the engine's helpers (it only lacks the random generator state). */
  private state = computed(() => ({ ...this.view(), rngState: 0 }) as unknown as GameState);

  private objectsIn(zone: string): CardObject[] {
    const v = this.view();
    return (v.zones[zone] ?? []).map((id) => v.objects[id]).filter((o) => !!o);
  }

  // ---- the two panels
  public panel(side: Side): Panel {
    const s = this.state();
    const p = s.players[side];
    const total = CLICKS[side];
    const left = s.turn.active === side ? p.clicks : 0;
    const cat = this.catalog();
    return {
      side,
      credits: p.credits,
      clicks: Array.from({ length: total }, (_, i) => i < left),
      handCount: (s.zones[handZone(side)] ?? []).length,
      points: agendaPoints(s, cat, side),
      pointsToWin: agendaPointsToWin(s),
      tags: p.tags,
      badPublicity: p.badPublicity,
      memoryUsed: side === 'runner' ? memoryUsed(s, cat) : 0,
      memoryLimit: side === 'runner' ? memoryLimit(s, cat) : 0,
    };
  }
  /** Clicks still to spend, for the accessible name of the click icons. */
  public clicksLeft = (panel: Panel) => panel.clicks.filter((c) => c).length;

  public panels = computed(() => ({ corp: this.panel('corp'), runner: this.panel('runner') }));

  // ---- the Corp's servers
  public servers = computed<Server[]>(() => {
    const v = this.view();
    const remotes = [
      ...new Set(
        Object.keys(v.zones)
          .map((key) => /^(?:ice|root):(remote\d+)$/.exec(key)?.[1])
          .filter((id): id is string => !!id && (v.zones['ice:' + id]?.length || v.zones['root:' + id]?.length) > 0),
      ),
    ].sort((a, b) => parseInt(a.slice(6), 10) - parseInt(b.slice(6), 10));
    const base = (id: string, key: TranslationKey, args: string[] = []) => ({
      id,
      name: { key, args },
      root: this.objectsIn('root:' + id),
      // the zone lists the outermost piece first: turned over, the innermost comes first
      ice: this.objectsIn('ice:' + id).reverse(),
    });
    const archives = this.objectsIn(Z.archives);
    const lastArchived = archives.at(-1) ?? null;
    return [
      {
        ...base('archives', 'game.archives'),
        identity: null,
        head: {
          label: 'game.archives',
          count: archives.length,
          top: lastArchived,
          topSideways: !!lastArchived && !lastArchived.faceUp,
          side: 'corp',
        },
      },
      {
        ...base('rd', 'game.rd'),
        identity: null,
        head: { label: 'game.rd', count: this.objectsIn(Z.rd).length, top: null, topSideways: false, side: 'corp' },
      },
      // HQ: the identity marks where it is; the Corp's hand is HQ
      { ...base('hq', 'game.hq'), identity: this.identity('corp'), head: null },
      ...remotes.map((id) => ({
        ...base(id, 'game.remote', [id.slice(6)]),
        identity: null,
        head: null,
      })),
    ];
  });

  public identity(side: Side): CardObject | null {
    return this.objectsIn(identityZone(side))[0] ?? null;
  }

  // ---- the Runner's side
  public rig = computed(() => {
    const cat = this.catalog();
    const rig = this.objectsIn(Z.rig);
    const of = (type: string) => rig.filter((o) => cat[o.cardId]?.type === type);
    return [
      { label: 'game.programs' as TranslationKey, cards: of('program') },
      { label: 'game.hardware' as TranslationKey, cards: of('hardware') },
      { label: 'game.resources' as TranslationKey, cards: of('resource') },
    ];
  });
  public runnerPiles = computed<Pile[]>(() => {
    const heap = this.objectsIn(discardZone('runner'));
    return [
      { label: 'game.stack', count: this.objectsIn(deckZone('runner')).length, top: null, topSideways: false, side: 'runner' },
      { label: 'game.heap', count: heap.length, top: heap.at(-1) ?? null, topSideways: false, side: 'runner' },
    ];
  });
  public runnerIdentity = computed(() => this.identity('runner'));

  /** How many cards of a side's hand to draw as backs (the opponent's hand is only a fan). */
  public handBacks = (side: Side) => Array.from({ length: Math.min(this.panels()[side].handCount, 10) });

  /** Agendas scored (Corp) or stolen (Runner) by a side. */
  public scored = (side: Side) => this.objectsIn(scoreZone(side));

  /** The viewer's hand, face up. The opponent's is only a count in their panel. */
  public hand = computed(() => this.objectsIn(handZone(this.viewer())));

  // ---- the strip between the two sides
  public turnLabel = computed(() => {
    const v = this.view();
    return v.status === 'ended'
      ? ({ key: 'game.ended', args: [] } as { key: TranslationKey; args: string[] })
      : v.status === 'mulligan'
        ? { key: 'game.mulligan' as TranslationKey, args: [] }
        : { key: 'game.turn' as TranslationKey, args: [String(v.turn.number)] };
  });
  public phaseKey = computed<TranslationKey | null>(() => {
    const v = this.view();
    return v.status === 'playing' ? PHASE_KEY[v.turn.phase] : null;
  });
  public run = computed(() => {
    const v = this.view();
    if (!v.run) return null;
    const iceCount = (v.zones['ice:' + v.run.server] ?? []).length;
    const serverName = this.servers().find((s) => s.id === v.run!.server)?.name ?? {
      key: 'game.runOn' as TranslationKey,
      args: [],
    };
    const position = Math.min(v.run.position, iceCount);
    return {
      server: serverName,
      phase: RUN_PHASE_KEY[v.run.phase] ?? 'game.runMovement',
      args: [String(Math.min(position + 1, iceCount)), String(iceCount)],
      // the way in: every piece of ice from the outermost, then the server; where the Runner is
      lane: Array.from({ length: iceCount + 1 }, (_, i) => ({
        server: i === iceCount,
        state: i < position ? 'passed' : i === position ? 'current' : 'ahead',
      })),
    };
  });
}
