/**
 * System Gateway card definitions (hand-written, keyed by `card_id`). Cards are added as the
 * engine learns the mechanics they need; the list of what is covered is in docs/engine-spec.md.
 */
import {
  BreakAbility,
  ChoiceOption,
  EffectContext,
  Instruction,
  Subroutine,
  Trigger,
  TriggerInfo,
  defineCard,
  netDamage,
} from '../definitions';
import { installedCorpCards, runnerInstallCost } from '../engine';
import { Catalog, GameState, ObjectId } from '../types';
import { Z, isCentral, obj, serverOfZone, servers } from '../zones';

// ---- Helpers --------------------------------------------------------------------------------

const opts = (ids: ObjectId[]): ChoiceOption[] => ids.map((value) => ({ value }));
const yesNo: ChoiceOption[] = [{ value: 'yes' }, { value: 'no' }];

const gainCredits =
  (n: number): Instruction =>
  (c) =>
    c.gainCredits(c.player, n);

const drawCards =
  (n: number): Instruction =>
  (c) =>
    c.draw(c.player, n);

/** "If you have any [click] remaining, lose [click]." */
const loseClickIfAny: Instruction = (c) => {
  if (c.state.players[c.player].clicks > 0) c.loseClicks(c.player, 1);
};

const isTagged = (c: EffectContext) => c.state.players.runner.tags >= 1;

const runnerCards = (c: EffectContext, types: string[]) =>
  c.zone(Z.rig).filter((id) => types.includes(c.cardOf(id).type));

// ---- Runner events --------------------------------------------------------------------------

defineCard('sure_gamble', { onPlay: [gainCredits(9)] });

defineCard('creative_commission', { onPlay: [gainCredits(5), loseClickIfAny] });

defineCard('vrcation', { onPlay: [drawCards(4), loseClickIfAny] });

defineCard('wildcat_strike', {
  // The Corp chooses which one the Runner gets.
  onPlay: [
    (c) => {
      const m = c.choose('mode', 'corp', [{ value: 'credits' }, { value: 'cards' }]);
      if (m === undefined) return;
      if (m === 'credits') c.gainCredits('runner', 6);
      else c.draw('runner', 4);
    },
  ],
});

defineCard('mutual_favor', {
  onPlay: [
    (c) => {
      const icebreakers = c
        .zone(Z.stack)
        .filter((id) => c.cardOf(id).subtypes.includes('icebreaker'));
      const pick = c.choose('pick', 'runner', [...opts(icebreakers), { value: 'none' }]);
      if (pick === undefined) return;
      let how: number | string | null | undefined = 'add';
      if (typeof pick === 'number') {
        const canInstall =
          c.state.turnStats.successfulRun &&
          runnerInstallCost(c.state, c.cat, pick) <= c.state.players.runner.credits;
        if (canInstall) {
          how = c.choose('how', 'runner', [{ value: 'install' }, { value: 'add' }]);
          if (how === undefined) return;
        }
        if (how === 'install') c.installRunner(pick);
        else c.addToHand(pick);
      }
      c.shuffleDeck('runner');
    },
  ],
});

// ---- Corp operations ------------------------------------------------------------------------

defineCard('hedge_fund', { onPlay: [gainCredits(9)] });

defineCard('government_subsidy', { onPlay: [gainCredits(15)] });

defineCard('hansei_review', {
  onPlay: [
    gainCredits(10),
    (c) => {
      const target = c.choose('target', 'corp', opts(c.zone(Z.hq)));
      if (target === undefined) return;
      if (typeof target === 'number') c.trash(target);
    },
  ],
});

defineCard('sprint', {
  onPlay: [
    drawCards(3),
    (c) => {
      const hq = c.zone(Z.hq);
      const a = c.choose('a', 'corp', opts(hq));
      if (a === undefined) return;
      const b = c.choose('b', 'corp', opts(hq.filter((id) => id !== a)));
      if (b === undefined) return;
      for (const id of [a, b]) if (typeof id === 'number') c.moveToDeck(id);
      c.shuffleDeck('corp');
    },
  ],
});

defineCard('predictive_planogram', {
  onPlay: [
    (c) => {
      const options: ChoiceOption[] = [{ value: 'credits' }, { value: 'cards' }];
      if (isTagged(c)) options.push({ value: 'both' });
      const m = c.choose('mode', 'corp', options);
      if (m === undefined) return;
      if (m === 'credits' || m === 'both') c.gainCredits('corp', 3);
      if (m === 'cards' || m === 'both') c.draw('corp', 3);
    },
  ],
});

defineCard('public_trail', {
  canPlay: (s) => s.prevTurnStats.successfulRun,
  onPlay: [
    (c) => {
      const options: ChoiceOption[] = [{ value: 'tag' }];
      if (c.state.players.runner.credits >= 8) options.unshift({ value: 'pay' });
      const m = c.choose('mode', 'runner', options);
      if (m === undefined) return;
      if (m === 'pay') c.loseCredits('runner', 8);
      else c.giveTag(1);
    },
  ],
});

defineCard('retribution', {
  canPlay: (s) => s.players.runner.tags >= 1,
  onPlay: [
    (c) => {
      const target = c.choose('target', 'corp', opts(runnerCards(c, ['program', 'hardware'])));
      if (target === undefined) return;
      if (typeof target === 'number') c.trash(target);
    },
  ],
});

defineCard('neurospike', {
  onPlay: [(c) => void c.damage('net', c.state.turnStats.scoredPoints)],
});

/** Installed Corp cards that were not installed this turn. */
const olderInstalled = (c: { state: EffectContext['state'] }) =>
  installedCorpCards(c.state).filter((id) => !c.state.turnStats.installed.includes(id));

defineCard('seamless_launch', {
  canPlay: (s) => olderInstalled({ state: s }).length > 0,
  onPlay: [
    (c) => {
      const target = c.choose('target', 'corp', opts(olderInstalled(c)));
      if (target === undefined) return;
      if (typeof target === 'number') c.addAdvancement(target, 2);
    },
  ],
});

// ---- Agendas --------------------------------------------------------------------------------

defineCard('offworld_office', { onScore: [gainCredits(7)] });

const giveTag: Instruction = (c) => c.giveTag(1);
defineCard('tomorrows_headline', { onScore: [giveTag], onSteal: [giveTag] });

defineCard('luminal_transubstantiation', {
  onScore: [
    (c) => {
      c.gainClicks('corp', 3);
      c.state.turnStats.cannotScore = true;
    },
  ],
});

defineCard('superconducting_hub', {
  static: { handSize: 2 },
  onScore: [
    (c) => {
      const m = c.choose('draw', 'corp', yesNo);
      if (m === undefined) return;
      if (m === 'yes') c.draw('corp', 2);
    },
  ],
});

defineCard('above_the_law', {
  onScore: [
    (c) => {
      const target = c.choose('target', 'corp', [
        ...opts(runnerCards(c, ['resource'])),
        { value: 'none' },
      ]);
      if (target === undefined) return;
      if (typeof target === 'number') c.trash(target);
    },
  ],
});

defineCard('orbital_superiority', {
  onScore: [
    (c) => {
      if (isTagged(c)) c.damage('meat', 4);
      else c.giveTag(1);
    },
  ],
});

const rezIceFree: Instruction = (c) => {
  const unrezzed = installedCorpCards(c.state).filter(
    (id) => c.cardOf(id).type === 'ice' && !obj(c.state, id).faceUp,
  );
  const target = c.choose('target', 'corp', [...opts(unrezzed), { value: 'none' }]);
  if (target === undefined) return;
  if (typeof target === 'number') c.rez(target, { ignoreCost: true });
};
defineCard('send_a_message', { onScore: [rezIceFree], onSteal: [rezIceFree] });

// ---- Identities and hardware (static abilities) ---------------------------------------------

defineCard('haas_bioroid_precision_design', {
  static: { handSize: 1 },
  triggers: [
    {
      on: 'score',
      steps: [
        (c) => {
          const pick = c.choose('pick', 'corp', [...opts(c.zone(Z.archives)), { value: 'none' }]);
          if (pick === undefined) return;
          if (typeof pick === 'number') c.addToHand(pick);
        },
      ],
    },
  ],
});
defineCard('t400_memory_diamond', { static: { memory: 1, handSize: 1 } });

// ---- Ice ------------------------------------------------------------------------------------

const gainCorp = (n: number): Subroutine => ({
  text: `Gain ${n}[credit].`,
  steps: [(c) => c.gainCredits('corp', n)],
});

defineCard('tithe', { subroutines: [netDamage(1), gainCorp(1)] });

defineCard('whitespace', {
  subroutines: [
    { text: 'The Runner loses 3[credit].', steps: [(c) => void c.loseCredits('runner', 3)] },
    {
      text: 'If the Runner has 6[credit] or less, end the run.',
      steps: [
        (c) => {
          if (c.state.players.runner.credits <= 6) c.endTheRun();
        },
      ],
    },
  ],
});

defineCard('karuna', {
  subroutines: [
    {
      text: 'Do 2 net damage. The Runner may jack out.',
      steps: [
        (c) => void c.damage('net', 2),
        (c) => {
          const m = c.choose('jack', 'runner', yesNo);
          if (m === undefined) return;
          if (m === 'yes') c.jackOut();
        },
      ],
    },
    netDamage(2),
  ],
});

defineCard('ballista', {
  subroutines: [
    {
      text: 'Trash 1 installed program or end the run.',
      steps: [
        (c) => {
          const programs = runnerCards(c, ['program']);
          const options: ChoiceOption[] = [{ value: 'end' }];
          if (programs.length > 0) options.unshift({ value: 'trash' });
          const m = c.choose('mode', 'corp', options);
          if (m === undefined) return;
          if (m === 'end') return c.endTheRun();
          const target = c.choose('target', 'corp', opts(programs));
          if (target === undefined) return;
          if (typeof target === 'number') c.trash(target);
        },
      ],
    },
  ],
});

defineCard('diviner', {
  subroutines: [
    {
      text: 'Do 1 net damage. If you trash a card this way with a printed play or install cost that is an odd number, end the run.',
      steps: [
        (c) => {
          const trashed = c.damage('net', 1);
          const odd = trashed.some((id) => {
            const cost = c.cat[id]?.cost;
            return cost !== undefined && cost % 2 === 1;
          });
          if (odd) c.endTheRun();
        },
      ],
    },
  ],
});

// ---- Icebreakers ----------------------------------------------------------------------------

defineCard('cleaver', {
  abilities: [
    { kind: 'break', breaks: 'barrier', subs: 2, cost: 1 },
    { kind: 'boost', cost: 2, amount: 1, until: 'encounter' },
  ],
});

defineCard('buzzsaw', {
  abilities: [
    { kind: 'break', breaks: 'code_gate', subs: 2, cost: 1 },
    { kind: 'boost', cost: 3, amount: 1, until: 'encounter' },
  ],
});

defineCard('marjanah', {
  abilities: [
    { kind: 'break', breaks: 'barrier', subs: 1, cost: (s) => (s.turnStats.successfulRun ? 1 : 2) },
    { kind: 'boost', cost: 1, amount: 1, until: 'encounter' },
  ],
});

defineCard('carmen', {
  installCostMod: (s) => (s.turnStats.successfulRun ? -2 : 0),
  abilities: [
    { kind: 'break', breaks: 'sentry', subs: 1, cost: 1 },
    { kind: 'boost', cost: 2, amount: 3, until: 'encounter' },
  ],
});

// ==== Phase 4: triggers, paid abilities, hosting, run events ====================================

/** Pick up to `max` cards one at a time (each pick may be answered `done`). */
function pickUpTo(
  c: EffectContext,
  base: string,
  who: 'corp' | 'runner',
  pool: ObjectId[],
  max: number,
): ObjectId[] | undefined {
  const picked: ObjectId[] = [];
  for (let i = 0; i < max; i++) {
    const remaining = pool.filter((id) => !picked.includes(id));
    if (remaining.length === 0) break;
    const v = c.choose(`${base}${i}`, who, [...opts(remaining), { value: 'done' }]);
    if (v === undefined) return undefined;
    if (typeof v !== 'number') break;
    picked.push(v);
  }
  return picked;
}

const selfInstalled = ({ ev, self }: TriggerInfo) => ev.type === 'install' && ev.objectId === self;
const selfRezzed = ({ ev, self }: TriggerInfo) => ev.type === 'rez' && ev.objectId === self;
const runnerTurnBegins = ({ ev }: TriggerInfo) =>
  ev.type === 'turnBegins' && ev.player === 'runner';
const corpTurnBegins = ({ ev }: TriggerInfo) => ev.type === 'turnBegins' && ev.player === 'corp';
const scoredOrStolen = ['score', 'steal'];

const placeVirus: Instruction = (c) => c.addCounter(c.source, 'virus', 1);
const virusOnInstallAndTurn: Trigger[] = [
  { on: 'install', when: selfInstalled, steps: [placeVirus] },
  { on: 'turnBegins', when: runnerTurnBegins, steps: [placeVirus] },
];

const anyServer = (c: EffectContext) => servers(c.state).map((value) => ({ value }));

const icebreakersInstalled = (s: GameState, cat: Catalog) =>
  (s.zones[Z.rig] ?? []).filter((id) =>
    (cat[obj(s, id).cardId]?.subtypes ?? []).includes('icebreaker'),
  ).length;

const endRunSub: Subroutine = { text: 'End the run.', steps: [(c) => c.endTheRun()] };

// ---- Runner identities ----------------------------------------------------------------------

defineCard('rene_loup_arcemont_party_animal', {
  triggers: [
    {
      on: 'trash',
      when: ({ ev }) => ev.detail === 'accessed' && ev.player === 'runner',
      oncePerTurn: true,
      steps: [(c) => c.gainCredits('runner', 1), (c) => c.draw('runner', 1)],
    },
  ],
});

defineCard('zahya_sadeghi_versatile_smuggler', {
  triggers: [
    {
      on: ['runEnds', 'runUnsuccessful'],
      when: ({ ev }) =>
        (ev.server === 'hq' || ev.server === 'rd') && Number(ev.data?.['accesses'] ?? 0) > 0,
      oncePerTurn: true,
      steps: [(c) => c.gainCredits('runner', Number(c.event?.data?.['accesses'] ?? 0))],
    },
  ],
});

defineCard('tao_salonga_telepresence_magician', {
  triggers: [
    {
      on: scoredOrStolen,
      steps: [
        (c) => {
          const ice = Object.keys(c.state.zones)
            .filter((k) => k.startsWith('ice:'))
            .flatMap((k) => c.zone(k));
          if (ice.length < 2) return;
          const a = c.choose('a', 'runner', [...opts(ice), { value: 'none' }]);
          if (a === undefined || typeof a !== 'number') return;
          const b = c.choose('b', 'runner', opts(ice.filter((id) => id !== a)));
          if (b === undefined) return;
          if (typeof b === 'number') c.swapIce(a, b);
        },
      ],
    },
  ],
});

// ---- Runner hardware ------------------------------------------------------------------------

defineCard('carnivore', {
  static: { memory: 1 },
  paid: [
    {
      name: 'Trash 2 cards from your grip: trash the accessed card',
      cost: {},
      during: 'access',
      oncePerTurn: true,
      canUse: (s) => (s.zones[Z.grip]?.length ?? 0) >= 2,
      steps: [
        (c) => {
          const grip = c.zone(Z.grip);
          const a = c.choose('a', 'runner', opts(grip));
          if (a === undefined) return;
          const b = c.choose('b', 'runner', opts(grip.filter((id) => id !== a)));
          if (b === undefined) return;
          for (const id of [a, b]) if (typeof id === 'number') c.trash(id);
          c.trashAccessed();
        },
      ],
    },
  ],
});

defineCard('docklands_pass', { breachBonus: (_s, server) => (server === 'hq' ? 1 : 0) });

defineCard('pennyshaver', {
  static: { memory: 1 },
  triggers: [{ on: 'runSuccessful', steps: [(c) => c.addCounter(c.source, 'credit', 1)] }],
  paid: [
    {
      name: 'Place 1 credit, then take all credits',
      cost: { clicks: 1 },
      steps: [
        (c) => {
          c.addCounter(c.source, 'credit', 1);
          c.takeCredits(c.source, c.counter(c.source, 'credit'));
        },
      ],
    },
  ],
});

defineCard('dzmz_optimizer', {
  static: { memory: 1 },
  installDiscount: (s, cat, target) =>
    cat[obj(s, target).cardId]?.type === 'program' &&
    !s.turnStats.installed.some(
      (id) => id in s.objects && cat[obj(s, id).cardId]?.type === 'program',
    )
      ? 1
      : 0,
});

defineCard('pantograph', {
  static: { memory: 1 },
  triggers: [
    {
      on: scoredOrStolen,
      steps: [
        (c) => c.gainCredits('runner', 1),
        (c) => {
          const options = c
            .zone(Z.grip)
            .filter((id) => ['program', 'hardware', 'resource'].includes(c.cardOf(id).type))
            .filter(
              (id) => runnerInstallCost(c.state, c.cat, id) <= c.state.players.runner.credits,
            );
          const pick = c.choose('install', 'runner', [...opts(options), { value: 'none' }]);
          if (pick === undefined) return;
          if (typeof pick === 'number') c.installRunner(pick);
        },
      ],
    },
  ],
});

// ---- Runner programs ------------------------------------------------------------------------

const derezHostAtThree: Instruction = (c) => {
  const host = obj(c.state, c.source).host;
  if (host !== undefined && host in c.state.objects && c.counter(c.source, 'virus') >= 3) {
    c.derez(host);
  }
};

defineCard('botulus', {
  installOnIce: true,
  triggers: virusOnInstallAndTurn,
  abilities: [
    {
      kind: 'break',
      breaks: 'any',
      subs: 1,
      cost: 0,
      hostedCounter: 'virus',
      ignoreStrength: true,
      scope: 'host',
    },
  ],
});

defineCard('tranquilizer', {
  installOnIce: true,
  triggers: [
    { on: 'install', when: selfInstalled, steps: [placeVirus, derezHostAtThree] },
    { on: 'turnBegins', when: runnerTurnBegins, steps: [placeVirus, derezHostAtThree] },
  ],
});

defineCard('fermenter', {
  triggers: virusOnInstallAndTurn,
  paid: [
    {
      name: 'Gain 2 credits per hosted virus counter',
      cost: { clicks: 1, trashSelf: true },
      steps: [(c) => c.gainCredits('runner', 2 * c.sourceCounter('virus'))],
    },
  ],
});

defineCard('leech', {
  triggers: [
    {
      on: 'runSuccessful',
      when: ({ ev }) => isCentral(ev.server ?? ''),
      steps: [placeVirus],
    },
  ],
  paid: [
    {
      name: 'The ice you are encountering gets -1 strength',
      cost: { hosted: { counter: 'virus', n: 1 } },
      during: 'encounter',
      steps: [
        (c) => {
          const ice = c.state.run?.encounter?.ice;
          if (ice !== undefined && ice in c.state.objects) {
            obj(c.state, ice).strengthMods.push({ amount: -1, until: 'encounter' });
          }
        },
      ],
    },
  ],
});

defineCard('cookbook', {
  triggers: [
    {
      on: 'install',
      when: ({ ev, self, cat }) =>
        ev.player === 'runner' &&
        ev.objectId !== self &&
        ev.detail === 'program' &&
        (cat[ev.cardId ?? '']?.subtypes ?? []).includes('virus'),
      steps: [
        (c) => {
          const m = c.choose('place', 'runner', yesNo);
          if (m === undefined) return;
          const id = c.event?.objectId;
          if (m === 'yes' && id !== undefined && id in c.state.objects) {
            c.addCounter(id, 'virus', 1);
          }
        },
      ],
    },
  ],
});

defineCard('conduit', {
  triggers: [
    {
      on: 'runEnds',
      when: ({ ev }) => ev.server === 'rd',
      steps: [
        (c) => {
          const m = c.choose('place', 'runner', yesNo);
          if (m === undefined) return;
          if (m === 'yes') c.addCounter(c.source, 'virus', 1);
        },
      ],
    },
  ],
  paid: [
    {
      name: 'Run R&D',
      cost: { clicks: 1 },
      steps: [(c) => c.startRun('rd', { hook: 'conduit' })],
    },
  ],
  runHooks: {
    conduit: {
      onSuccess: [
        (c) => {
          if (c.source in c.state.objects) {
            c.state.players.runner.extraAccess += c.counter(c.source, 'virus');
          }
        },
      ],
    },
  },
});

defineCard('echelon', {
  strengthBonus: (s, cat) => icebreakersInstalled(s, cat),
  abilities: [
    { kind: 'break', breaks: 'sentry', subs: 1, cost: 1 },
    { kind: 'boost', cost: 3, amount: 2, until: 'encounter' },
  ],
});

defineCard('unity', {
  abilities: [
    { kind: 'break', breaks: 'code_gate', subs: 1, cost: 1 },
    {
      kind: 'boost',
      cost: 1,
      amount: (s, cat) => icebreakersInstalled(s, cat),
      until: 'encounter',
    },
  ],
});

defineCard('mayfly', {
  abilities: [
    { kind: 'break', breaks: 'any', subs: 1, cost: 1, trashAtRunEnd: true },
    { kind: 'boost', cost: 1, amount: 1, until: 'encounter' },
  ],
});

// ---- Runner resources -----------------------------------------------------------------------

defineCard('telework_contract', {
  loadable: true,
  triggers: [{ on: 'install', when: selfInstalled, steps: [(c) => c.load(c.source, 9)] }],
  paid: [
    {
      name: 'Take 3 credits from this resource',
      cost: { clicks: 1 },
      oncePerTurn: true,
      steps: [(c) => void c.takeCredits(c.source, 3)],
    },
  ],
});

defineCard('smartware_distributor', {
  triggers: [
    {
      on: 'turnBegins',
      when: runnerTurnBegins,
      steps: [(c) => void c.takeCredits(c.source, 1)],
    },
  ],
  paid: [
    {
      name: 'Place 3 credits on this resource',
      cost: { clicks: 1 },
      steps: [(c) => c.addCounter(c.source, 'credit', 3)],
    },
  ],
});

defineCard('verbal_plasticity', { basicDrawBonus: 1 });

const CENTRAL_SERVERS = ['hq', 'rd', 'archives'];

defineCard('red_team', {
  loadable: true,
  triggers: [{ on: 'install', when: selfInstalled, steps: [(c) => c.load(c.source, 12)] }],
  paid: [
    {
      name: 'Run a central server you have not run this turn',
      cost: { clicks: 1 },
      canUse: (s) => CENTRAL_SERVERS.some((x) => !s.turnStats.serversRun.includes(x)),
      steps: [
        (c) => {
          const options = CENTRAL_SERVERS.filter(
            (x) => !c.state.turnStats.serversRun.includes(x),
          ).map((value) => ({ value }));
          const server = c.choose('server', 'runner', options);
          if (server === undefined) return;
          if (typeof server === 'string') c.startRun(server, { hook: 'red_team' });
        },
      ],
    },
  ],
  runHooks: { red_team: { onSuccess: [(c) => void c.takeCredits(c.source, 3)] } },
});

// ---- Run events -----------------------------------------------------------------------------

defineCard('tread_lightly', {
  onPlay: [
    (c) => {
      const server = c.choose('server', 'runner', anyServer(c));
      if (server === undefined) return;
      if (typeof server === 'string') c.startRun(server, { iceRezMod: 3 });
    },
  ],
});

defineCard('jailbreak', {
  onPlay: [
    (c) => {
      const server = c.choose('server', 'runner', [{ value: 'hq' }, { value: 'rd' }]);
      if (server === undefined) return;
      if (typeof server === 'string') c.startRun(server, { hook: 'jailbreak' });
    },
  ],
  runHooks: {
    jailbreak: {
      onSuccess: [
        (c) => {
          c.draw('runner', 1);
          c.state.players.runner.extraAccess += 1;
        },
      ],
    },
  },
});

defineCard('overclock', {
  onPlay: [
    (c) => {
      const server = c.choose('server', 'runner', anyServer(c));
      if (server === undefined) return;
      // The 5 credits placed on the event can be spent during the run only.
      if (typeof server === 'string') c.startRun(server, { fund: 5 });
    },
  ],
});

// ---- Corp assets and upgrades ---------------------------------------------------------------

defineCard('nico_campaign', {
  loadable: true,
  emptySteps: [
    (c) => {
      c.trash(c.source);
      c.draw('corp', 1);
    },
  ],
  triggers: [
    { on: 'rez', when: selfRezzed, steps: [(c) => c.load(c.source, 9)] },
    { on: 'turnBegins', when: corpTurnBegins, steps: [(c) => void c.takeCredits(c.source, 3)] },
  ],
});

defineCard('regolith_mining_license', {
  loadable: true,
  triggers: [{ on: 'rez', when: selfRezzed, steps: [(c) => c.load(c.source, 15)] }],
  paid: [
    {
      name: 'Take 3 credits from this asset',
      cost: { clicks: 1 },
      steps: [(c) => void c.takeCredits(c.source, 3)],
    },
  ],
});

defineCard('spin_doctor', {
  triggers: [{ on: 'rez', when: selfRezzed, steps: [(c) => c.draw('corp', 2)] }],
  paid: [
    {
      name: 'Remove this asset from the game: shuffle up to 2 cards from Archives into R&D',
      cost: { removeFromGame: true },
      steps: [
        (c) => {
          const picks = pickUpTo(c, 'p', 'corp', c.zone(Z.archives), 2);
          if (!picks) return;
          for (const id of picks) c.moveToDeck(id);
          c.shuffleDeck('corp');
        },
      ],
    },
  ],
});

defineCard('clearinghouse', {
  triggers: [
    {
      on: 'turnBegins',
      when: corpTurnBegins,
      steps: [
        (c) => {
          const m = c.choose('use', 'corp', yesNo);
          if (m !== 'yes') return;
          const n = c.counter(c.source, 'advancement');
          c.trash(c.source);
          c.damage('meat', n);
        },
      ],
    },
  ],
});

defineCard('urtica_cipher', {
  triggers: [
    {
      on: 'access',
      whileUnrezzed: true,
      when: ({ ev, self }) => ev.objectId === self,
      steps: [(c) => void c.damage('net', 2 + c.counter(c.source, 'advancement'))],
    },
  ],
});

defineCard('manegarm_skunkworks', {
  triggers: [
    {
      on: 'approachServer',
      when: ({ ev, server }) => ev.server === server,
      steps: [
        (c) => {
          const runner = c.state.players.runner;
          const options: ChoiceOption[] = [];
          if (runner.clicks >= 2) options.push({ value: 'clicks' });
          if (runner.credits >= 5) options.push({ value: 'credits' });
          const m = c.choose('pay', 'runner', options);
          if (m === undefined) return;
          if (m === 'clicks') c.loseClicks('runner', 2);
          else if (m === 'credits') c.loseCredits('runner', 5);
          else c.endTheRun();
        },
      ],
    },
  ],
});

defineCard('anoetic_void', {
  triggers: [
    {
      on: 'approachServer',
      when: ({ ev, server }) => ev.server === server,
      steps: [
        (c) => {
          const hq = c.zone(Z.hq);
          if (c.state.players.corp.credits < 2 || hq.length < 2) return;
          const m = c.choose('use', 'corp', yesNo);
          if (m !== 'yes') return;
          const a = c.choose('a', 'corp', opts(hq));
          if (a === undefined) return;
          const b = c.choose('b', 'corp', opts(hq.filter((id) => id !== a)));
          if (b === undefined) return;
          c.loseCredits('corp', 2);
          for (const id of [a, b]) if (typeof id === 'number') c.trash(id);
          c.endTheRun();
        },
      ],
    },
  ],
});

defineCard('amaze_amusements', {
  triggers: [
    {
      on: ['runEnds', 'runUnsuccessful'],
      persistent: true,
      when: ({ ev, server }) => ev.server === server && Number(ev.data?.['stolen'] ?? 0) > 0,
      steps: [(c) => c.giveTag(2)],
    },
  ],
});

defineCard('malapert_data_vault', {
  triggers: [
    {
      on: 'score',
      when: ({ ev, server }) => ev.server === server,
      steps: [
        (c) => {
          const pool = c.zone(Z.rd).filter((id) => c.cardOf(id).type !== 'agenda');
          const pick = c.choose('pick', 'corp', [...opts(pool), { value: 'none' }]);
          if (pick === undefined) return;
          if (typeof pick === 'number') c.addToHand(pick);
          c.shuffleDeck('corp');
        },
      ],
    },
  ],
});

// ---- Corp ice -------------------------------------------------------------------------------

defineCard('ping', {
  triggers: [
    {
      on: 'rez',
      when: ({ ev, self, s, server }) =>
        ev.objectId === self && !!s.run && s.run.server === server,
      steps: [(c) => c.giveTag(1)],
    },
  ],
  subroutines: [endRunSub],
});

defineCard('palisade', {
  strengthBonus: (s, _cat, self) => {
    const server = serverOfZone(obj(s, self).zone);
    return server !== null && !isCentral(server) ? 2 : 0;
  },
  subroutines: [endRunSub],
});

defineCard('pharos', {
  strengthBonus: (s, _cat, self) => (obj(s, self).counters.advancement >= 3 ? 5 : 0),
  subroutines: [
    { text: 'Give the Runner 1 tag.', steps: [(c) => c.giveTag(1)] },
    endRunSub,
    endRunSub,
  ],
});

defineCard('funhouse', {
  triggers: [
    {
      on: 'encounter',
      when: ({ ev, self }) => ev.objectId === self,
      steps: [
        (c) => {
          const m = c.choose('mode', 'runner', [{ value: 'tag' }, { value: 'end' }]);
          if (m === undefined) return;
          if (m === 'tag') c.giveTag(1);
          else c.endTheRun();
        },
      ],
    },
  ],
  subroutines: [
    {
      text: 'Give the Runner 1 tag unless they pay 4[credit].',
      steps: [
        (c) => {
          const options: ChoiceOption[] = [{ value: 'tag' }];
          if (c.state.players.runner.credits >= 4) options.unshift({ value: 'pay' });
          const m = c.choose('mode', 'runner', options);
          if (m === undefined) return;
          if (m === 'pay') c.loseCredits('runner', 4);
          else c.giveTag(1);
        },
      ],
    },
  ],
});

const bioroidBreak: BreakAbility = {
  kind: 'break',
  breaks: 'any',
  subs: 1,
  cost: 0,
  clicks: 1,
  ignoreStrength: true,
  scope: 'self',
};

defineCard('ansel_1_0', {
  abilities: [bioroidBreak],
  subroutines: [
    {
      text: 'Trash 1 installed Runner card.',
      steps: [
        (c) => {
          const target = c.choose('target', 'corp', opts(c.zone(Z.rig)));
          if (target === undefined) return;
          if (typeof target === 'number') c.trash(target);
        },
      ],
    },
    {
      text: 'You may install 1 card from HQ or Archives.',
      steps: [
        (c) => {
          const credits = c.state.players.corp.credits;
          const pool = [...c.zone(Z.hq), ...c.zone(Z.archives)].filter((id) =>
            ['agenda', 'asset', 'upgrade', 'ice'].includes(c.cardOf(id).type),
          );
          const card = c.choose('card', 'corp', [...opts(pool), { value: 'none' }]);
          if (card === undefined || typeof card !== 'number') return;
          const type = c.cardOf(card).type;
          const places = servers(c.state).filter((sv) => {
            if (type === 'agenda' || type === 'asset') return !isCentral(sv);
            if (type === 'ice') return c.zone(Z.ice(sv)).length <= credits;
            return true;
          });
          const where = c.choose('where', 'corp', [
            ...places.map((value) => ({ value })),
            { value: 'new' },
          ]);
          if (where === undefined) return;
          if (typeof where === 'string') c.installCorp(card, where);
        },
      ],
    },
    {
      text: 'The Runner cannot steal or trash Corp cards for the remainder of this run.',
      steps: [(c) => c.forbidStealAndTrash()],
    },
  ],
});

defineCard('bran_1_0', {
  abilities: [bioroidBreak],
  subroutines: [
    {
      text: 'You may install 1 piece of ice from HQ or Archives directly inward from this ice, ignoring all costs.',
      steps: [
        (c) => {
          const pool = [...c.zone(Z.hq), ...c.zone(Z.archives)].filter(
            (id) => c.cardOf(id).type === 'ice',
          );
          const card = c.choose('card', 'corp', [...opts(pool), { value: 'none' }]);
          if (card === undefined) return;
          if (typeof card === 'number') c.installIceInward(card);
        },
      ],
    },
    endRunSub,
    endRunSub,
  ],
});

// ---- Corp agenda and identities -------------------------------------------------------------

defineCard('longevity_serum', {
  onScore: [
    (c) => {
      const trash = pickUpTo(c, 't', 'corp', c.zone(Z.hq), 10);
      if (!trash) return;
      const shuffle = pickUpTo(
        c,
        's',
        'corp',
        c.zone(Z.archives).filter((id) => !trash.includes(id)),
        3,
      );
      if (!shuffle) return;
      for (const id of trash) c.trash(id);
      for (const id of shuffle) c.moveToDeck(id);
      c.shuffleDeck('corp');
    },
  ],
});

defineCard('jinteki_restoring_humanity', {
  triggers: [
    {
      on: 'discardPhaseEnds',
      when: ({ ev, s }) =>
        ev.player === 'corp' && (s.zones[Z.archives] ?? []).some((id) => !obj(s, id).faceUp),
      steps: [(c) => c.gainCredits('corp', 1)],
    },
  ],
});

defineCard('nbn_reality_plus', {
  triggers: [
    {
      on: 'tag',
      oncePerTurn: true,
      steps: [
        (c) => {
          const m = c.choose('mode', 'corp', [{ value: 'credits' }, { value: 'cards' }]);
          if (m === undefined) return;
          if (m === 'credits') c.gainCredits('corp', 2);
          else c.draw('corp', 2);
        },
      ],
    },
  ],
});

defineCard('weyland_consortium_built_to_last', {
  triggers: [
    {
      on: 'advance',
      when: ({ ev }) => ev.amount === 0,
      steps: [(c) => c.gainCredits('corp', 2)],
    },
  ],
});
