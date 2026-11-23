import { inject, Pipe, PipeTransform } from '@angular/core';
import { KEYWORD_LABELS } from '../const/keywordLabels';
import { I18nService } from '../i18n/i18n-service';

@Pipe({
  name: 'keywordLabel',
  pure: false,
})
export class KeywordLabelPipe implements PipeTransform {
  private i18n = inject(I18nService);
  private specialCases: string[] = ['G-mod'];

  transform(code: string | null | undefined): string {
    const lang = this.i18n.lang(); // it, en    
    if (!code) return '';
    // Handle special cases
    if (this.specialCases.includes(code)) {
      return KEYWORD_LABELS[code.toLowerCase()]?.[lang] ?? code;
    }
    // Handle regular cases
    if (!code.includes('-')) return KEYWORD_LABELS[code.toLowerCase()]?.[lang] ?? code;
    return code
      .split('-')
      .map(part => KEYWORD_LABELS[part.trim().toLowerCase()]?.[lang] ?? part.trim())
      .join(' - ');
  }
}
