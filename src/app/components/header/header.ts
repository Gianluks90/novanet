import { Component, effect, inject, input } from '@angular/core';
import { ThemeToggle } from '../theme-toggle/theme-toggle';
import { RouterLink } from '@angular/router';
import { CdkMenu, CdkMenuTrigger } from '@angular/cdk/menu';
import { UIButton } from '../../ui';
import { FirebaseService } from '../../services/firebase-service';
import { I18nService, Lang } from '../../i18n/i18n-service';

@Component({
  selector: 'app-header',
  imports: [ThemeToggle, RouterLink, CdkMenuTrigger, CdkMenu, UIButton],
  templateUrl: './header.html',
  styleUrl: './header.scss',
})
export class Header {
  public centeredTitle = input<string>('');
  private i18n = inject(I18nService);
  public get locale(): string { return this.i18n.lang(); }

  public setLang(lang: Lang) {
    this.i18n.setLang(lang);
  }
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
}
