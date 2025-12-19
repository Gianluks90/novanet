import { Component, input } from '@angular/core';
import { ThemeToggle } from '../theme-toggle/theme-toggle';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-header',
  imports: [ThemeToggle, RouterLink],
  templateUrl: './header.html',
  styleUrl: './header.scss',
})
export class Header {
  public centeredTitle = input<string>('');
}
