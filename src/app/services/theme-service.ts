import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class ThemeService {
  private theme$ = new BehaviorSubject<'light' | 'dark'>('light');

  constructor() {
    this.initializeTheme();
  }

  private initializeTheme(): void {
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;
    const theme = savedTheme || 'light';
    this.setTheme(theme);
  }

  setTheme(theme: 'light' | 'dark'): void {
    this.theme$.next(theme);
    localStorage.setItem('theme', theme);
    document.body.classList.remove('light', 'dark');
    document.body.classList.add(theme);
  }

  getTheme$() {
    return this.theme$.asObservable();
  }

  toggleTheme(): void {
    const currentTheme = this.theme$.value;
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    this.setTheme(newTheme);
  }
}
