import { inject, LOCALE_ID, Pipe, PipeTransform } from '@angular/core';
import { KEYWORD_LABELS } from '../const/keywordLabels';

@Pipe({
  name: 'keywordLabel',
})
export class KeywordLabelPipe implements PipeTransform {
  private locale = inject(LOCALE_ID);
  private specialCases: string[] = ['G-mod'];

  transform(code: string | undefined): string {
    const lang = this.locale.split('-')[0]; // it, en    
    if (!code) return '';
    // Handle special cases
    if (this.specialCases.includes(code)) {
      const key = code.toLowerCase().replace('-', '-');
      return KEYWORD_LABELS[key]?.[lang] ?? code;
    }
    // Handle regular cases
    if (!code.includes('-')) return KEYWORD_LABELS[code.toLowerCase()]?.[lang] ?? code;
    return code
      .split('-')
      .map(part => KEYWORD_LABELS[part.trim().toLowerCase()]?.[lang] ?? part.trim())
      .join(' - ');
  }
}
