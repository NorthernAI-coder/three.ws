# G3 — Internationalization to production: full coverage, RTL, locale-aware formatting, lint gate

You are a senior engineer + product thinker building **three.ws**. Read `CLAUDE.md`, `STRUCTURE.md`, `prompts/production-campaign/00b-the-bar.md`, and `docs/i18n.md` first. **Prerequisites:** none (parallel; G4 owns tokens — the locale switcher must use them).

## Why this matters for $1B
A platform worth $1B is used worldwide. The audience is crypto-native developers and creators across every market; copy that only renders in English caps the addressable market and signals a regional product, not a global one. The i18n pipeline already exists and is architecturally sound (the LobeHub static-catalog model) — but it's only **partially built out**: two locales actually ship, RTL is wired but untested, and most pages aren't annotated. Finishing this turns a scaffold into real global reach.

## Current state (read before you write)
- **Pipeline exists and is well-designed.** `.i18nrc.json` configures the entry catalog (`public/locales/en.json`), 10 target locales (`es, zh-CN, ja, ko, fr, de, pt-BR, ar, hi, ru`), RTL locales (`ar, he, fa, ur`), the Groq LLM provider, and a `doNotTranslate` glossary that already protects `$THREE`, the contract address, `x402`, `Solana`, `USDC`, brand terms. `scripts/i18n-extract.mjs` derives the catalog from `data-i18n` annotated HTML; `scripts/i18n-translate.mjs` translates incrementally; `scripts/i18n-translate.mjs --lint` (`npm run i18n:lint`) checks. `docs/i18n.md` documents the whole flow.
- **Runtime is built.** `src/i18n.js` exports `setLocale` / `getLocale` / `initI18n` / `translate` / `t`, swaps the DOM at runtime, sets `document.documentElement.dir = 'rtl'|'ltr'` from the manifest, fires an `i18n:change` event, and registers a `<lang-switcher>` web component that self-hides on single-language deploys.
- **But coverage is thin.** `public/locales/` contains only `en.json`, `es.json`, `manifest.json` — the manifest lists just `en` + `es`. The 10 configured target locales aren't built. Most of the 125+ HTML pages aren't `data-i18n`-annotated, so they render English-only regardless of locale.
- **No i18n gate in CI.** `.github/workflows/ci.yml` doesn't run `i18n:lint`. Drift (missing keys, stale translations, un-annotated copy) goes uncaught.
- **Locale-aware formatting is not centralized.** Numbers, dates, currency (USDC amounts, $THREE balances, timestamps) are formatted ad hoc, not via `Intl` keyed to the active locale.

## Your mission
### 1. Annotate the remaining surfaces and extract a complete catalog
Sweep the user-facing pages under `pages/**` and `public/**` (the `htmlExtract.entry` globs in `.i18nrc.json`) and add `data-i18n` / `data-i18n-html` / `data-i18n-attr` annotations to user-visible copy per `docs/i18n.md` — including `<title>`/`<meta>` for SEO per locale. Run `npm run i18n:extract` to regenerate `public/locales/en.json`. Do **not** annotate code identifiers, addresses, or glossary terms; rely on `doNotTranslate`.

### 2. Build all configured locales for real
Run `npm run i18n:translate` (Groq provider — locate `GROQ_API_KEY` in `.env`/`vercel env`; the script must use the real LLM, no stub catalogs) to produce `public/locales/{es,zh-CN,ja,ko,fr,de,pt-BR,ar,hi,ru}.json`. Update `public/locales/manifest.json` so the switcher lists every built locale with the correct `dir`. Spot-check that the glossary held ($THREE etc. untranslated) and that RTL locales carry `dir: "rtl"`.

### 3. Surface a polished locale switcher everywhere
Ensure the `<lang-switcher>` from `src/i18n.js` is mounted in the shared nav/footer (`public/nav.js`) so it's reachable on every page, and that `initI18n()` runs on boot before paint to avoid an English flash. Style it with **design tokens only** (`public/tokens.css`). It must be keyboard-accessible and screen-reader-labelled (coordinate with G2), persist the chosen locale, and respect the browser's `Accept-Language` on first visit.

### 4. Make RTL real
With Arabic now built, audit the platform in `dir="rtl"`: logical CSS properties (`margin-inline`, `padding-inline`, `inset-inline`) instead of left/right where direction matters, mirrored icons/chevrons, correct text alignment, and nav/drawer/layout that don't break. Fix the RTL-specific breakages in the shared chrome and primary surfaces. The page must look intentional in Arabic, not like flipped English.

### 5. Centralize locale-aware formatting + add the lint gate
Add a small formatting helper (e.g. `src/format-intl.js`) wrapping `Intl.NumberFormat` / `Intl.DateTimeFormat` keyed to `getLocale()`, and route user-visible numbers, dates, relative times, and currency (USDC, $THREE balances) through it so they format correctly per market (decimal/grouping separators, date order). Then add an **i18n lint job** to `.github/workflows/ci.yml` running `npm run i18n:lint` — failing the build on missing/stale keys or un-annotated regressions — so the catalog can't drift.

### 6. Verify
`npm run dev`, switch through several locales including Arabic: copy swaps with no English flash, no console errors, RTL layout holds, numbers/dates/currency format per locale, the switcher is keyboard-operable. Confirm existing tests pass; the pure helpers in `src/i18n.js` are already test-friendly — add tests for the new `Intl` formatter and any new resolve logic.

## Definition of done
Clears 00b's **polish bar** (universal, screenshot-worthy in every locale incl. RTL) and the global definition of done in `00-README-orchestration.md`: real LLM translation (no stub catalogs), `$THREE` only and untranslated, design tokens only on the switcher, zero console errors, existing + new tests pass, the new i18n CI gate green and enforced. All 11 locales build, the switcher is on every page, RTL is correct, and formatting is locale-aware.

## Operating rules (override defaults)
No mocks/fake data/placeholders/TODOs/stubs — translations come from the real Groq pipeline, not hand-typed filler. `$THREE` (and the contract address) is the only coin and stays in `doNotTranslate`, untranslated in every locale. Design tokens only (`public/tokens.css`) for the switcher. Stage explicit paths only (never `git add -A`) — the generated `public/locales/*.json` are append/regenerate outputs, commit them deliberately. Own the i18n lane; extend `src/i18n.js`, the i18n scripts, and `.i18nrc.json` — do not rewrite the pipeline.

## When finished
Run the self-review (CLAUDE.md's five checks). Ship one improvement (e.g. per-locale OG/meta so shared links unfurl in the reader's language, or a `hreflang` set in `<head>` for SEO). Append a `data/changelog.json` entry (tag: `improvement`) — holder-readable ("three.ws now speaks 11 languages, including right-to-left, with a built-in language switcher"). Then delete this prompt file (`prompts/production-campaign/G-trust/G3-i18n-completeness.md`) and report what you shipped + the seam for the next agent (any surfaces still un-annotated, locales needing copy review).
