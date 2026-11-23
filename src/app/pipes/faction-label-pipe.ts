import { inject, Pipe } from '@angular/core';
import { FACTION_LABELS } from '../const/factionLabels';
import { I18nService } from '../i18n/i18n-service';

@Pipe({
  name: 'factionLabel',
  pure: false,
  standalone: true
})
export class FactionLabelPipe {
  private i18n = inject(I18nService);

  transform(code: string): string {
    const lang = this.i18n.lang(); // it, en    
    return FACTION_LABELS[code.toLowerCase()]?.[lang] ?? code;
  }
}