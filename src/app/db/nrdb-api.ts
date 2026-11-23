import { Card } from '../models/card';
import { Cycle } from '../models/cycle';
import { Faction } from '../models/faction';
import { Pack } from '../models/pack';
import { Side } from '../models/side';
import { Type } from '../models/type';
import { FACTION_COLORS } from '../const/factionColors';

/** Single entry point for NetrunnerDB (v3, JSON:API). */
export const NRDB_API_URL = 'https://api.netrunnerdb.com/api/v3/public';

const PAGE_SIZE = 1000;

// Only the printing attributes the app uses (the full records are ~4x bigger).
const PRINTING_FIELDS = [
  'card_id', 'card_set_id', 'card_cycle_id', 'position', 'quantity', 'flavor', 'illustrator_names',
  'title', 'stripped_title', 'text', 'stripped_text',
  'card_type_id', 'side_id', 'faction_id', 'card_subtype_ids', 'display_subtypes',
  'cost', 'advancement_requirement', 'agenda_points', 'base_link', 'deck_limit',
  'influence_cost', 'influence_limit', 'memory_cost', 'minimum_deck_size', 'strength',
  'trash_cost', 'is_unique',
].join(',');

interface JsonApiResource {
  id: string;
  attributes: Record<string, any>;
}

interface JsonApiPage {
  data: JsonApiResource[];
  meta?: { stats?: { total?: { count?: number } } };
}

async function fetchPage(endpoint: string, params: Record<string, string>): Promise<JsonApiPage> {
  const url = new URL(`${NRDB_API_URL}/${endpoint}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`NRDB fetch failed for ${endpoint}: ${res.status}`);
  }
  return res.json();
}

/** Fetches every resource of an endpoint, loading the remaining pages in parallel. */
async function fetchAll(endpoint: string, params: Record<string, string> = {}): Promise<JsonApiResource[]> {
  const base = { ...params, 'page[size]': String(PAGE_SIZE), 'stats[total]': 'count' };
  const first = await fetchPage(endpoint, { ...base, 'page[number]': '1' });
  const total = first.meta?.stats?.total?.count ?? first.data.length;
  const pages = Math.ceil(total / PAGE_SIZE);
  if (pages <= 1) return first.data;

  const rest = await Promise.all(
    Array.from({ length: pages - 1 }, (_, i) =>
      fetchPage(endpoint, { ...base, 'page[number]': String(i + 2) }))
  );
  return [first, ...rest].flatMap(p => p.data);
}

// ---- mappers -------------------------------------------------------------

const toCard = (r: JsonApiResource): Card => ({ id: r.id, ...r.attributes } as Card);

const toPack = (r: JsonApiResource): Pack => ({
  id: r.id,
  name: r.attributes['name'],
  card_cycle_id: r.attributes['card_cycle_id'],
  date_release: r.attributes['date_release'],
  position: r.attributes['position'],
  size: r.attributes['size'],
  updated_at: r.attributes['updated_at'],
});

const toCycle = (r: JsonApiResource): Cycle => ({
  id: r.id,
  name: r.attributes['name'],
  position: r.attributes['position'],
  date_release: r.attributes['date_release'],
});

const toFaction = (r: JsonApiResource): Faction => ({
  id: r.id,
  name: r.attributes['name'],
  side_id: r.attributes['side_id'],
  is_mini: r.attributes['is_mini'],
  is_neutral: r.id.startsWith('neutral'),
  color: FACTION_COLORS[r.id],
});

const toNamed = (r: JsonApiResource): Side | Type => ({ id: r.id, name: r.attributes['name'] });

// ---- public API ----------------------------------------------------------

export interface CardsConfig {
  cycles: Cycle[];
  factions: Faction[];
  packs: Pack[];
  sides: Side[];
  types: Type[];
}

let cardSetsPromise: Promise<Pack[]> | null = null;
let cardSetsFetchedAt = 0;

/**
 * The (small) list of card sets, used both as data and as the "is our cache stale"
 * signal. Memoized for a few minutes so the two resolvers share a single request.
 */
export function fetchCardSets(): Promise<Pack[]> {
  const now = Date.now();
  if (!cardSetsPromise || now - cardSetsFetchedAt > 5 * 60 * 1000) {
    cardSetsFetchedAt = now;
    cardSetsPromise = fetchAll('card_sets')
      .then(rows => rows.map(toPack).sort((a, b) => (a.position ?? 0) - (b.position ?? 0)))
      .catch(err => { cardSetsPromise = null; throw err; });
  }
  return cardSetsPromise;
}

export async function fetchCards(): Promise<Card[]> {
  const rows = await fetchAll('printings', { 'fields[printings]': PRINTING_FIELDS });
  return rows.map(toCard);
}

/** Everything except card sets and cards: cycles, factions, sides, types. */
export async function fetchReferenceData(): Promise<Omit<CardsConfig, 'packs'>> {
  const [cycles, factions, sides, types] = await Promise.all([
    fetchAll('card_cycles'),
    fetchAll('factions'),
    fetchAll('sides'),
    fetchAll('card_types'),
  ]);
  return {
    cycles: cycles.map(toCycle).sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
    factions: factions.map(toFaction).sort((a, b) => a.name.localeCompare(b.name)),
    sides: sides.map(toNamed) as Side[],
    types: (types.map(toNamed) as Type[]).sort((a, b) => a.name.localeCompare(b.name)),
  };
}
