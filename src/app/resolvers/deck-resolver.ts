import { ResolveFn } from '@angular/router';
import { inject } from '@angular/core';
import { DeckService } from '../services/deck-service';
import { Deck } from '../models/deck';

export const deckResolver: ResolveFn<Deck | null> = async (route) => {
  const deckService = inject(DeckService);
  const deckId = route.paramMap.get('id');

  if (!deckId) {
    return null;
  }

  try {
    return await deckService.getDeckById(deckId);
  } catch (err) {
    // Firestore rules answer permission-denied for a deck that doesn't exist or isn't visible to us.
    console.warn('[deckResolver] deck not available', err);
    return null;
  }
};