import { Injectable, signal } from '@angular/core';
import { CardObject } from '../../engine/types';

/**
 * The card the pointer is over, shared by the cards of one board (the board provides it, the cards
 * set it) so the board can show it large. Cards outside a board simply have nothing to tell.
 */
@Injectable()
export class GamePreview {
  public readonly object = signal<CardObject | null>(null);
}
