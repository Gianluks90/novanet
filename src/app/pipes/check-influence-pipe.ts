import { Pipe, PipeTransform } from '@angular/core';
import { Card } from '../models/card';

@Pipe({
  name: 'checkInfluence',
  pure: true,
  standalone: true
})
export class CheckInfluencePipe implements PipeTransform {

  transform(
    selectedCards: Map<string, number>,
    cardsMap: Map<string, Card>,
    identityFaction: string
  ): number {
    if (!selectedCards || !cardsMap) return 0;

    let total = 0;

    selectedCards.forEach((qty, code) => {
      const card = cardsMap.get(code);
      if (!card) return;

      if (card.faction_code === identityFaction) return;
      if (card.faction_code?.startsWith('neutral')) return;
      if (!card.faction_cost) return;

      total += card.faction_cost * qty;
    });

    return total;
  }
}