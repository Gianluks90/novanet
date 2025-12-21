import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'nrIcons',
  standalone: true
})
export class NrIconsPipe implements PipeTransform {

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
    ['recurring-credit']: 'nr-recurring-credit',
    ['rez-cost']: 'nr-rez-cost',
    subroutine: 'nr-subroutine',
    trashAbility: 'nr-trash-ability',
    trashLocal: 'nr-trash-local'
  };

  transform(text: string | undefined | null): string {
    if (!text) return '';

    return text
      .replace(/\r\n|\n|\r|↵/g, '<br />')
      .replace(/\[([^\]]+)\]/g, (match, token) => {
        const key = token.toLowerCase();
        const className = this.iconMap[key];
        if (!className) return match;

        return `<span class="nr-icon ${className}" aria-label="${key}"></span>`;
      });
  }
}