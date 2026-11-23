import { inject, Pipe, PipeTransform } from '@angular/core';
import { I18nService } from './i18n-service';
import { TranslationKey } from './en';

/**
 * `{{ 'closeButton' | t }}` or `{{ 'deckLimit' | t: [limit] }}`.
 * Impure on purpose: it reads the language signal, so it re-evaluates on language change.
 */
@Pipe({
  name: 't',
  pure: false,
})
export class TranslatePipe implements PipeTransform {
  private i18n = inject(I18nService);

  transform(key: TranslationKey, args?: readonly unknown[]): string {
    return this.i18n.t(key, args);
  }
}
