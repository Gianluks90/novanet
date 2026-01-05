import { Pipe, PipeTransform } from "@angular/core";

@Pipe({
  name: 'checkInfluence',
  pure: true
})
export class CheckInfluencePipe implements PipeTransform {

  transform(
    deck: Record<string, number>[],
    cardsMap: Map<string, any>,
    identityFaction: string
  ): number {
    if (!deck || !cardsMap) return 0;

    let total = 0;

    for (const entry of deck) {
      const [code, qty] = Object.entries(entry)[0];
      const card = cardsMap.get(code);

      if (!card) continue;
      if (card.faction_code === identityFaction) continue;
      if (!card.influence_cost) continue;

      total += card.influence_cost * qty;
    }

    return total;
  }
}