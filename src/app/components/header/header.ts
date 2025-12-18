import { Component } from '@angular/core';
import { ThemeToggle } from '../theme-toggle/theme-toggle';

@Component({
  selector: 'app-header',
  imports: [ThemeToggle],
  templateUrl: './header.html',
  styleUrl: './header.scss',
})
export class Header {

}
