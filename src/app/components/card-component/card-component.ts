import { Component, input } from '@angular/core';
import { Card } from '../../models/card';

@Component({
  selector: 'app-card-component',
  imports: [],
  templateUrl: './card-component.html',
  styleUrl: './card-component.scss',
})
export class CardComponent {
  public card = input<Card | null>(null);
  public selectedCard = input<Card | null>(null);
  public selectedCardClass = input<boolean | null>(false);
  public notSelectedCardClass = input<boolean | null>(false);
}
