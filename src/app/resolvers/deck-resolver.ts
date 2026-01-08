import { ResolveFn } from '@angular/router';
import { inject } from '@angular/core';
import { DeckService } from '../services/deck-service';
import { Deck } from '../models/deck';

export const deckResolver: ResolveFn<Deck | null> = (route) => {
  const deckService = inject(DeckService);
  const deckId = route.paramMap.get('id');

  if (!deckId) {
    return null;
  }

  return deckService.getDeckById(deckId);
};