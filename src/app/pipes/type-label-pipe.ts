import { inject, Pipe, PipeTransform } from '@angular/core';
import { TYPE_LABELS } from '../const/typeLebels';
import { I18nService } from '../i18n/i18n-service';

@Pipe({
  name: 'typeLabel',
  pure: false,
})
export class TypeLabelPipe implements PipeTransform {
  private i18n = inject(I18nService);

  transform(code: string): string {
    const lang = this.i18n.lang(); // it, en    
    return TYPE_LABELS[code.toLowerCase()]?.[lang] ?? code;
  }
}
