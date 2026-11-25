/**
 * System Gateway card definitions (hand-written, keyed by `card_id`). Cards are added as the
 * engine learns the mechanics they need; the list of what is covered is in docs/engine-spec.md.
 */
import {
  ChoiceOption,
  EffectContext,
  Instruction,
  Subroutine,
  defineCard,
  netDamage,
} from '../definitions';
import { installedCorpCards, runnerInstallCost } from '../engine';
import { ObjectId } from '../types';
import { Z, obj } from '../zones';

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

defineCard('haas_bioroid_precision_design', { static: { handSize: 1 } });
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
