import { inject, LOCALE_ID, Pipe, PipeTransform } from '@angular/core';
import { SORT_BY_LABELS } from '../const/sortByLabels';

@Pipe({
  name: 'sortByLabel',
})
export class SortByLabelPipe implements PipeTransform {
  private locale = inject(LOCALE_ID);

  transform(code: string): string {
    console.log(SORT_BY_LABELS[code]);
    
    const lang = this.locale.split('-')[0]; // it, en    
    return SORT_BY_LABELS[code.toLowerCase()]?.[lang] ?? code;
  }
}
