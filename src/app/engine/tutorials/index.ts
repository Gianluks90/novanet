import { Catalog } from '../types';
import { TutorialSession } from '../tutorial';
import { CORP_TUTORIAL } from './corp';
import { RUNNER_TUTORIAL } from './runner';

export const TUTORIALS = { corp: CORP_TUTORIAL, runner: RUNNER_TUTORIAL } as const;
export type TutorialId = keyof typeof TUTORIALS;

export function createTutorial(id: TutorialId, catalog: Catalog): TutorialSession {
  return new TutorialSession(TUTORIALS[id], catalog);
}

export { CORP_TUTORIAL, RUNNER_TUTORIAL };
