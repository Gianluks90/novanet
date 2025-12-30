import { ChangeDetectorRef, Component, inject, LOCALE_ID } from '@angular/core';
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
import { CardComponent } from '../../components/card-component/card-component';
import { CardDetail } from '../../components/card-detail/card-detail';
import { FirebaseService } from '../../services/firebase-service';
import { NotificationService } from '../../services/notification-service';
import { FactionLabelPipe } from '../../pipes/faction-label-pipe';
import { TypeLabelPipe } from '../../pipes/type-label-pipe';
import { ZoomLevelLabelPipe } from '../../pipes/zoom-level-label-pipe';
import { SortByLabelPipe } from '../../pipes/sort-by-label-pipe';
import { CardService } from '../../services/card-service';

@Component({
  selector: 'app-cards-page',
  imports: [
    UIDiagonalLine,
    FormsModule,
    CardComponent,
    CardDetail,
    FactionLabelPipe,
    TypeLabelPipe,
    ZoomLevelLabelPipe,
    SortByLabelPipe
  ],
  templateUrl: './cards-page.html',
  styleUrl: './cards-page.scss',
})
export class CardsPage {
  private originalCards: Card[] = [];
  public cards: Card[] = [];
  public zoomLevel: 'small-size' | 'medium-size' | 'large-size' | 'standard-size' = 'standard-size';
  public sortBy: 'faction' | 'title' | 'type' | 'faction cost' | 'cost' | 'set number' | 'default' = 'default';
  public showAttribution: boolean = false;
  public selectedCard: Card | null = null;
  public cardZoomed: boolean = false;
  private locale = inject(LOCALE_ID);

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
    translated: 'none' as 'none' | 'only',
    cost: null as number | null
  };

  constructor(
    private cd: ChangeDetectorRef,
    private route: ActivatedRoute,
    public firebase: FirebaseService,
    private notification: NotificationService,
    private cardService: CardService) {
    this.route.data.subscribe(data => {
      this.cycles = data['configs'].cycles.data;
      this.factions = data['configs'].factions.data;
      this.packs = data['configs'].packs.data;
      this.sides = data['configs'].sides.data;
      // this.types = data['configs'].types.data.filter((t:any) => !t.is_subtype);
      this.types = data['configs'].types.data;
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
      this.sortBy = savedSortBy as 'faction' | 'title' | 'type' | 'faction cost' | 'cost' | 'set number';
      this.applySort();
    }

    this.cd.detectChanges();
  }

  toggleAttribution() {
    this.showAttribution = !this.showAttribution;
  }

  toggleTranslated() {
    this.filters.translated =
      this.filters.translated === 'none' ? 'only' : 'none';
    this.applyFilters();
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
      this.sortBy = 'faction cost';
    } else if (this.sortBy === 'faction cost') {
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
    const base = [...this.cards];

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

      case 'faction cost':
        this.cards = base.sort((a, b) =>
          (b.faction_cost || 0) - (a.faction_cost || 0)
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
        break;
    }
  }

  // CARD SELECTION

  public onCardClick(card: Card) {

    if (this.selectedCard && this.selectedCard.code === card.code) {
      this.cardZoomed = true
    } else {
      this.cardZoomed = false
    }
    this.selectedCard = card;
    this.scrollToSelected();
    console.log(this.selectedCard);
  }

  public scrollToSelected() {
    if (this.selectedCard?.code) {
      const element = document.getElementById(this.selectedCard.code);
      element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  onCardZoomEmitted(event: any) {
    this.cardZoomed = event;
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

  // Cost filter
  onChangeCostFilter(event: any) {
    const value = event.target.value;
    this.filters.cost = value === '' ? null : Number(value);
    this.applyFilters();
  }

  private applyFilters() {
    this.cards = this.allCards.filter(card => {
      if (
        this.filters.text &&
        !card.title.toLowerCase().includes(this.filters.text) &&
        !(
          card.translations &&
          card.translations[this.locale] &&
          card.translations[this.locale].title &&
          card.translations[this.locale].title.toLowerCase().includes(this.filters.text)
        )
      ) {
        return false;
      }
      if (this.filters.translated === 'only') {
        if (
          !card.translations ||
          !card.translations[this.locale] ||
          !card.translations[this.locale].title
        ) {
          return false;
        }
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
      if (
        this.filters.cost !== null &&
        card.cost !== this.filters.cost
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
      cost: null,
      translated: 'none'
    };

    this.sortBy = 'default';
    localStorage.removeItem('sortBy');

    this.cards = [...this.originalCards];
    this.selectedCard = null;
    this.cardZoomed = false;
  }

  public async showToApprove() {
    // Fetch not approved translations from Firebase
    const notApprovedTranslations = await this.cardService.getNotApprovedTranslationsCards(this.locale);

    // Create a map for faster lookup by card code
    const translationMap = new Map<string, any>();
    notApprovedTranslations.forEach(t => translationMap.set(t.code, t.translations));

    // Merge the translations into the existing cards
    this.cards = this.allCards.map(card => {
      const translationsForCard = translationMap.get(card.code);
      if (translationsForCard) {
        // Merge only the specific locale info into card.translations
        card.translations = {
          ...card.translations,
          [this.locale]: {
            ...card.translations?.[this.locale],
            ...translationsForCard[this.locale]
          }
        };
      }
      return card;
    });

    // Optionally, filter to show only cards with not approved translations
    this.cards = this.cards.filter(card =>
      card.translations &&
      card.translations[this.locale] &&
      card.translations[this.locale].approved === false
    );

    this.notification.notify($localize`Showing ${this.cards.length} cards with translations to approve.`);
    this.cd.detectChanges();
  }
}