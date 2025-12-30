import { Pipe, PipeTransform } from '@angular/core';
import { Deck } from '../models/deck';

@Pipe({
  name: 'filterDecksBySide',
})
export class FilterDecksBySidePipe implements PipeTransform {

  transform(value: Deck[], side: 'runner' | 'corp'): Deck[] {
    if (!Array.isArray(value) || !side) {
      return [];
    }
    return value.filter(deck => deck.side === side);
  }

}
