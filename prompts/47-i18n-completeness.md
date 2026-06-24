# 47 · Internationalization Completeness

## Mission
Make the platform fully localizable and ship more languages cleanly, with brand/protocol terms locked
and English as a safe fallback.

## Context
- i18n pipeline: `npm run i18n` (`i18n:extract` + `i18n:translate`), `npm run i18n:lint`. Language
  picker live (Spanish first); choice remembered. The pipeline locks brand/protocol terms ($THREE,
  the CA, USDC, x402) and falls back to English.

## Tasks
1. **String coverage:** run `i18n:extract`; find untranslated/hardcoded strings across `src/`/`pages/`;
   externalize them so nothing user-facing is left un-extractable. `i18n:lint` clean.
2. **Locked terms:** verify the term-locking actually preserves $THREE, the CA, USDC, x402, brand names
   in every locale; add any missing locks.
3. **Add languages:** extend beyond Spanish to the next priority locales via the pipeline; verify
   layout doesn't break with longer strings (German/French) or RTL (Arabic) if in scope.
4. **Quality:** spot-check translations for correctness in context; fix obvious machine-translation
   errors; ensure dates/numbers/currency format per locale.
5. **Fallback:** missing keys always fall back to English (never show raw keys); language switch is
   instant + persisted.
6. **SEO:** `hreflang` alternates correct (sync prompt 12) for each shipped locale.

## Acceptance
- `i18n:lint` clean; no hardcoded user-facing strings; locked terms preserved in every locale.
- ≥1 new locale shipped via the pipeline with layout verified; fallback to English never shows raw keys.
- Locale-correct formatting; `hreflang` correct; language switch instant + remembered.

---
### Operating rules — read CLAUDE.md + STRUCTURE.md first. $THREE, the CA, USDC, x402 must never be altered by translation. $THREE only (`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`). No fake/placeholder translations shipped. Stage explicit paths; never `git add -A`. Don't commit `api/*.js` bundles. User-visible change → `data/changelog.json` + `npm run build:pages`. Push both remotes when asked; never pull from `threeD`. DoD = CLAUDE.md checklist.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "prompts/47-i18n-completeness.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
