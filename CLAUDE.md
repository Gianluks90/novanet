# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Novanet is an Angular 21 single-page app: a card browser and deck builder for **Android: Netrunner** (the card game). Card/cycle/faction/pack/side/type data comes from the public NetrunnerDB API; user accounts and decks are stored in Firebase (Auth + Firestore). Card data is cached locally in IndexedDB via `idb` so the app doesn't refetch the full card set on every load.

## Reference material

The complete, up-to-date game rules are available locally at `public/Null_Signal_Games_Netrunner_Comprehensive_Rules_v26.03.pdf` (Null Signal Games Comprehensive Rules v26.03). The file is gitignored and is large — don't read it by default; open it only (with the `pages` parameter) when a task actually depends on a rules question, e.g. deck legality, influence, or agenda points.

## Working agreements

- Do not start the dev server (`npm start` etc.) — the user runs it themselves to check changes.
- [README.md](README.md) doubles as the project TODO list; keep it updated when work is done or new items emerge.

## Commands

```bash
npm start            # ng serve — dev server at http://localhost:4200/ (English)
npm run build         # ng build — production build, output to dist/novanet/browser (single build, runtime i18n)
npm run sync:translations  # refresh public/translations/*.json from netrunner-cards-json (optionally: -- it fr)
npm run watch         # ng build --watch --configuration development
npm test              # ng test — runs unit tests with Vitest
npm run host          # firebase deploy --only hosting
```

There is no lint script configured. There are currently no spec files in the repo; `ng generate` schematics are configured with `skipTests: true` project-wide, so new components/services do not scaffold a spec by default.

To run a single test file once specs exist, use Vitest's own filtering, e.g. `npx vitest run path/to/file.spec.ts`.

## Architecture

**Standalone components throughout.** There are no NgModules — every component declares its own `imports` array. Routes lazy-load components via `loadComponent()` (see [src/app/app.routes.ts](src/app/app.routes.ts)).

**Two data sources feed the app, joined at runtime:**
1. **NetrunnerDB v3 API** (`https://api.netrunnerdb.com/api/v3/public/...`, JSON:API) — canonical card/cycle/faction/set/side/type data, all access centralized in [src/app/db/nrdb-api.ts](src/app/db/nrdb-api.ts) (pagination, sparse fieldsets, mapping to the app models) and cached in IndexedDB. The app models use the v3 field names: a `Card` is a v3 **printing** (`id` = 5-digit printing code, `card_id` = slug shared by reprints, `card_set_id`, `faction_id` with underscores like `haas_bioroid`, `card_type_id` where identities are `corp_identity`/`runner_identity`, `cost` is a string); `Pack` is a v3 card set.
2. **Firestore** — user accounts and decks. (The old community card-translation system was removed; card-text translations are being moved to static files from `netrunner-cards-json` — see the plan in README.md.)

**Card data bootstrap flow** (runs on the home route via router resolvers, in [src/app/resolvers/](src/app/resolvers/)):
- `cardsConfigResolver` provides `cycles`, `factions`, `packs`, `sides`, `types` as plain arrays (not `{data: []}`), cached in IndexedDB (`meta.cardsConfig`) and re-fetched only when the card-set signature changes; on network failure it falls back to the cache.
- `nrdbResolver` is the heavier one: it fetches the card-set list on every load (memoized, shared with `cardsConfigResolver`) and compares a signature (set ids + latest `updated_at`, see [packs-signature.ts](src/app/resolvers/packs-signature.ts)) with the one stored in IndexedDB (`nrdb` DB v3, stores `cards` and `meta`, opened in [src/app/db/nrdb-indexed-db.ts](src/app/db/nrdb-indexed-db.ts)); when it changed (or the cache is empty) it re-downloads all printings (~2.5k, parallel pages) into IndexedDB. On network failure it keeps using the cached cards.
- `CardService.loadCards()` ([src/app/services/card-service.ts](src/app/services/card-service.ts)) then reads everything out of IndexedDB into an in-memory `$cardsMap` signal that components consume.

**Card translations**: static files, not Firestore. `npm run sync:translations` ([scripts/sync-translations.mjs](scripts/sync-translations.mjs)) downloads the community translations from `Null-Signal-Games/netrunner-cards-json` into `public/translations/<lang>.json` (+ `index.json` with a content hash per language); re-run it when a new set is released and review the diff. `CardTranslationService` ([src/app/services/card-translation-service.ts](src/app/services/card-translation-service.ts)) lazily loads the file of the current language (cached in IndexedDB `meta` as `translations:<lang>`, refetched when the hash changes) and exposes `translation(cardId)` / `title(card)`; templates use the `cardTitle` pipe. Entries are keyed by printing id and are often partial (many have a title only), so always fall back to the English field. English has no file. Don't reintroduce Firestore writes for card text.

**State management is signals-first**, not a store/NgRx. Services expose `signal`/`WritableSignal` state directly (e.g. `FirebaseService.$user`, `CardService.$cardsMap`, `DeckService.$decks`, `ThemeService` via `toSignal`), and components/effects react to those. Firestore reads mostly use `onSnapshot` for live updates rather than one-off `getDoc` where state needs to stay current.

**Auth** is Google Sign-In only ([src/app/services/auth-service.ts](src/app/services/auth-service.ts)), guarded by `AuthGuardService` on the `/decks` route tree. `FirebaseService` listens for `onAuthStateChanged`, ensures a `users/{uid}` Firestore doc exists, and mirrors it into the `$user` signal via a live snapshot listener.

**i18n**: runtime translations, no Angular `$localize`/XLIFF and no `ng build --localize`. [src/app/i18n/](src/app/i18n/) holds `en.ts` (source of truth for the keys, `TranslationKey` type), `it.ts` (typed `Record<TranslationKey, string>`, so a missing Italian key is a compile error), `I18nService` (`lang` signal persisted in localStorage, `t(key, args)`; placeholders are positional `{0}`, `{1}`) and the impure `t` pipe. In templates use `{{ 'key' | t }}`, `{{ 'key' | t: [value] }}`, `[placeholder]="'key' | t"`, or `[innerHTML]="'key' | t"` for strings containing HTML; in TS use `inject(I18nService).t(...)`. Add every new UI string to both dictionaries. Components read the current language via `i18n.lang()` (several expose `locale` as a getter for `card.translations?.[locale]`). The label pipes (`factionLabel`, `typeLabel`, ...) read `lang()` and are impure for the same reason. The header menu switches language live; supported languages are listed in `SUPPORTED_LANGS`. Card-text translations (see above) are a separate concern from UI strings.

**Routing** uses hash location strategy (`withHashLocation()` in [src/app/app.config.ts](src/app/app.config.ts)), relevant for Firebase Hosting rewrites.

**Directory map**: `components/` (reusable pieces incl. `dialogs/` for Angular CDK/Material-style dialogs), `pages/` (routed views, some nested like `decks-page/decks-list-page` and `decks-page/deck-builder-page`), `services/` (injectable app state/business logic), `db/` (NRDB IndexedDB access), `models/` (plain TS interfaces mirroring Firestore/NRDB shapes), `pipes/` (display-formatting pipes for card fields — faction labels, icons, influence checks, etc.), `resolvers/` (route data preloading), `const/` (label maps and config constants), `ui/` (small presentational primitives re-exported from `ui/index.ts`), `environment/` (Firebase config).

## Conventions

- Components are generated with `style: scss` and a separate `.html` template file (not inline) — follow this split for new components rather than inlining templates/styles.
- Prettier is configured in `package.json`: 100-char width, single quotes, Angular parser for `.html` files.
- TypeScript is in `strict` mode with `strictTemplates`, `noPropertyAccessFromIndexSignature`, and `noImplicitOverride` enabled — respect these rather than widening types or using bracket-access workarounds to bypass them.
