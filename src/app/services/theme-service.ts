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

  private setupAccentEffects(): void {
    // The profile wins over the device when the user is signed in and has chosen something.
    effect(() => {
      const saved = this.firebaseService.$user()?.accentColors;
      if (saved?.dark) this.choice.set({ dark: saved.dark });
    });

    effect(() => {
      document.body.style.setProperty('--accent-color', accentPreset(this.choice().dark).color);
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
