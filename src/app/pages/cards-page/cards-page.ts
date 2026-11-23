import { ChangeDetectorRef, Component, effect, inject } from '@angular/core';
import { UiToggle } from '../../ui';
import { nrdbDb } from '../../db/nrdb-indexed-db';
import { Card } from '../../models/card';
import { ActivatedRoute, Route } from '@angular/router';
import { Cycle } from '../../models/cycle';
import { Faction } from '../../models/faction';
import { Pack } from '../../models/pack';
import { Side } from '../../models/side';
import { Type } from '../../models/type';
import { FormsModule } from '@angular/forms';
import { CardComponent, CardImageSize } from '../../components/card-component/card-component';
import { CardBack } from '../../components/card-back/card-back';
import { CardDetail } from '../../components/card-detail/card-detail';
import { FirebaseService } from '../../services/firebase-service';
import { NotificationService } from '../../services/notification-service';
import { FactionLabelPipe } from '../../pipes/faction-label-pipe';
import { TypeLabelPipe } from '../../pipes/type-label-pipe';
import { ZoomLevelLabelPipe } from '../../pipes/zoom-level-label-pipe';
import { SortByLabelPipe } from '../../pipes/sort-by-label-pipe';
import { CardService } from '../../services/card-service';
import { TranslatePipe } from '../../i18n/translate-pipe';
import { I18nService } from '../../i18n/i18n-service';
import { CardTranslationService } from '../../services/card-translation-service';

import { scrollToCenter } from '../../utils/scroll';

@Component({
  selector: 'app-cards-page',
  imports: [TranslatePipe, 
    FormsModule,
    CardComponent,
    CardBack,
    UiToggle,
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
  private i18n = inject(I18nService);
  private translations = inject(CardTranslationService);
  public get locale(): string { return this.i18n.lang(); }

  /** Thumbnail resolution matching the grid zoom (card widths: ~75-110px, 100-150px, 170-250px, 220px+). */
  public get thumbnailSize(): CardImageSize {
    switch (this.zoomLevel) {
      case 'small-size': return 'small';
      case 'standard-size': return 'medium';
      default: return 'large';
    }
  }

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
    // Translations load lazily: re-apply the filters (title search / "translated only") once they are in.
    effect(() => {
      this.translations.revision();
      if (this.allCards.length) {
        this.applyFilters();
        this.cd.detectChanges();
      }
    });

    this.route.data.subscribe(data => {
      this.cycles = data['configs'].cycles;
      this.factions = data['configs'].factions;
      this.packs = data['configs'].packs;
      this.sides = data['configs'].sides;
      // this.types = data['configs'].types.filter((t:any) => !t.is_subtype);
      this.types = data['configs'].types;
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

  setTranslatedOnly(only: boolean) {
    this.filters.translated = only ? 'only' : 'none';
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
          (a.faction_id || '').localeCompare(b.faction_id || '')
        );
        break;

      case 'type':
        this.cards = base.sort((a, b) =>
          (a.card_type_id || '').localeCompare(b.card_type_id || '')
        );
        break;

      case 'faction cost':
        this.cards = base.sort((a, b) =>
          (b.influence_cost || 0) - (a.influence_cost || 0)
        );
        break;

      case 'cost':
        this.cards = base.sort((a, b) =>
          (Number(a.cost) || 0) - (Number(b.cost) || 0)
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

    if (this.selectedCard && this.selectedCard.id === card.id) {
      this.cardZoomed = true
    } else {
      this.cardZoomed = false
    }
    this.selectedCard = card;
    this.scrollToSelected();
  }

  public scrollToSelected() {
    if (this.selectedCard?.id) {
      const element = document.getElementById(this.selectedCard.id);
      scrollToCenter(element);
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
        !this.translations.translation(card.id)?.title?.toLowerCase().includes(this.filters.text)
      ) {
        return false;
      }
      if (this.filters.translated === 'only') {
        if (!this.translations.translation(card.id)?.title) {
          return false;
        }
      }
      if (
        this.filters.pack !== 'all' &&
        card.card_set_id !== this.filters.pack
      ) {
        return false;
      }
      if (
        this.filters.faction !== 'all' &&
        card.faction_id !== this.filters.faction
      ) {
        return false;
      }
      if (
        this.filters.side !== 'all' &&
        card.side_id !== this.filters.side
      ) {
        return false;
      }
      if (
        this.filters.type !== 'all' &&
        card.card_type_id !== this.filters.type
      ) {
        return false;
      }
      if (
        this.filters.cost !== null &&
        Number(card.cost) !== this.filters.cost
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
}
