import { STARTER_CORP, STARTER_RUNNER, stackDeck } from '../cards/starter-decks';
import { TutorialScript } from '../tutorial';

/**
 * Tutorial for the Runner (The Catalyst starter deck): basic actions, installing an icebreaker,
 * a run with an encounter, breaking ice, accessing cards, an event, stealing an agenda and a run
 * event. The Corp is scripted.
 */
export const RUNNER_TUTORIAL: TutorialScript = {
  id: 'runner',
  learner: 'runner',
  // Opening hand: Cleaver, Creative Commission, Jailbreak, Sure Gamble, Unity.
  runner: stackDeck(STARTER_RUNNER, [
    'cleaver',
    'creative_commission',
    'jailbreak',
    'sure_gamble',
    'unity',
  ]),
  // Opening hand + first draw, then the cards the Runner will access in R&D.
  corp: stackDeck(STARTER_CORP, [
    'palisade',
    'offworld_office',
    'tithe',
    'hedge_fund',
    'whitespace',
    'nico_campaign',
    'hedge_fund',
    'hedge_fund',
    'government_subsidy',
  ]),
  steps: [
    { kind: 'info', text: 'tutorial.runner.intro' },

    // The Corp (scripted) goes first: ice on R&D, an agenda in a new remote server.
    { kind: 'script', spec: { type: 'install', card: 'palisade', server: 'rd' } },
    { kind: 'script', spec: { type: 'install', card: 'offworld_office', server: 'new' } },
    { kind: 'script', spec: { type: 'gainCredit' } },

    // Runner turn 1: 4 clicks.
    {
      kind: 'player',
      text: 'tutorial.runner.credit',
      spec: { type: 'gainCredit' },
      focus: ['credits', 'clicks'],
    },
    {
      kind: 'player',
      text: 'tutorial.runner.install',
      spec: { type: 'install', card: 'cleaver' },
      focus: ['grip', 'rig'],
    },
    {
      kind: 'player',
      text: 'tutorial.runner.run',
      spec: { type: 'run', server: 'rd' },
      focus: ['rd'],
    },
    { kind: 'script', spec: { type: 'rez', card: 'palisade' } },
    {
      kind: 'player',
      text: 'tutorial.runner.encounter',
      spec: { type: 'break', card: 'cleaver', subroutines: [0] },
      focus: ['rd', 'rig', 'credits'],
    },
    {
      kind: 'player',
      text: 'tutorial.runner.continue',
      spec: { type: 'continue' },
    },
    { kind: 'info', text: 'tutorial.runner.access' },
    {
      kind: 'player',
      text: 'tutorial.runner.event',
      spec: { type: 'play', card: 'creative_commission' },
      focus: ['grip', 'credits', 'clicks'],
    },

    // The Corp (scripted) advances its agenda.
    { kind: 'script', spec: { type: 'advance', card: 'offworld_office' } },
    { kind: 'script', spec: { type: 'advance', card: 'offworld_office' } },
    { kind: 'script', spec: { type: 'advance', card: 'offworld_office' } },

    // Runner turn 2.
    {
      kind: 'player',
      text: 'tutorial.runner.remote',
      spec: { type: 'run', server: 'remote1' },
      focus: ['remote1'],
    },
    {
      kind: 'player',
      text: 'tutorial.runner.steal',
      spec: { type: 'continue' },
    },
    { kind: 'info', text: 'tutorial.runner.stolen' },
    {
      kind: 'player',
      text: 'tutorial.runner.jailbreak',
      spec: { type: 'play', card: 'jailbreak' },
      focus: ['grip'],
    },
    {
      kind: 'player',
      text: 'tutorial.runner.jbServer',
      spec: { type: 'choose', value: 'rd' },
      focus: ['rd'],
    },
    {
      kind: 'player',
      text: 'tutorial.runner.jbBreak',
      spec: { type: 'break', card: 'cleaver', subroutines: [0] },
    },
    {
      kind: 'player',
      text: 'tutorial.runner.jbContinue',
      spec: { type: 'continue' },
    },
    { kind: 'info', text: 'tutorial.runner.end' },
  ],
};
