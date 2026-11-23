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

**Formats and deck validation**: `FormatService` ([src/app/services/format-service.ts](src/app/services/format-service.ts)) loads NetrunnerDB's formats (`fetchFormats` in `nrdb-api.ts`): for each one its *latest snapshot by date* (not the API's `active` flag, which lags) gives the card pool (`card_set_ids`: a card is playable if any printing is in those sets) and the restriction list in force (banned, restricted, Eternal points, universal faction cost). They are cached in IndexedDB `meta.formats` and refreshed when `fetchFormatsSignature()` changes. `utils/deck-validation.ts` (`validateDeck`) checks a deck against the basic rules (size, influence, agenda points, copies, side) and, for a format, its pool and list; the NetrunnerDB API has no validation endpoint. `Deck.format` is a NetrunnerDB format id or `casual` (no rules); `Deck.legalFormats` (+ `legalFormatsBasis` = `FormatService.signature`) is saved with the deck when it is saved, created or imported, and the decks list recomputes it in memory when the lists changed since. Not covered: deck building restrictions written in an identity's text, and the old `global_penalty` list type.

**Card translations**: static files, not Firestore. `npm run sync:translations` ([scripts/sync-translations.mjs](scripts/sync-translations.mjs)) downloads the community translations from `Null-Signal-Games/netrunner-cards-json` into `public/translations/<lang>.json` (+ `index.json` with a content hash per language); re-run it when a new set is released and review the diff. `CardTranslationService` ([src/app/services/card-translation-service.ts](src/app/services/card-translation-service.ts)) lazily loads the file of the current language (cached in IndexedDB `meta` as `translations:<lang>`, refetched when the hash changes) and exposes `translation(cardId)` / `title(card)`; templates use the `cardTitle` pipe. Personal translations written by the user (dialog in card detail → menu, export/import in settings) are stored in a separate IndexedDB database `novanet-user` and override the official ones field by field (precedence: personal > official file > English). Official entries are keyed by printing id and are often partial (many have a title only), so always fall back to the English field. English has no file. Don't reintroduce Firestore writes for card text.

**State management is signals-first**, not a store/NgRx. Services expose `signal`/`WritableSignal` state directly (e.g. `FirebaseService.$user`, `CardService.$cardsMap`, `DeckService.$decks`, `ThemeService` via `toSignal`), and components/effects react to those. Firestore reads mostly use `onSnapshot` for live updates rather than one-off `getDoc` where state needs to stay current.

**Auth** is optional: email + password and Google Sign-In, both handled by [src/app/services/auth-service.ts](src/app/services/auth-service.ts); login is only needed where Firestore is involved (online decks, sharing/gallery, profile, later the game engine). There is no route guard. Every "sign in / register" button calls `AuthService.signIn()`, which opens the `AuthDialog` ([src/app/components/dialogs/auth-dialog/](src/app/components/dialogs/auth-dialog/): sign in / register / password reset modes plus a Google button) and resolves to `true` when the user ends up signed in; the dialog and the service map Firebase error codes to translation keys (`authDialog.error*`). Registration stores the display name in the auth profile and, through `FirebaseService.pendingDisplayName`, in the Firestore profile (which `onAuthStateChanged` creates before `updateProfile` runs) and sends a verification email, and verification is only enforced for making a deck public (`firestore.rules`, `publicNeedsVerifiedEmail`; the deck builder checks it first). `AuthService.info` is a signal with the account's email, verification state and sign-in methods; `AuthService.openAccount()` opens `AccountDialog` (verification, change/set password, account deletion, which removes the user's online decks and profile before the auth account). Accounts that share an email are merged by Firebase (console setting). `FirebaseService` listens for `onAuthStateChanged` (resets `$user` and unsubscribes the profile listener on sign-out), ensures a `users/{uid}` Firestore doc exists, and mirrors it into the `$user` signal via a live snapshot listener.

**Decks live in two places** ([src/app/services/deck-service.ts](src/app/services/deck-service.ts)): on this device (IndexedDB `novanet-user` → `decks`, `deck.local === true`, `createdBy === 'local'`, works signed out) or online (Firestore `decks`). `DeckService` methods take a deck id and handle both (local first); `$myDecks` merges them; `uploadLocalDeck` moves a local deck to the account as private. `Deck.local` is a runtime flag and is never written to Firestore. **Authorship**: `createdBy` is the owner of *this copy*; `originalAuthorId`/`originalAuthorName` always point to whoever first created the deck and are kept through `cloneDeck` (which also sets `clonedFrom`); a deck can only be public if the original author is known. The Firestore rules enforce this (author immutable, copies must match their source). The gallery/builder show the original author when it is not the viewer. The `novanet-user` DB ([src/app/db/user-indexed-db.ts](src/app/db/user-indexed-db.ts)) also holds personal translations: user data must never be stored in the wipeable `nrdb` DB.

**i18n**: runtime translations, no Angular `$localize`/XLIFF and no `ng build --localize`. [src/app/i18n/](src/app/i18n/) holds `en.ts` (source of truth for the keys, `TranslationKey` type), `it.ts` (typed `Record<TranslationKey, string>`, so a missing Italian key is a compile error), `I18nService` (`lang` signal persisted in localStorage, `t(key, args)`; placeholders are positional `{0}`, `{1}`) and the impure `t` pipe. In templates use `{{ 'key' | t }}`, `{{ 'key' | t: [value] }}`, `[placeholder]="'key' | t"`, or `[innerHTML]="'key' | t"` for strings containing HTML; in TS use `inject(I18nService).t(...)`. Add every new UI string to both dictionaries. Components read the current language via `i18n.lang()` (several expose `locale` as a getter for `card.translations?.[locale]`). The label pipes (`factionLabel`, `typeLabel`, ...) read `lang()` and are impure for the same reason. The settings dialog switches language live; supported languages are listed in `SUPPORTED_LANGS`. Card-text translations (see above) are a separate concern from UI strings.

**Routing** uses hash location strategy (`withHashLocation()` in [src/app/app.config.ts](src/app/app.config.ts)), relevant for Firebase Hosting rewrites.

**Directory map**: `components/` (reusable pieces incl. `dialogs/` for Angular CDK/Material-style dialogs), `pages/` (routed views, some nested like `decks-page/decks-list-page` and `decks-page/deck-builder-page`), `services/` (injectable app state/business logic), `db/` (NRDB IndexedDB access), `models/` (plain TS interfaces mirroring Firestore/NRDB shapes), `directives/` (e.g. `appCardTilt`, pointer-follow 3D tilt that only sets CSS variables), `pipes/` (display-formatting pipes for card fields — faction labels, icons, influence checks, etc.), `resolvers/` (route data preloading), `const/` (label maps and config constants), `ui/` (small presentational primitives re-exported from `ui/index.ts`), `environment/` (Firebase config).

## Design system

Live style guide at `#/design-system` (lazy route, not linked from the UI): tokens, typography, spacing and every shared component in the current theme. Keep it up to date when you add or change a shared piece.

- **Tokens**: [src/styles/_tokens.scss](src/styles/_tokens.scss) (spacing `--space-1..6`, radius, type scale, motion, elevation, `--control-height`, plus `--border-color`, `--border-muted`, `--surface-hover`, `--surface-active`, `--on-accent`). The accent is one of 5 presets per theme ([const/accent-colors.ts](src/app/const/accent-colors.ts)); `ThemeService.setAccent()` applies it, keeps it in localStorage and in the profile (`accentColors`, by preset id). Theme colors (`--accent-color`, `--fg-color`, `--bg-color`, `--bg-container-color`, muted variants) are still set on `<body>` by the `.light`/`.dark` classes and `ThemeService`; tokens derived from them must be declared on `body`, not `:root`. Use tokens, not raw colors/pixels/durations, in new styles.
- **Foundation**: [src/styles/_base.scss](src/styles/_base.scss) — visible keyboard focus (`:focus-visible`; never remove outlines), checkbox/radio/placeholder/disabled basics, global `prefers-reduced-motion`. Form field look (input/select/textarea, `form.form-container > .form-group`) is in `styles.scss`.
- **Shared components** (`src/app/ui/`, exported from `ui/index.ts`): `app-ui-button` (text button), `app-ui-icon-button` (icon-only, **required `label`** = accessible name + tooltip, `link` renders an anchor), `app-ui-segmented` (one-of-few choice; options are `{value, label: TranslationKey, icon?, color?}`; `color` turns segments into swatches, `fill` makes it full width), `app-ui-toggle` (on/off, `label` is a TranslationKey), `app-ui-badge` (status chip), `app-ui-stepper` (− / + quantity; the parent owns value and limits), `app-ui-dialog-container`, `app-ui-image-container`. Clickable things must be real `button`/`a` elements: use these instead of a `span` with `(click)`.
- **Menus**: global `.ui-menu` / `.ui-menu-title` / `.ui-menu-item` classes ([src/styles/_menu.scss](src/styles/_menu.scss)) on top of the CDK menu (`cdkMenuTriggerFor`, `cdkMenu`, `cdkMenuItem`) — don't hand-roll dropdowns. The header ([header.ts](src/app/components/header/header.ts)) has the main navigation (Cards, Decks, Play), a settings button and the account menu (sign in button when signed out; avatar → account / sign out). Language, theme and accent color live in the settings dialog. The settings dialog opens from anywhere via `SettingsService.open()`.
- **Unsaved changes**: a page that can hold unsaved edits implements `HasUnsavedChanges` ([src/app/guards/unsaved-changes-guard.ts](src/app/guards/unsaved-changes-guard.ts)), is routed with `canDeactivate: [unsavedChangesGuard]`, and should also handle `window:beforeunload` (see the deck builder). `ConfirmDialog` takes optional `{title, message, confirmLabel}` translation keys as dialog data.
- Visual identity: terminal/cyberpunk — 1px accent borders, uppercase labels, sharp 90° corners everywhere (no cut/clipped corners; rounding only on small controls), accent fills on hover/selection, Genos font.

## Conventions

- Components are generated with `style: scss` and a separate `.html` template file (not inline) — follow this split for new components rather than inlining templates/styles.
- Prettier is configured in `package.json`: 100-char width, single quotes, Angular parser for `.html` files.
- TypeScript is in `strict` mode with `strictTemplates`, `noPropertyAccessFromIndexSignature`, and `noImplicitOverride` enabled — respect these rather than widening types or using bracket-access workarounds to bypass them.
