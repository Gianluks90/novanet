import { Component, effect, input } from '@angular/core';

@Component({
  selector: 'app-ui-diagonal-line',
  imports: [],
  templateUrl: './ui-diagonal-line.html',
  styleUrl: './ui-diagonal-line.scss'
})
export class UIDiagonalLine {
  public position = input<'top-right' | 'bottom-right' | 'top-left' | 'bottom-left'>('top-right');

  constructor() {
    effect(() => {
      if (!this.position()) return;
    })
  }
}
