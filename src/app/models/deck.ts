import { Timestamp } from "firebase/firestore";
import { Faction } from "./faction";
import { Card } from "./card";

export interface Deck {
    id: string;
    side: 'corp' | 'runner';
    name: string;
    identity: Card;
    cards: Record<string, number>;
    format: string;
    notes?: string;
    createdAt: Timestamp;
    updatedAt: Timestamp;
    /** Owner uid for online decks; the literal 'local' for decks stored on this device. */
    createdBy: string;
    /** Runtime flag (never stored): the deck lives on this device, not in Firestore. */
    local?: boolean;
    customBackImageURL?: string;
    visibility: 'private' | 'public' | 'shared';
    deckStatistics?: DeckStatistics;
}

interface DeckStatistics {
    wins: number;
    losses: number;
    draws: number;
    totalGames: number;
    winRate: number;
}