# 41 — i18n completion

> Part of the three.ws "Production → $1B" program. Run in a fresh chat. Read
> `/CLAUDE.md` first (its rules override everything) and `prompts/billion-dollar-program/00-README.md`
> for shared context.

## Why this matters for $1B

A billion-dollar platform is global. Most of the world's builders and traders do not
read English, and the markets where 3D + on-chain adoption grows fastest are not
English-first. The i18n machinery already exists (extract → translate → lint, runtime
locale swap, a `<lang-switcher>` element), but coverage is thin — only `en` and `es`
catalogs ship, and hardcoded strings leak everywhere. Finishing i18n unlocks entire
regions at near-zero marginal cost.

## Mission

Get full user-facing string extraction and translation coverage, working locale
switching with RTL and locale-aware number/date/currency formatting, and zero hardcoded
user-facing strings on the primary surfaces.

## Map (trust but verify — files move)

- **i18n config** — [.i18nrc.json](../../.i18nrc.json) (entry, entryLocale, output dir,
  outputLocales, localeNames), schema at
  [scripts/i18n-rc.schema.json](../../scripts/i18n-rc.schema.json).
- **Pipeline scripts** — [scripts/i18n-extract.mjs](../../scripts/i18n-extract.mjs)
  (`npm run i18n:extract`), [scripts/i18n-translate.mjs](../../scripts/i18n-translate.mjs)
  (`npm run i18n:translate`, and `--lint` → `npm run i18n:lint`). Combined:
  `npm run i18n`.
- **Locale catalogs** — [public/locales/](../../public/locales) (`en.json`, `es.json`,
  `manifest.json` — the `manifest.locales[]` list each with `code`, `name`, `dir`).
- **Runtime i18n** — [src/i18n.js](../../src/i18n.js) (client-side locale swap, fetches
  `/locales/<code>.json`, sets `document.documentElement.dir`, dispatches `i18n:change`,
  defines `<lang-switcher>`).
- **Surfaces to cover** — `pages/*.html` (~168) and `src/` modules; start with the
  conversion-critical ones (home, forge, pricing, marketplace, docs landing, wallet).

## Do this

1. **Run the pipeline and read the lint output.** `npm run i18n:extract` then
   `npm run i18n:lint` to see missing/extra keys per locale and the current coverage gap.
   This is your worklist.
2. **Find hardcoded user-facing strings.** Grep the high-traffic `pages/*.html` and `src/`
   modules for literal English in markup/JS that isn't going through the i18n key system.
   Wrap them with the project's translation mechanism (match how `src/i18n.js` consumers
   already do it). Prioritize the conversion funnel surfaces first.
3. **Expand target locales.** Add a sensible set of high-impact locales to
   `.i18nrc.json` `outputLocales` + `localeNames` and the `manifest.json` `locales[]`
   (include at least one RTL locale, e.g. `ar`, with `dir: "rtl"`). Run
   `npm run i18n:translate` to generate the catalogs against the real translation provider
   — no hand-faked translations, no machine-gibberish left unreviewed for key terms.
4. **Locale switching works end-to-end.** Verify `<lang-switcher>` appears when ≥2 locales
   exist, swaps the catalog at runtime without a full reload, persists the choice, and
   updates `document.documentElement.dir`. Test on home + forge in a real browser.
5. **RTL correctness.** With an RTL locale active, audit layout: logical CSS properties
   (`margin-inline`, `text-align: start`), mirrored icons/arrows where appropriate, and no
   broken flex/grid direction. Fix the worst offenders on the primary surfaces.
6. **Locale-aware formatting.** Replace ad-hoc number/date/currency string-building with
   `Intl.NumberFormat` / `Intl.DateTimeFormat` keyed off the active locale (counts, prices,
   timestamps, $THREE amounts). No `toFixed`-then-concat money formatting.
7. **Don't break the brand or the coin.** "three.ws" and "$THREE" stay verbatim across
   locales (mark them as non-translatable terms); never let a translation invent a coin.
8. Run `npm run i18n:lint` (must pass), exercise locales in the browser, add a
   `data/changelog.json` entry (tag `improvement`) for the new languages, and
   `npm run build:pages`.

## Must-not

- Do not hand-write or fake translations to pass the lint — generate them through the real
  `i18n:translate` provider.
- Do not leave hardcoded user-facing English on the primary conversion surfaces.
- Do not translate "three.ws", "$THREE", or the contract address; keep brand/coin verbatim.
- Do not ship an RTL locale that visibly breaks layout on home/forge/pricing.
- Do not introduce a second i18n system — extend the existing `src/i18n.js` + scripts.

## Acceptance (all true before claiming done)

- [ ] `npm run i18n:lint` passes with no missing/extra keys across all configured locales.
- [ ] No hardcoded user-facing strings remain on the primary funnel surfaces (home, forge,
      pricing, marketplace, wallet, docs landing).
- [ ] `outputLocales` expanded (incl. ≥1 RTL locale); catalogs generated via the real
      translate provider, not faked.
- [ ] `<lang-switcher>` swaps locale at runtime, persists, and sets `dir`; verified in browser.
- [ ] RTL layout is correct on the primary surfaces; no mirrored-layout breakage.
- [ ] Numbers/dates/currency use `Intl` keyed to the active locale, including $THREE amounts.
- [ ] Brand and coin stay verbatim across locales; changelog updated; `build:pages` clean.
