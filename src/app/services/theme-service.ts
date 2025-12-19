import { effect, Injectable } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { BehaviorSubject } from 'rxjs';
import { FirebaseService } from './firebase-service';

@Injectable({
  providedIn: 'root',
})
export class ThemeService {
  private theme$ = new BehaviorSubject<'light' | 'dark'>('light');
  private themeSignal = toSignal(this.theme$, { initialValue: 'light' });

  constructor(private firebaseService: FirebaseService) {
    this.initializeTheme();
    this.setupAccentEffect();
  }

  private setupAccentEffect(): void {
    effect(() => {
      const user = this.firebaseService.$user();
      const theme = this.themeSignal();

      const accent =
        theme === 'light'
          ? '#000000'
          : user?.customAccentColor ?? '#FCF552';

      document.body.style.setProperty('--accent-color', accent);
    });
  }

  private getCurrentTheme(): 'light' | 'dark' {
    return document.body.classList.contains('dark') ? 'dark' : 'light';
  }

  private mixWithBlack(color: string, amount = 0.25): string {
    const hex = color.replace('#', '');

    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);

    const mix = (v: number) =>
      Math.round(v * (1 - amount))
        .toString(16)
        .padStart(2, '0');

    return `#${mix(r)}${mix(g)}${mix(b)}`;
  }

  private initializeTheme(): void {
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;
    this.setTheme(savedTheme ?? 'light');
  }

  setTheme(theme: 'light' | 'dark'): void {
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
