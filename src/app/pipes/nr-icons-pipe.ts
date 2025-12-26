import { inject, LOCALE_ID, Pipe, PipeTransform } from '@angular/core';
import { FACTION_LABELS } from '../const/factionLabels';

@Pipe({
  name: 'nrIcons',
  standalone: true
})
export class NrIconsPipe implements PipeTransform {
  private locale = inject(LOCALE_ID);

  private iconMap: Record<string, string> = {
    agenda: 'nr-agenda',
    archives: 'nr-archives',
    click: 'nr-click',
    credit: 'nr-credit',
    hq: 'nr-hq',
    interrupt: 'nr-interrupt',
    link: 'nr-link',
    mu: 'nr-mu',
    rd: 'nr-rd',
    'recurring-credit': 'nr-recurring-credit',
    'rez-cost': 'nr-rez-cost',
    subroutine: 'nr-subroutine',
    'trash_cost': 'nr-trash-cost',
    trash: 'nr-trash-local',
    adam: 'f-adam',
    anarch: 'f-anarch',
    apex: 'f-apex',
    criminal: 'f-criminal',
    'haas-bioroid': 'f-hb',
    jinteki: 'f-jinteki',
    nbn: 'f-nbn',
    shaper: 'f-shaper',
    sunny: 'f-sunny',
    'weyland-consortium': 'f-weyland'
  };


  transform(text: string | undefined | null): string {
    if (!text) return '';

    return text
      .replace(/\r\n|\n|\r|↵/g, '<br />')
      .replace(/\[([^\]]+)\]/g, (match, token) => {
        const trimmed = token.trim();

        if (/^\d+$/.test(trimmed)) {
          return `<sup>${trimmed}</sup>`;
        }
        const key = trimmed.toLowerCase();
        const className = this.iconMap[key];
        const lang = this.locale.split('-')[0]; // it, en
        const localizedKey = FACTION_LABELS[key]?.[lang] ?? key;
        
        return className
          ? `<span title="${localizedKey}" class="nr-icon ${className}" aria-label="${key}"></span>`
          : match;
      });
  }
}