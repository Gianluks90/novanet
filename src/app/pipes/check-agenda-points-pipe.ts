import { Pipe, PipeTransform } from "@angular/core";

@Pipe({
  name: 'checkAgendaPoints',
  pure: true
})
export class CheckAgendaPointsPipe implements PipeTransform {

  transform(
    deck: Record<string, number>[],
    cardsMap: Map<string, any>
  ): number {
    if (!deck || !cardsMap) return 0;

    let total = 0;

    for (const entry of deck) {
      const [code, qty] = Object.entries(entry)[0];
      const card = cardsMap.get(code);

      if (!card?.agenda_points) continue;

      total += card.agenda_points * qty;
    }

    return total;
  }
}