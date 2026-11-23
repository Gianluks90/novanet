<!--
Draft issue for https://github.com/Null-Signal-Games/netrunner-cards-json/issues/new
Not posted yet. Facts were checked against the upstream repo on 2026-11-23 (main @ 92d6c9a):
re-check the numbers before posting. Post it from your own GitHub account.
-->

**Title:** Italian translations: which layout should new contributions target (`translations/` vs `v2/translations/`)?

---

Hi, and thanks for maintaining this data!

I'd like to contribute Italian card translations for the sets that are still missing, and before opening any PR I'd like to make sure I follow the layout and conventions you want.

**What I found (main branch)**

- Legacy layout: `translations/it/pack/<set>.it.json` has 50 files (the base `pack/` folder has 75 sets), covering 554 printings in total. Other languages are in similar shape, and legacy files are still being edited (e.g. the French PRs of May/June 2026).
- New layout: `v2/translations/it/` was seeded in July 2026 ("V2 translation prep", "Seed v2 translation files"). It has `cards/<card_id>.json` (427 files, against 2054 cards in `v2/cards/`; 308 of them have a `title`, 119 have `"title": null`) and `printings/<set>.json` (8 files, `flavor` only).
- Neither the README nor a CONTRIBUTING file describes how translations should be contributed.

**Questions**

1. For new or updated Italian translations, which layout should a PR target: legacy `translations/`, `v2/translations/`, or both? Is the legacy folder going to be generated from (or replaced by) `v2/`?
2. In `v2/translations/<lang>/cards/*.json`, I understand `"title": null` means "not translated yet" and the English `text` is a placeholder. Is it correct that a translator should replace `title`/`text` and leave anything else untouched? What about `flavor` (it lives in `printings/`)?
3. Are there conventions I should follow for card text (`[credit]`-style tokens, `<strong>` for subtypes, line breaks) and any glossary or reference for Italian game terminology?
4. Preferred PR granularity (one set per PR?) and the checks I should run locally before opening one (I see `format-check`, `lint`, `build` and `test` in CI).
5. Translation provenance: I'd only submit text reviewed by a native Italian speaker. If I use an AI-assisted first draft that is then reviewed and corrected by hand, is that acceptable to you, or would you rather have fully manual translations?

If it helps, I'm happy to start with a single small set as a pilot PR so you can check the format before I do more.

Thanks!
