// Pulls the community card translations from Null-Signal-Games/netrunner-cards-json
// and writes one merged file per language into public/translations/.
//
//   npm run sync:translations                 -> all languages in LANGS
//   npm run sync:translations -- it fr        -> only the given languages
//
// Output (committed to the repo, served as static assets, loaded lazily by the app):
//   public/translations/<lang>.json   { "<printing id>": { title, text, flavor?, keywords? }, ... }
//   public/translations/index.json    per-language content hash + card count + source commit
//
// Re-run when a new set is released (or translations are updated upstream) and review the diff.
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ID = 57200509; // Null-Signal-Games/netrunner-cards-json (stable across renames)
const RAW_BASE = 'https://raw.githubusercontent.com/Null-Signal-Games/netrunner-cards-json';
const LANGS = ['it', 'de', 'fr', 'es', 'pl', 'ja', 'ko', 'zh-hans']; // languages with real coverage
const CONCURRENCY = 8;

const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'translations');
const requested = process.argv.slice(2);
const langs = requested.length ? requested : LANGS;

async function getJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'novanet-sync-translations' } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.json();
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: limit }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }));
  return results;
}

// Tip of the default branch; every later download is pinned to this exact commit.
const [commit] = await getJson(`https://api.github.com/repositories/${REPO_ID}/commits?per_page=1`);
const tree = await getJson(`https://api.github.com/repositories/${REPO_ID}/git/trees/${commit.sha}?recursive=1`);
if (tree.truncated) throw new Error('GitHub tree listing was truncated');

await mkdir(outDir, { recursive: true });
let index = {};
try { index = JSON.parse(await readFile(path.join(outDir, 'index.json'), 'utf8')).languages ?? {}; } catch { /* first run */ }

for (const lang of langs) {
  const prefix = `translations/${lang}/pack/`;
  const files = tree.tree.filter(n => n.type === 'blob' && n.path.startsWith(prefix) && n.path.endsWith('.json'));
  if (!files.length) { console.warn(`[${lang}] no card translation files found, skipped`); continue; }

  const packs = await mapLimit(files, CONCURRENCY, f => getJson(`${RAW_BASE}/${commit.sha}/${f.path}`));

  const cards = {};
  for (const entry of packs.flat()) {
    if (!entry?.code || !entry.title) continue;
    const t = { title: entry.title, text: entry.text ?? '' };
    if (entry.flavor) t.flavor = entry.flavor;
    if (entry.keywords) t.keywords = entry.keywords;
    cards[entry.code] = t;
  }

  const sorted = Object.fromEntries(Object.keys(cards).sort().map(k => [k, cards[k]]));
  const body = JSON.stringify(sorted);
  const hash = createHash('sha1').update(body).digest('hex').slice(0, 10);
  await writeFile(path.join(outDir, `${lang}.json`), body + '\n');
  index[lang] = { hash, cards: Object.keys(sorted).length, packs: files.length };
  console.log(`[${lang}] ${files.length} pack files, ${index[lang].cards} cards, hash ${hash}, ${(body.length / 1024).toFixed(0)} kB`);
}

const sortedIndex = Object.fromEntries(Object.keys(index).sort().map(k => [k, index[k]]));
await writeFile(path.join(outDir, 'index.json'), JSON.stringify({
  source: 'https://github.com/Null-Signal-Games/netrunner-cards-json',
  sourceCommit: commit.sha,
  languages: sortedIndex,
}, null, 2) + '\n');
console.log(`index.json written (source commit ${commit.sha.slice(0, 8)})`);
