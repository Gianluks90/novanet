import { Pipe, PipeTransform } from '@angular/core';
import { Card } from '../models/card';

@Pipe({
  name: 'checkAgendaPoints',
  pure: true,
  standalone: true
})
export class CheckAgendaPointsPipe implements PipeTransform {

  transform(
    selectedCards: Map<string, number>,
    cardsMap: Map<string, Card>
  ): number {
    if (!selectedCards || !cardsMap) return 0;
    let total = 0;

    selectedCards.forEach((qty, code) => {
      const card = cardsMap.get(code);
      if (!card?.agenda_points) return;

      total += card.agenda_points * qty;
    });

    return total;
  }
}