import { Component, inject } from '@angular/core';
import { ThemeService } from '../../services/theme-service';
import { AsyncPipe } from '@angular/common';

@Component({
  selector: 'app-theme-toggle',
  imports: [AsyncPipe],
  templateUrl: './theme-toggle.html',
  styleUrl: './theme-toggle.scss',
})
export class ThemeToggle {
  private theme = inject(ThemeService);
  public currentTheme;

  constructor() {
    this.currentTheme = this.theme.getTheme$();
  }

  protected toggleTheme() {
    this.theme.toggleTheme();
  }
}
