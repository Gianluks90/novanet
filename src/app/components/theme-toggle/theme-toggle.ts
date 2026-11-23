import { Component, inject } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { ThemeService } from '../../services/theme-service';
import { UiIconButton } from '../../ui';
import { TranslatePipe } from '../../i18n/translate-pipe';

@Component({
  selector: 'app-theme-toggle',
  imports: [AsyncPipe, UiIconButton, TranslatePipe],
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
