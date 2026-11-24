import { effect, inject, Injectable, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';
import { EN, TranslationKey } from './en';
import { I18nService } from './i18n-service';

/**
 * Page titles in the current language. A route's `title` is a translation key (or plain text
 * for pages that are not translated, like the design system); the document title is rebuilt
 * when the route or the language changes.
 */
@Injectable({ providedIn: 'root' })
export class AppTitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);
  private readonly i18n = inject(I18nService);
  private readonly current = signal<string | undefined>(undefined);

  constructor() {
    super();
    effect(() => {
      const current = this.current();
      if (current === undefined) return;
      const text = current in EN ? this.i18n.t(current as TranslationKey) : current;
      this.title.setTitle(`${text} - NovaNet`);
    });
  }

  public override updateTitle(snapshot: RouterStateSnapshot): void {
    this.current.set(this.buildTitle(snapshot));
  }
}
