import { Component, effect, inject, input, LOCALE_ID } from '@angular/core';
import { ThemeToggle } from '../theme-toggle/theme-toggle';
import { RouterLink } from '@angular/router';
import { CdkMenu, CdkMenuTrigger } from '@angular/cdk/menu';
import { UIButton } from '../../ui';
import { FirebaseService } from '../../services/firebase-service';

@Component({
  selector: 'app-header',
  imports: [ThemeToggle, RouterLink, CdkMenuTrigger, CdkMenu, UIButton],
  templateUrl: './header.html',
  styleUrl: './header.scss',
})
export class Header {
  public centeredTitle = input<string>('');
  public locale = inject(LOCALE_ID);
  public customBackground: boolean = false;

  constructor(private firebaseService: FirebaseService) {
    effect(() => {
      if (this.firebaseService.$user() && this.firebaseService.$user()!.customBackgroundURL) {
        this.customBackground = true;
      } else {
        this.customBackground = false;
      }
    });
  }

  ngOnInit() {
    console.log('Current locale:', this.locale);
  }
}
