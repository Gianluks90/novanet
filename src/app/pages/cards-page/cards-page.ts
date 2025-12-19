import { ChangeDetectorRef, Component } from '@angular/core';
import { UIDiagonalLine } from '../../ui';
import { ActivatedRoute } from '@angular/router';
import { nrdbDb } from '../../db/nrdb-indexed-db';

@Component({
  selector: 'app-cards-page',
  imports: [UIDiagonalLine],
  templateUrl: './cards-page.html',
  styleUrl: './cards-page.scss',
})
export class CardsPage {
  public cards: any[] = [];

  constructor(private cd: ChangeDetectorRef) {}

  async ngOnInit() {
    const db = await nrdbDb;
    const allCards = await db.getAll('cards');
    this.cards = allCards;
    this.cd.detectChanges();
  }
}
