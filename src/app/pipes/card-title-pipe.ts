import { inject, Pipe, PipeTransform } from '@angular/core';
import { CardTranslationService } from '../services/card-translation-service';

/** `{{ card | cardTitle }}`: the card title in the current language (English if not translated). */
@Pipe({
  name: 'cardTitle',
  pure: false,
})
export class CardTitlePipe implements PipeTransform {
  private translations = inject(CardTranslationService);

  transform(card: { id: string; title: string } | null | undefined): string {
    return card ? this.translations.title(card) : '';
  }
}
