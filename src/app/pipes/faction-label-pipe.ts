import { Pipe } from '@angular/core';
import { LOCALE_ID, inject } from '@angular/core';
import { FACTION_LABELS } from '../const/factionLabels';

@Pipe({
  name: 'factionLabel',
  standalone: true
})
export class FactionLabelPipe {
  private locale = inject(LOCALE_ID);

  transform(code: string): string {
    const lang = this.locale.split('-')[0]; // it, en    
    return FACTION_LABELS[code.toLowerCase()]?.[lang] ?? code;
  }
}