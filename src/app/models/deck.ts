import { Timestamp } from "firebase/firestore";
import { Faction } from "./faction";
import { Card } from "./card";

export interface Deck {
    id: string;
    side: 'corp' | 'runner';
    name: string;
    identity: Card;
    cards: Record<string, number>[];
    notes?: string;
    createdAt: Timestamp;
    updatedAt: Timestamp;
    createdBy: string;
    customBackImageURL?: string;
    visibility: 'private' | 'public' | 'shared';
}