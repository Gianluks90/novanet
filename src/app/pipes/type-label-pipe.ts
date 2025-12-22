import { inject, LOCALE_ID, Pipe, PipeTransform } from '@angular/core';
import { TYPE_LABELS } from '../const/typeLebels';

@Pipe({
  name: 'typeLabel',
})
export class TypeLabelPipe implements PipeTransform {
  private locale = inject(LOCALE_ID);

  transform(code: string): string {
    console.log(TYPE_LABELS[code]);
    
    const lang = this.locale.split('-')[0]; // it, en    
    return TYPE_LABELS[code.toLowerCase()]?.[lang] ?? code;
  }
}
