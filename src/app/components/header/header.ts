import { Component, inject, input, LOCALE_ID } from '@angular/core';
import { ThemeToggle } from '../theme-toggle/theme-toggle';
import { RouterLink } from '@angular/router';
import { CdkMenu, CdkMenuTrigger } from '@angular/cdk/menu';
import { UIButton } from '../../ui';

@Component({
  selector: 'app-header',
  imports: [ThemeToggle, RouterLink, CdkMenuTrigger, CdkMenu, UIButton],
  templateUrl: './header.html',
  styleUrl: './header.scss',
})
export class Header {
  public centeredTitle = input<string>('');
  public locale = inject(LOCALE_ID);

  ngOnInit() {
    console.log('Current locale:', this.locale);
  }
}
