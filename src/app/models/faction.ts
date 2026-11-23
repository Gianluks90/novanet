export interface Faction {
    id: string;
    name: string;
    side_id: string;
    is_mini?: boolean;
    is_neutral?: boolean;
    /** Hex color without '#'. Not provided by the API: filled from FACTION_COLORS. */
    color?: string;
}
