import { TranslationKey } from '../i18n/en';

/** The app has one theme (dark): the cards read better on a dark, uniform background. */
export type ThemeName = 'dark';

export interface AccentPreset {
  /** Stored in localStorage and in the user profile: never change an id once released. */
  id: string;
  /** Hex value of `--accent-color`. */
  color: string;
  label: TranslationKey;
}

/**
 * The accent colors the user can pick. The first one is the default. They sit on the dark surface
 * and the text on an accent fill is `--bg-color`, so every color here needs contrast with the
 * dark surfaces. (The `green` id now holds a mint green; `red` was added.)
 */
export const ACCENT_PRESETS: AccentPreset[] = [
  { id: 'cyan', color: '#4FD8EB', label: 'accentColor.cyan' },
  { id: 'yellow', color: '#FCF552', label: 'accentColor.yellow' },
  { id: 'green', color: '#3DF2B0', label: 'accentColor.green' },
  { id: 'magenta', color: '#FF6AC9', label: 'accentColor.magenta' },
  { id: 'orange', color: '#FFA24A', label: 'accentColor.orange' },
  { id: 'red', color: '#F2154F', label: 'accentColor.red' },
];

/** Accent for a stored id; unknown/missing ids fall back to the default. */
export function accentPreset(id: string | null | undefined): AccentPreset {
  return ACCENT_PRESETS.find(p => p.id === id) ?? ACCENT_PRESETS[0];
}
