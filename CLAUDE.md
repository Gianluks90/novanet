# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Novanet is an Angular 21 single-page app: a card browser and deck builder for **Android: Netrunner** (the card game). Card/cycle/faction/pack/side/type data comes from the public NetrunnerDB API; user accounts, decks, and community card translations are stored in Firebase (Auth + Firestore). Card data is cached locally in IndexedDB via `idb` so the app doesn't refetch the full card set on every load.

## Commands

```bash
npm start            # ng serve — dev server at http://localhost:4200/ (English)
npm run startit       # ng serve --configuration=it — dev server in Italian locale
npm run build         # ng build --localize — production build, both locales, output to dist/
npm run watch         # ng build --watch --configuration development
npm test              # ng test — runs unit tests with Vitest
npm run host          # firebase deploy --only hosting
```

There is no lint script configured. There are currently no spec files in the repo; `ng generate` schematics are configured with `skipTests: true` project-wide, so new components/services do not scaffold a spec by default.

To run a single test file once specs exist, use Vitest's own filtering, e.g. `npx vitest run path/to/file.spec.ts`.

## Architecture

**Standalone components throughout.** There are no NgModules — every component declares its own `imports` array. Routes lazy-load components via `loadComponent()` (see [src/app/app.routes.ts](src/app/app.routes.ts)).

**Two data sources feed the app, joined at runtime:**
1. **NetrunnerDB public API** (`https://netrunnerdb.com/api/2.0/public/...`) — canonical card/cycle/faction/pack/side/type data, fetched once and cached.
2. **Firestore** — user accounts, decks, and a community-driven card-translation system layered on top of the NRDB card data.

**Card data bootstrap flow** (runs on the home route via router resolvers, in [src/app/resolvers/](src/app/resolvers/)):
- `cardsConfigResolver` fetches `cycles`, `factions`, `packs`, `sides`, `types` from NRDB on every load (small, static-ish reference data).
- `nrdbResolver` is the heavier one: on first run it bulk-fetches all cards from NRDB into IndexedDB (`nrdb` DB, stores `cards` and `meta`, opened in [src/app/db/nrdb-indexed-db.ts](src/app/db/nrdb-indexed-db.ts)) and marks `meta.installed`. On every run after that it reconciles **translations**: it compares a global translation version (`configs/translationsConfig` in Firestore) against a version cached in `localStorage`, and either bootstraps (full fetch of all approved translations) or incrementally merges only what changed — including a check for cards missing translations that a naive version-diff would skip. This logic lives across [nrdb-resolver.ts](src/app/resolvers/nrdb-resolver.ts) and [netrunner-db-service.ts](src/app/db/netrunner-db-service.ts); treat it as one unit when touching either file.
- `CardService.loadCards()` ([src/app/services/card-service.ts](src/app/services/card-service.ts)) then reads everything out of IndexedDB into an in-memory `$cardsMap` signal that components consume.

**Translation workflow** (also in `CardService`): a user submits a translation (`submitTranslation`) which writes an unapproved entry to `translations/{cardCode}` in Firestore; an admin approves it (`approveTranslation`), which atomically bumps a global version counter (`configs/translationsConfig.version`). Every non-admin client detects the version bump on next load and syncs down the delta via the bootstrap flow above. Do not add a new way to write translations without going through `setTranslation`/the version counter, or clients will silently miss the update.

**State management is signals-first**, not a store/NgRx. Services expose `signal`/`WritableSignal` state directly (e.g. `FirebaseService.$user`, `CardService.$cardsMap`, `DeckService.$decks`, `ThemeService` via `toSignal`), and components/effects react to those. Firestore reads mostly use `onSnapshot` for live updates rather than one-off `getDoc` where state needs to stay current.

**Auth** is Google Sign-In only ([src/app/services/auth-service.ts](src/app/services/auth-service.ts)), guarded by `AuthGuardService` on the `/decks` route tree. `FirebaseService` listens for `onAuthStateChanged`, ensures a `users/{uid}` Firestore doc exists, and mirrors it into the `$user` signal via a live snapshot listener.

**i18n**: Angular's built-in `$localize`/XLIFF i18n, not ngx-translate. Source strings are English; `src/locale/messages.it.xlf` holds Italian translations. `ng build --localize` produces both locale bundles; `LOCALE_ID` is injected where needed (e.g. to pick the translation language when talking to Firestore). This is a separate system from the card-text translation feature described above — don't conflate the two when working on either.

**Routing** uses hash location strategy (`withHashLocation()` in [src/app/app.config.ts](src/app/app.config.ts)), relevant for Firebase Hosting rewrites.

**Directory map**: `components/` (reusable pieces incl. `dialogs/` for Angular CDK/Material-style dialogs), `pages/` (routed views, some nested like `decks-page/decks-list-page` and `decks-page/deck-builder-page`), `services/` (injectable app state/business logic), `db/` (NRDB IndexedDB access), `models/` (plain TS interfaces mirroring Firestore/NRDB shapes), `pipes/` (display-formatting pipes for card fields — faction labels, icons, influence checks, etc.), `resolvers/` (route data preloading), `const/` (label maps and config constants), `ui/` (small presentational primitives re-exported from `ui/index.ts`), `environment/` (Firebase config).

## Conventions

- Components are generated with `style: scss` and a separate `.html` template file (not inline) — follow this split for new components rather than inlining templates/styles.
- Prettier is configured in `package.json`: 100-char width, single quotes, Angular parser for `.html` files.
- TypeScript is in `strict` mode with `strictTemplates`, `noPropertyAccessFromIndexSignature`, and `noImplicitOverride` enabled — respect these rather than widening types or using bracket-access workarounds to bypass them.
