import { Pipe, PipeTransform } from '@angular/core';
import { Faction } from '../models/faction';

@Pipe({
  name: 'getFactionName',
  standalone: true
})
export class GetFactionNamePipe implements PipeTransform {

  transform(
    value: string | undefined | null,
    factions: Faction[]
  ): string {
    if (!value || !factions?.length) {
      return value ?? '';
    }

    const faction = factions.find(f => f.code === value);
    return faction?.name?.toLowerCase() ?? value;
  }
}