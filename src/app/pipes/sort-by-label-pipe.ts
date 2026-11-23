import { inject, Pipe, PipeTransform } from '@angular/core';
import { SORT_BY_LABELS } from '../const/sortByLabels';
import { I18nService } from '../i18n/i18n-service';

@Pipe({
  name: 'sortByLabel',
  pure: false,
})
export class SortByLabelPipe implements PipeTransform {
  private i18n = inject(I18nService);

  transform(code: string): string {
    const lang = this.i18n.lang(); // it, en    
    return SORT_BY_LABELS[code.toLowerCase()]?.[lang] ?? code;
  }
}
