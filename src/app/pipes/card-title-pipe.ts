import { inject, Pipe, PipeTransform } from '@angular/core';
import { CardTranslationService } from '../services/card-translation-service';

/**
 * `{{ card | cardTitle }}`: the card title in the current language (English if not translated).
 * `{{ card | cardTitle: false }}` always gives the English title.
 */
@Pipe({
  name: 'cardTitle',
  pure: false,
})
export class CardTitlePipe implements PipeTransform {
  private translations = inject(CardTranslationService);

  transform(card: { id: string; title: string } | null | undefined, translated = true): string {
    if (!card) return '';
    return translated ? this.translations.title(card) : card.title;
  }
}
