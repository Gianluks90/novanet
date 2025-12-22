import { Component, effect, input, output } from '@angular/core';
import { Card } from '../../models/card';
import { FormsModule } from '@angular/forms';
import { NrIconsPipe } from '../../pipes/nr-icons-pipe';
import { PackCodePipe } from '../../pipes/pack-code-pipe';
import { Pack } from '../../models/pack';
import { UIButton } from '../../ui';

@Component({
  selector: 'app-card-detail',
  imports: [
    FormsModule,
    NrIconsPipe,
    PackCodePipe,
    UIButton
  ],
  templateUrl: './card-detail.html',
  styleUrl: './card-detail.scss',
})
export class CardDetail {
  public selectedCard = input<Card | null>(null);
  public packs = input<Pack[]>([]);
  public zoomCardEmit = output<boolean>();

  constructor() {
    effect(() => {
      if (this.selectedCard()) {
        this.initFactionCostArray();
      }
    })
  }

  public factionCostArray: any[] = [];
  private initFactionCostArray() {
    const cost = this.selectedCard()?.faction_cost || 0;
    if (cost && cost > 0) {
      this.factionCostArray = Array(5).fill(false).map((_, i) => i < cost);
    }
  }

  public scrollToSelected() {
    if (this.selectedCard()?.code) {
      const element = document.getElementById(this.selectedCard()?.code || '');
      element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  // public cardZoomed: boolean = false;
  public zoomCard() {
    // this.cardZoomed = true;
    this.zoomCardEmit.emit(true);
  }
}
