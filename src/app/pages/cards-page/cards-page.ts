import { ChangeDetectorRef, Component } from '@angular/core';
import { UIDiagonalLine } from '../../ui';
import { nrdbDb } from '../../db/nrdb-indexed-db';
import { Card } from '../../models/card';
import { ActivatedRoute, Route } from '@angular/router';
import { Cycle } from '../../models/cycle';
import { Faction } from '../../models/faction';
import { Pack } from '../../models/pack';
import { Side } from '../../models/side';
import { Type } from '../../models/type';

@Component({
  selector: 'app-cards-page',
  imports: [UIDiagonalLine],
  templateUrl: './cards-page.html',
  styleUrl: './cards-page.scss',
})
export class CardsPage {
  public cards: Card[] = [];
  public zoomLevel: 'small-size' | 'medium-size' | 'large-size' | 'standard-size' = 'standard-size';
  public showAttribution: boolean = false;
  public selectedCard: any = null;

  public cycles: Cycle[] = [];
  public factions: Faction[] = [];
  public packs: Pack[] = [];
  public sides: Side[] = [];
  public types: Type[] = [];

  private filters = {
    text: '',
    pack: 'all',
    faction: 'all',
    side: 'all',
    type: 'all',
  };

  constructor(private cd: ChangeDetectorRef, private route: ActivatedRoute) {
    this.route.data.subscribe(data => {
      this.cycles = data['configs'].cycles.data;
      this.factions = data['configs'].factions.data;
      this.packs = data['configs'].packs.data;
      this.sides = data['configs'].sides.data;
      this.types = data['configs'].types.data;

      // console.log(this.cycles, this.factions, this.packs, this.sides, this.types);
    });
  }

  private allCards: Card[] = [];

  async ngOnInit() {
    const db = await nrdbDb;
    const allCards = await db.getAll('cards');
    this.allCards = allCards;
    this.cards = [...allCards];

    const savedZoom = localStorage.getItem('zoomLevel');
    if (savedZoom) {
      this.zoomLevel = savedZoom as 'small-size' | 'medium-size' | 'large-size' | 'standard-size';
    }

    this.cd.detectChanges();
  }

  toggleAttribution() {
    this.showAttribution = !this.showAttribution;
  }

  zoomRotation() {
    if (this.zoomLevel === 'small-size') {
      this.zoomLevel = 'medium-size';
    } else if (this.zoomLevel === 'medium-size') {
      this.zoomLevel = 'large-size';
    } else if (this.zoomLevel === 'large-size') {
      this.zoomLevel = 'standard-size';
    } else {
      this.zoomLevel = 'small-size';
    }

    localStorage.setItem('zoomLevel', this.zoomLevel);
  }

  public onCardClick(card: any) {
    this.selectedCard = card;
    console.log(this.selectedCard);
  }

  // FILTERS
  // Text filter
  onChangeTextSearch(event: any) {
    this.filters.text = event.target.value.toLowerCase();
    this.applyFilters();
  }

  // Pack filter
  onChangePackFilter(event: any) {
    this.filters.pack = event.target.value;
    this.applyFilters();
  }

  // Faction filter
  onChangeFactionFilter(event: any) {
    this.filters.faction = event.target.value;
    this.applyFilters();
  }

  // Side filter
  onChangeSideFilter(event: any) {
    this.filters.side = event.target.value;
    this.applyFilters();
  }

  // Type filter
  onChangeTypeFilter(event: any) {
    this.filters.type = event.target.value;
    this.applyFilters();
  }

  private applyFilters() {
    console.log(this.filters);
    
    this.cards = this.allCards.filter(card => {
      if (
        this.filters.text &&
        !card.title.toLowerCase().includes(this.filters.text)
      ) {
        return false;
      }
      if (
        this.filters.pack !== 'all' &&
        card.pack_code !== this.filters.pack
      ) {
        return false;
      }
      if (
        this.filters.faction !== 'all' &&
        card.faction_code !== this.filters.faction
      ) {
        return false;
      }
      if (
        this.filters.side !== 'all' &&
        card.side_code !== this.filters.side
      ) {
        return false;
      }
      if (
        this.filters.type !== 'all' &&
        card.type_code !== this.filters.type
      ) {
        return false;
      }
      return true;
    });
  }

  public resetFilters() {
    this.filters = {
      text: '',
      pack: 'all',
      faction: 'all',
      side: 'all',
      type: 'all',
    };

    this.cards = [...this.allCards];
  }
}