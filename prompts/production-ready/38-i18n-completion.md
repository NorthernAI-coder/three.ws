# 38 — Internationalization (i18n) completion

> Part of **Production-Ready** (`prompts/production-ready/`). Read `00-README.md` and `/CLAUDE.md` first.

**Phase:** 4 — Growth
**Owns:** i18n pipeline (`npm run i18n`, `i18n:extract`, `i18n:translate`, `i18n:lint`), locale files (`en.json`, `es.json`), all user-facing copy.
**Depends on:** `13`, `14`. Pairs with `31`, `34`.

## Why this matters for $1B
A $1B platform is global. Crypto + AI-agent audiences are heavily international. Full
i18n unlocks entire markets at low marginal cost and improves SEO per locale. The
pipeline already exists (`en`, `es`) — finish and expand it.

## Map
- Scripts: `i18n`, `i18n:extract`, `i18n:translate`, `i18n:lint` (recent git log:
  "i18n extraction/translation pipeline"). Locales today: `en.json`, `es.json` (+
  `manifest.json`). 125 pages with significant inline copy.

## Do this
1. **Extraction coverage:** run `i18n:extract` and find untranslated/hardcoded
   strings across `pages/`, `src/`, `public/`. Externalize every user-facing string
   into the catalog with stable keys. `i18n:lint` clean (no missing keys, no
   hardcoded UI text).
2. **Complete existing locales:** fill all gaps in `es.json` so Spanish is 100%, not
   partial. Use `i18n:translate` then review for quality/context (not literal MT
   where it reads wrong).
3. **Add priority locales:** expand beyond en/es to the highest-value markets for the
   audience (e.g. add a few more major languages). Each new locale goes through
   extract → translate → review → lint.
4. **Locale-aware formatting:** numbers, dates, currencies (USDC amounts), and
   pluralization use locale-aware formatting (Intl APIs) — not hardcoded formats.
5. **RTL readiness:** if any RTL locale is added, the layout supports `dir="rtl"`
   (logical CSS properties, mirrored components) — coordinate with prompt `13`.
6. **Locale routing + SEO:** language switching is discoverable + persistent;
   per-locale URLs with `hreflang` tags and locale-specific meta (prompt `14`); the
   sitemap includes locale variants.
7. **No untranslated leaks:** every state (incl. errors, empty states, emails/
   notifications — prompts `12`, `39`) is localized. Pseudo-localize to catch
   truncation/overflow before shipping.
8. Wire `i18n:lint` into CI so new hardcoded strings fail the build.

## Must-not
- Do not ship hardcoded user-facing strings — externalize to the catalog.
- Do not leave a locale partially translated and selectable as if complete.
- Do not hardcode number/date/currency formats.

## Acceptance
- [ ] `i18n:lint` clean; all user-facing strings externalized with stable keys.
- [ ] `es.json` 100% complete and reviewed; priority new locales added via the pipeline.
- [ ] Locale-aware number/date/currency/plural formatting via Intl.
- [ ] RTL support if an RTL locale is added.
- [ ] Discoverable persistent language switch; `hreflang` + per-locale meta + sitemap.
- [ ] Errors/empty states/emails localized; pseudo-loc overflow check done.
- [ ] `i18n:lint` enforced in CI.
