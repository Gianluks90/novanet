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
import { FormsModule } from '@angular/forms';
import { NrIconsPipe } from '../../pipes/nr-icons-pipe';
import { DomSanitizer } from '@angular/platform-browser';

@Component({
  selector: 'app-cards-page',
  imports: [UIDiagonalLine, FormsModule, NrIconsPipe],
  templateUrl: './cards-page.html',
  styleUrl: './cards-page.scss',
})
export class CardsPage {
  private originalCards: Card[] = [];
  public cards: Card[] = [];
  public zoomLevel: 'small-size' | 'medium-size' | 'large-size' | 'standard-size' = 'standard-size';
  public sortBy: 'faction' | 'title' | 'type' | 'influence' | 'cost' | 'set number' | 'default' = 'default';
  public showAttribution: boolean = false;
  public selectedCard: Card | null = null;

  public cycles: Cycle[] = [];
  public factions: Faction[] = [];
  public packs: Pack[] = [];
  public sides: Side[] = [];
  public types: Type[] = [];

  public filters = {
    text: '',
    pack: 'all',
    faction: 'all',
    side: 'all',
    type: 'all',
  };

  constructor(private cd: ChangeDetectorRef, private route: ActivatedRoute, private sanitizer: DomSanitizer) {
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
    this.originalCards = [...allCards]; // snapshot sacra
    this.cards = [...allCards];

    const savedZoom = localStorage.getItem('zoomLevel');
    if (savedZoom) {
      this.zoomLevel = savedZoom as 'small-size' | 'medium-size' | 'large-size' | 'standard-size';
    }
    const savedSortBy = localStorage.getItem('sortBy');
    if (savedSortBy) {
      this.sortBy = savedSortBy as 'faction' | 'title' | 'type' | 'influence' | 'cost' | 'set number';
      this.applySort();
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

  public sortRotation() {
    if (this.sortBy === 'default' || this.sortBy === 'title') {
      this.sortBy = 'faction';
    } else if (this.sortBy === 'faction') {
      this.sortBy = 'type';
    } else if (this.sortBy === 'type') {
      this.sortBy = 'influence';
    } else if (this.sortBy === 'influence') {
      this.sortBy = 'cost';
    } else if (this.sortBy === 'cost') {
      this.sortBy = 'set number';
    } else if (this.sortBy === 'set number') {
      this.sortBy = 'title';
    }

    localStorage.setItem('sortBy', this.sortBy);
    this.applySort();
  }

  private applySort() {
    const base = [...this.cards]; // oppure [...this.allCards] se senza filtri

    switch (this.sortBy) {
      case 'faction':
        this.cards = base.sort((a, b) =>
          (a.faction_code || '').localeCompare(b.faction_code || '')
        );
        break;

      case 'type':
        this.cards = base.sort((a, b) =>
          (a.type_code || '').localeCompare(b.type_code || '')
        );
        break;

      case 'influence':
        this.cards = base.sort((a, b) =>
          (b.influence_limit || 0) - (a.influence_limit || 0)
        );
        break;

      case 'cost':
        this.cards = base.sort((a, b) =>
          (a.cost || 0) - (b.cost || 0)
        );
        break;

      case 'set number':
        this.cards = base.sort((a, b) =>
          (a.position || 0) - (b.position || 0)
        );
        break;

      case 'title':
        this.cards = base.sort((a, b) =>
          a.title.localeCompare(b.title)
        );
        break;
      default:
        // this.cards = [...this.originalCards];
        break;
    }
  }

  public onCardClick(card: Card) {
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

    this.applySort();
  }

  public resetFilters() {
    this.filters = {
      text: '',
      pack: 'all',
      faction: 'all',
      side: 'all',
      type: 'all',
    };

    this.sortBy = 'default';
    localStorage.removeItem('sortBy');

    this.cards = [...this.originalCards];

    // this.applyFilters()
  }
}