import { STARTER_CORP, STARTER_RUNNER, stackDeck } from '../cards/starter-decks';
import { TutorialScript } from '../tutorial';

/**
 * Tutorial for the Corp (The Syndicate starter deck): play an operation, install an agenda and ice,
 * rez ice when the Runner approaches, advance and score. The Runner is scripted.
 */
export const CORP_TUTORIAL: TutorialScript = {
  id: 'corp',
  learner: 'corp',
  // Opening hand + first draw: Hedge Fund, Offworld Office, Palisade, Nico Campaign, Tithe, Whitespace.
  corp: stackDeck(STARTER_CORP, [
    'hedge_fund',
    'offworld_office',
    'palisade',
    'nico_campaign',
    'tithe',
    'whitespace',
    'hedge_fund',
    'government_subsidy',
  ]),
  runner: stackDeck(STARTER_RUNNER, ['sure_gamble', 'cleaver', 'jailbreak', 'unity', 'mayfly']),
  steps: [
    { kind: 'info', text: 'tutorial.corp.intro' },

    // Turn 1: 3 clicks.
    {
      kind: 'player',
      text: 'tutorial.corp.hedgeFund',
      spec: { type: 'play', card: 'hedge_fund' },
      focus: ['credits', 'clicks', 'hq'],
    },
    {
      kind: 'player',
      text: 'tutorial.corp.installAgenda',
      spec: { type: 'install', card: 'offworld_office', server: 'new' },
      focus: ['remote1'],
    },
    {
      kind: 'player',
      text: 'tutorial.corp.installIce',
      spec: { type: 'install', card: 'palisade', server: 'remote1' },
      focus: ['remote1'],
    },

    // The Runner (scripted) makes a run on the remote server.
    { kind: 'script', spec: { type: 'gainCredit' } },
    { kind: 'script', spec: { type: 'run', server: 'remote1' } },
    {
      kind: 'player',
      text: 'tutorial.corp.rez',
      spec: { type: 'rez', card: 'palisade' },
      focus: ['remote1', 'credits'],
    },
    { kind: 'info', text: 'tutorial.corp.ended' },
    { kind: 'script', spec: { type: 'gainCredit' } },
    { kind: 'script', spec: { type: 'gainCredit' } },

    // Turn 2.
    {
      kind: 'player',
      text: 'tutorial.corp.advance1',
      spec: { type: 'advance', card: 'offworld_office' },
      focus: ['remote1', 'credits', 'clicks'],
    },
    {
      kind: 'player',
      text: 'tutorial.corp.advance2',
      spec: { type: 'advance', card: 'offworld_office' },
    },
    {
      kind: 'player',
      text: 'tutorial.corp.advance3',
      spec: { type: 'advance', card: 'offworld_office' },
    },
    { kind: 'script', spec: { type: 'gainCredit' } },
    { kind: 'script', spec: { type: 'gainCredit' } },
    { kind: 'script', spec: { type: 'gainCredit' } },
    { kind: 'script', spec: { type: 'gainCredit' } },

    // Turn 3.
    {
      kind: 'player',
      text: 'tutorial.corp.advance4',
      spec: { type: 'advance', card: 'offworld_office' },
    },
    {
      kind: 'player',
      text: 'tutorial.corp.score',
      spec: { type: 'score', card: 'offworld_office' },
      focus: ['score'],
    },
    { kind: 'info', text: 'tutorial.corp.end' },
  ],
};
