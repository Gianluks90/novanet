/** A NetrunnerDB v3 "card set" (what NRDB 2.0 called a pack). */
export interface Pack {
    id: string;
    name: string;
    card_cycle_id?: string;
    date_release?: string;
    position?: number;
    size?: number;
    updated_at?: string;
}
