import { TranslationKey } from '../i18n/en';

export type ThemeName = 'light' | 'dark';

export interface AccentPreset {
  /** Stored in localStorage and in the user profile: never change an id once released. */
  id: string;
  /** Hex value of `--accent-color`. */
  color: string;
  label: TranslationKey;
}

/**
 * The accent colors the user can pick, per theme. The first one is the default.
 * Dark colors sit on the dark surface (`--bg-color` #272931), light ones on #f0f0f0, and the text on
 * an accent fill is `--bg-color`, so every color here needs contrast with its own theme's surface.
 */
export const ACCENT_PRESETS: Record<ThemeName, AccentPreset[]> = {
  dark: [
    { id: 'yellow', color: '#FCF552', label: 'accentColor.yellow' },
    { id: 'cyan', color: '#4FD8EB', label: 'accentColor.cyan' },
    { id: 'magenta', color: '#FF6AC9', label: 'accentColor.magenta' },
    { id: 'green', color: '#6CF58F', label: 'accentColor.green' },
    { id: 'orange', color: '#FFA24A', label: 'accentColor.orange' },
  ],
  light: [
    { id: 'black', color: '#000000', label: 'accentColor.black' },
    { id: 'blue', color: '#1B4FD8', label: 'accentColor.blue' },
    { id: 'crimson', color: '#C2185B', label: 'accentColor.crimson' },
    { id: 'emerald', color: '#12794A', label: 'accentColor.emerald' },
    { id: 'amber', color: '#B35A00', label: 'accentColor.amber' },
  ],
};

/** Accent of the given theme for a stored id; unknown/missing ids fall back to the theme default. */
export function accentPreset(theme: ThemeName, id: string | null | undefined): AccentPreset {
  const presets = ACCENT_PRESETS[theme];
  return presets.find(p => p.id === id) ?? presets[0];
}
