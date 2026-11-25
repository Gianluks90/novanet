import { computed, effect, Injectable, signal } from '@angular/core';
import { ACCENT_PRESETS, AccentPreset, accentPreset } from '../const/accent-colors';
import { FirebaseService } from './firebase-service';
import { UserService } from './user-service';

/** Accent id chosen; kept under `dark` because that is how it was stored when there were two themes. */
type AccentChoice = { dark?: string };

const ACCENT_STORAGE_KEY = 'accent';

/**
 * The look of the app: a single dark theme with a user-chosen accent color. (The light theme was
 * removed: the cards read better on a dark background.)
 */
@Injectable({
  providedIn: 'root',
})
export class ThemeService {
  private readonly choice = signal<AccentChoice>(ThemeService.loadChoice());
  /** The accent presets to pick from. */
  public readonly accentPresets = computed<AccentPreset[]>(() => ACCENT_PRESETS);
  /** Current accent preset id. */
  public readonly accentId = computed(() => accentPreset(this.choice().dark).id);

  constructor(private firebaseService: FirebaseService, private userService: UserService) {
    document.body.classList.remove('light');
    document.body.classList.add('dark');
    localStorage.removeItem('theme');
    this.setupAccentEffects();
  }

  private static loadChoice(): AccentChoice {
    try {
      return JSON.parse(localStorage.getItem(ACCENT_STORAGE_KEY) ?? '{}') ?? {};
    } catch {
      return {};
    }
  }

  /**
   * The site's cursor, as a CSS value: a square outline with a dot in the middle, in the accent
   * color over a thin dark contour (so it shows on bright images too). Over something clickable
   * (`active`) the square is faintly filled and the dot is bigger.
   */
  private static cursor(color: string, active: boolean): string {
    const dot = active ? 6 : 4;
    const dotAt = 12 - dot / 2;
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">` +
      `<rect x="4" y="4" width="16" height="16" fill="${active ? color : 'none'}" fill-opacity="${active ? 0.3 : 0}" stroke="#07090d" stroke-width="3.5"/>` +
      `<rect x="${dotAt - 1}" y="${dotAt - 1}" width="${dot + 2}" height="${dot + 2}" fill="#07090d"/>` +
      `<rect x="4" y="4" width="16" height="16" fill="none" stroke="${color}" stroke-width="1.5"/>` +
      `<rect x="${dotAt}" y="${dotAt}" width="${dot}" height="${dot}" fill="${color}"/>` +
      `</svg>`;
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 12 12, auto`;
  }

  /** The cursor over text fields: a vertical bar (a pipe), accent over a dark contour. */
  private static textCursor(color: string): string {
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">` +
      `<path d="M12 3V21" stroke="#07090d" stroke-width="4" stroke-linecap="square"/>` +
      `<path d="M12 3V21" stroke="${color}" stroke-width="1.6" stroke-linecap="square"/>` +
      `</svg>`;
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 12 12, text`;
  }

  /** The cursor over disabled controls: a prohibition sign (circle with a slash). */
  private static disabledCursor(color: string): string {
    const shape = '<circle cx="12" cy="12" r="8"/><path d="M6.5 6.5L17.5 17.5"/>';
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">` +
      `<g stroke="#07090d" stroke-width="4.5">${shape}</g>` +
      `<g stroke="${color}" stroke-width="2">${shape}</g>` +
      `</svg>`;
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 12 12, not-allowed`;
  }

  /** The cursor over a dialog's backdrop (click to close): an X, accent over a dark contour. */
  private static closeCursor(color: string): string {
    const cross = 'M6 6L18 18M18 6L6 18';
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">` +
      `<path d="${cross}" stroke="#07090d" stroke-width="4.5" stroke-linecap="square"/>` +
      `<path d="${cross}" stroke="${color}" stroke-width="2" stroke-linecap="square"/>` +
      `</svg>`;
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 12 12, pointer`;
  }

  private setupAccentEffects(): void {
    // The profile wins over the device when the user is signed in and has chosen something.
    effect(() => {
      const saved = this.firebaseService.$user()?.accentColors;
      if (saved?.dark) this.choice.set({ dark: saved.dark });
    });

    effect(() => {
      const color = accentPreset(this.choice().dark).color;
      document.body.style.setProperty('--accent-color', color);
      // a cursor image cannot read CSS variables, so it is rebuilt with the accent
      document.body.style.setProperty('--cursor-default', ThemeService.cursor(color, false));
      document.body.style.setProperty('--cursor-pointer', ThemeService.cursor(color, true));
      document.body.style.setProperty('--cursor-close', ThemeService.closeCursor(color));
      document.body.style.setProperty('--cursor-text', ThemeService.textCursor(color));
      document.body.style.setProperty('--cursor-disabled', ThemeService.disabledCursor(color));
    });
  }

  /** Picks the accent: applied at once, kept on this device and in the profile. */
  public setAccent(id: string): void {
    const choice: AccentChoice = { dark: id };
    this.choice.set(choice);
    try {
      localStorage.setItem(ACCENT_STORAGE_KEY, JSON.stringify(choice));
    } catch { /* storage unavailable: the choice just won't survive a reload */ }
    const uid = this.firebaseService.$user()?.uid;
    if (uid) {
      this.userService.updateUserInfo(uid, { accentColors: choice })
        .catch(err => console.error('Error saving the accent color:', err));
    }
  }
}
