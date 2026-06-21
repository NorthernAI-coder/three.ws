# Task 19 — Internationalization: activate the pipeline that's already built

> Read [00-README-orchestration.md](./00-README-orchestration.md) first. **Track F —
> Credibility / reach.** Independent. Like the referral task, this is a built-but-dormant
> asset — activating it unlocks global reach for near-zero net-new infrastructure.

## The thesis

A $1B consumer platform is multilingual. three.ws has a real, production-grade i18n
pipeline — extraction, translation, glossary lock, build gates — but it's only run for **2 of
10 configured locales** and ~20 strings (homepage hero only). There's no language switcher and
no RTL support. The machinery exists; it's just turned off for the world outside English.

## What exists today (read first — it's real)

- **Pipeline** — [scripts/i18n-extract.mjs](../../scripts/i18n-extract.mjs) +
  [scripts/i18n-translate.mjs](../../scripts/i18n-translate.mjs) (`npm run i18n`,
  `i18n:extract`, `i18n:translate`, `i18n:lint`). Config in [.i18nrc.json](../../.i18nrc.json):
  10 target locales (`es, zh-CN, ja, ko, fr, de, pt-BR, ar, hi, ru`), Groq with a Gemini
  fallback for CJK/Arabic/Hindi, and a **glossary lock** that preserves `$THREE`, `x402`,
  `USDC`, `Solana`, `MCP`, `Forge`, etc. byte-for-byte.
- **Runtime** — [public/i18n.js](../../public/i18n.js) swaps strings via `data-i18n` attributes.
- **Coverage today** — [public/locales/](../../public/locales/): only `en.json` (~19 keys) +
  `es.json`; `manifest.json` declares only `en`/`es`. RTL locales are configured but no layout
  support exists. **No language switcher UI.**

## What to build

1. **Widen string extraction.** Annotate the high-traffic surfaces (home, nav/footer, forge,
   marketplace, pricing, onboarding, the new Track F pages) with `data-i18n` so
   `i18n:extract` captures the real user-facing copy — not just the hero. Keep the glossary
   terms locked. Don't translate code, addresses, or token names.
2. **Run the translation pipeline for all configured locales.** Generate real translations for
   the 10 locales via the existing `i18n:translate` flow, pass `i18n:lint` and the build gates,
   and update `manifest.json`. Real translations only — the pipeline produces them; never
   hand-fake a locale.
3. **Language switcher UI.** Add an accessible language selector (nav and/or footer) that swaps
   locale via [public/i18n.js](../../public/i18n.js), persists the choice, and respects the
   browser's `Accept-Language` on first visit. Designed, keyboard-operable, ARIA-correct.
4. **RTL support.** For `ar` (and any other RTL locale enabled), add real `dir="rtl"` layout
   support — logical CSS properties, mirrored components — so the RTL experience isn't broken.
   Verify a few key pages actually read correctly RTL.
5. **Keep it maintainable.** Wire extraction/translation into the build or a cron so new copy
   doesn't silently fall back to English forever (coordinate cadence with `13`). Document the
   workflow for future contributors.

## Hard rules specific to this task

- **Glossary terms stay byte-for-byte** ($THREE, x402, USDC, Solana, MCP, Forge, pump.fun,
  GLB, glTF, WebGL, Three.js, ERC-8004, Granite). Never translate or alter them.
- **$THREE only** — translations must not introduce any other coin name.
- Don't ship a half-translated page that mixes languages mid-sentence — gate on `i18n:lint`.

## Definition of done

README DoD, plus: the high-traffic surfaces are extracted and translated across the configured
locales (passing `i18n:lint` + build gates, `manifest.json` updated); an accessible language
switcher works and persists; RTL renders correctly on key pages; glossary terms preserved; a
documented path keeps new copy translated. Changelog (`feature`/`improvement`). Self-review,
then extend coverage to the next set of surfaces.

Delete this file when done.
