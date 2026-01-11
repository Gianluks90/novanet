import { Pipe, PipeTransform } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Faction } from '../models/faction';
import { Card } from '../models/card';

@Pipe({
  name: 'dots',
  standalone: true
})
export class DotsPipe implements PipeTransform {

  constructor(private sanitizer: DomSanitizer) {}

  transform(card: Card | null | undefined, factions: Faction[]): SafeHtml {
    const count = Math.max(0, card?.faction_cost ?? 0);
    const color = '#' + factions.find(f => f.code === card?.faction_code)?.color;

    const html = Array.from({ length: count })
      .map(() => `<span class="material-symbols-rounded" style="font-size: 0.6em; color: ${color};">circle</span>`)
      .join('');

    return this.sanitizer.bypassSecurityTrustHtml(html);
  }
}