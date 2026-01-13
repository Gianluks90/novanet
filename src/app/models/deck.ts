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
    createdBy: string;
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