import { computed, effect, Injectable, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { BehaviorSubject } from 'rxjs';
import { ACCENT_PRESETS, AccentPreset, accentPreset, ThemeName } from '../const/accent-colors';
import { FirebaseService } from './firebase-service';
import { UserService } from './user-service';

type AccentChoice = Partial<Record<ThemeName, string>>;

const ACCENT_STORAGE_KEY = 'accent';

@Injectable({
  providedIn: 'root',
})
export class ThemeService {
  private theme$ = new BehaviorSubject<ThemeName>('light');
  public readonly theme = toSignal(this.theme$, { initialValue: 'light' });

  /** Preset id picked for each theme: from this device, overridden by the profile when signed in. */
  private readonly choice = signal<AccentChoice>(ThemeService.loadChoice());
  /** Accent presets of the current theme. */
  public readonly accentPresets = computed<AccentPreset[]>(() => ACCENT_PRESETS[this.theme()]);
  /** Current accent preset id. */
  public readonly accentId = computed(() => accentPreset(this.theme(), this.choice()[this.theme()]).id);

  constructor(private firebaseService: FirebaseService, private userService: UserService) {
    this.initializeTheme();
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
      if (saved) this.choice.set({ ...saved });
    });

    effect(() => {
      const accent = accentPreset(this.theme(), this.choice()[this.theme()]).color;
      document.body.style.setProperty('--accent-color', accent);
    });
  }

  /** Picks an accent for the current theme: applied at once, kept on this device and in the profile. */
  public setAccent(id: string): void {
    const choice = { ...this.choice(), [this.theme()]: id };
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

  private getCurrentTheme(): ThemeName {
    return document.body.classList.contains('dark') ? 'dark' : 'light';
  }

  private initializeTheme(): void {
    const savedTheme = localStorage.getItem('theme') as ThemeName | null;
    this.setTheme(savedTheme ?? 'light');
  }

  setTheme(theme: ThemeName): void {
    this.theme$.next(theme);
    localStorage.setItem('theme', theme);

    document.body.classList.remove('light', 'dark');
    document.body.classList.add(theme);
  }

  toggleTheme(): void {
    const newTheme = this.theme$.value === 'light' ? 'dark' : 'light';
    this.setTheme(newTheme);
  }

  getTheme$() {
    return this.theme$.asObservable();
  }
}
