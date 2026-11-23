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

      if (card.faction_id === identityFaction) return;
      if (card.faction_id?.startsWith('neutral')) return;
      if (!card.influence_cost) return;

      total += card.influence_cost * qty;
    });

    return total;
  }
}