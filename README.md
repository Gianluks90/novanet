# Novanet

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 21.0.3.

## Known issues / TODO

Tracked from a codebase review on 2026-07-17. Check items off as they're fixed.

### Security

- [x] Firestore rules were the wide-open default and had already expired (`request.time < 2026-01-18`), denying all reads/writes — replaced with per-collection rules (`users`, `decks`, `translations`, `configs`).
- [x] `translations` update rule allowed a non-admin to overwrite an already-approved translation back to `approved: false` — fixed by requiring `resource.data.translations.it.approved != true` for the non-admin branch.

### Translation / card-data sync reliability

- [x] `CardService.approveTranslation` incremented the global version counter but never stamped it onto `translations.[lang].version` — incremental sync (`version > localVersion`) silently missed most freshly-approved translations forever. Fixed: the new version is now written onto the translation entry itself.
- [x] The local NRDB card catalog was fetched once (`meta.installed` boolean) and never refreshed. Fixed: `nrdbResolver` now fetches the (lightweight) `packs` list on every load, compares a signature of pack codes against the one stored at last install, and re-downloads the full card set whenever it changed (new cycle/pack released) — no longer only on first visit.
- [x] The "missing cards" check re-read the **entire** approved-translations collection (full Firestore read cost) on every incremental sync, on top of the real incremental query. Now redundant thanks to the catalog-refresh fix above (which forces a full bootstrap instead when needed) — removed entirely from `nrdbResolver`'s incremental branch, cutting its Firestore reads roughly in half on every sync where anything changed.
- [x] ~~Add `limit`/pagination to `getAllApprovedTranslations`/`getApprovedTranslationsSinceVersion`~~ — **decided against**: Firestore bills 1 read per document returned regardless of whether it's fetched in one query or many small pages, so pagination wouldn't reduce total read cost, only add complexity. Not worth it while minimizing Firestore usage is the actual goal.
- [x] **Extra Firestore-read cleanup, in the same spirit.** `submitTranslation` used to do 2 reads of `configs/translationsConfig` per submission: one in `setTranslation` to stamp a `version` field that's meaningless while unapproved (every sync query filters `approved == true`, and `approveTranslation` overwrites it anyway once approved), and one in `updateGlobalTranslationStatus` just to lazily create the config doc if missing. Fixed: removed the pointless `version` stamp from `setTranslation`, and made `incrementGlobalTranslationVersion` self-initializing (`setDoc(..., {merge:true})` instead of `updateDoc`, which creates the doc with version 1 if it doesn't exist rather than requiring a separate exists-check). `updateGlobalTranslationStatus` is gone entirely. Net: submitting a translation is now 1 write, no reads at all (down from 2 reads + 1 write).

### Firebase data structure

Reviewed after a specific worry about how collections/subcollections were laid out. Verdict: there are no actual subcollections anywhere in the app (`users`, `decks`, `translations`, `configs` are all flat top-level collections) — that part is fine, and `translations`/`configs` are structured reasonably given there's no `cards` collection in Firestore to nest under (cards live only in NRDB + local IndexedDB). The real problem is collection **1** below: the same fact (which decks a user owns) is tracked in two places that are never reconciled.

- [x] **Dead, redundant, and unsynchronized data.** `users/{uid}.deckIds` was maintained via `arrayUnion`/`arrayRemove` on every `newDeck`/`deckRemove` call, but nothing in the app ever read it back. Fixed: removed entirely (`NovaUser`, `FirebaseService`, `DeckService.newDeck`/`deckRemove`) — `getDecksByUser()`'s `createdBy` query was already the real source of truth.
- [x] **Deck sharing, built for real.** `Deck.visibility` now does something: any signed-in user can read a `'public'` (listed in a new community gallery tab on the decks list page) or `'shared'` (unlisted, reachable only via direct link) deck — see `firestore.rules` (`decks` read rule), `DeckService.getPublicDecks`/`cloneDeck`, `decks-list-page` (My decks / Public gallery toggle), and `deck-builder-page` (owner gets a visibility panel + edit rights; non-owners get a read-only view with a "Copy to my account" button that clones the deck into their own account). Anonymous/logged-out viewing was explicitly decided against — the whole `/decks` tree stays behind `AuthGuardService`.
- [x] **Newly found while building the above, now fixed.** `DeckService.deckRemove` only ever flipped `visibility` to `'private'` — it never removed anything from `getDecksByUser()`'s results (that query filters by `createdBy` only), so "delete deck" never actually removed a deck from a user's own list. Confirmed intent was a real delete. Fixed: `deckRemove` now calls `deleteDoc` directly, and the Firestore `decks` rule now allows `delete` for the owner (`resource.data.createdBy == request.auth.uid`) instead of denying it outright.

### Deck builder — legalità del mazzo

- [x] **L'import da lista testo non rispettava `deck_limit`.** Fixed: `openImportExportDialog` in `deck-builder-page.ts` ora limita la quantità importata a `card.deck_limit` (o illimitata se il campo è assente/0), esattamente come il percorso "+1/+2/+3".
- [x] In `add-card-dialog.html`, una carta con `deck_limit` falsy (0/null/undefined) permetteva di aggiungerne solo 1 copia. Fixed: i bottoni "2"/"3" ora appaiono anche quando `deck_limit` è assente (trattato come "illimitato"), non solo quando è esplicitamente > 1/> 2.
- [x] `saveDeck()` non valida nulla prima di salvare (dimensione minima, limite di influenza, punti agenda). **Decisione presa**: resta così di proposito — si vuole poter salvare mazzi incompleti/bozze senza blocchi. Nessuna modifica necessaria.

### Code quality / maintenance

- [x] ~~Automated tests~~ — **won't do**: not a workflow you want to adopt/maintain, dropped from the list entirely (Vitest stays wired up via `npm test`, just no spec files will be added going forward).
- [x] ~~No linter (ESLint or otherwise) configured~~ — **won't do**: TypeScript strict mode is already doing that job well enough, no interest in adding another tool on top.
- [x] Dead/commented-out code cleaned up: `netrunner-db-service.ts` (commented-out `install`/`getAllCards`), `user-service.ts` (commented-out `changeUserNickname`), and stray `console.log`s removed from `deck-service.ts`, `translate-dialog.ts`, `cards-page.ts`, `header.ts` (whole now-empty `ngOnInit` removed too), and `deck-builder-page.ts`.
- [x] `LoadingPage` was imported in `app.ts` but not in its `imports` array, not routed anywhere, and its only template usage was commented out — removed (component files, import, and dead template comment).
- [x] `cardsConfigResolver` re-fetched `cycles`/`factions`/`packs`/`sides`/`types` from NetrunnerDB on every navigation, with no caching and no error handling. Fixed: results are now cached in IndexedDB (`meta.cardsConfig`) and only re-fetched when the pack-list signature changes (same signal `nrdbResolver` uses for the card catalog); a network failure now falls back to the cached data (even if stale) instead of breaking navigation. Also removed the duplicate `packs` fetch that existed alongside `nrdbResolver`'s own — both now share a `computePacksSignature` helper ([packs-signature.ts](src/app/resolvers/packs-signature.ts)).
- [x] `GetFactionColorPipe` and `GetFactionNamePipe` were unused anywhere — removed (`FactionLabelPipe` already covers this).
- [x] `KeywordLabelPipe`'s no-op `.replace('-', '-')` removed.

### Already fixed (this session)

- [x] `DeckService.deckRemove` wrote to `users/{deckId}` instead of `users/{currentUserUid}`, so removing a deck never actually updated the owner's `deckIds`.
- [x] `Promise.all([...])` in `DeckService.newDeck` / `deckRemove` wasn't awaited or returned, silently swallowing write errors.