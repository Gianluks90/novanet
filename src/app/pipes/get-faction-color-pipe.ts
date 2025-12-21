import { Pipe, PipeTransform } from '@angular/core';
import { Faction } from '../models/faction';

@Pipe({
  name: 'getFactionColor',
  standalone: true
})
export class GetFactionColorPipe implements PipeTransform {
  transform(
    value: string | undefined | null,
    factions: Faction[]
  ): string {
    if (!value || !factions?.length) {
      return 'var(--accent-color)';
    }

    const faction = factions.find(f => f.code === value);
    return faction?.color ?? 'var(--accent-color)';
  }
}