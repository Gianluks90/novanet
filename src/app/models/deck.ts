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
    /**
     * Original author, kept through copies: `createdBy` is whoever owns *this* copy, these two
     * always point to who first created the deck. Required for a deck to be public.
     */
    originalAuthorId?: string;
    /** Display name of the original author at creation time (user docs are private, so it is stored here). */
    originalAuthorName?: string;
    /** Id of the deck this one was copied from. */
    clonedFrom?: string;
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