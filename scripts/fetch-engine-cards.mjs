// Downloads the printings of a card set from NetrunnerDB v3 and writes the engine's static card
// file (src/app/engine/data/<set>.json): the fields of the app's `Card` model that the engine
// reads. Usage: node scripts/fetch-engine-cards.mjs [card_set_id]   (default: system_gateway)
import { writeFileSync } from 'node:fs';

const set = process.argv[2] ?? 'system_gateway';
const FIELDS = [
  'card_id', 'card_set_id', 'position', 'title', 'text', 'card_type_id', 'side_id', 'faction_id',
  'card_subtype_ids', 'cost', 'advancement_requirement', 'agenda_points', 'base_link',
  'deck_limit', 'influence_cost', 'influence_limit', 'memory_cost', 'minimum_deck_size',
  'strength', 'trash_cost', 'is_unique',
].join(',');
const url = new URL('https://api.netrunnerdb.com/api/v3/public/printings');
url.searchParams.set('fields[printings]', FIELDS);
url.searchParams.set('filter[card_set_id]', set);
url.searchParams.set('page[size]', '500');
const res = await fetch(url);
if (!res.ok) throw new Error(`HTTP ${res.status}`);
const json = await res.json();
const cards = json.data
  .map((r) => ({ id: r.id, ...r.attributes }))
  .sort((a, b) => a.position - b.position);
writeFileSync(new URL(`../src/app/engine/data/${set}.json`, import.meta.url), JSON.stringify(cards, null, 1) + '\n');
console.log(`${cards.length} printings written`);
