# 42 · Homepage & Conversion Optimization

## Mission
The homepage must instantly communicate what three.ws is, prove it with a live demo, and convert
visitors into agent-builders. This is the top of the funnel — make it world-class.

## Context
- Homepage + landing surfaces (`src/dashboard-next/pages/home.js` for the signed-in home; public
  landing in `pages/` + `src/`). Live demos: `<agent-3d>`, walk companion, "Made with Forge" strip.
- i18n live (language picker, Spanish). Recent: "Made with Forge" strip fixed to show live models.

## Tasks
1. **Clear value prop:** above-the-fold answers "what is this + why care + what do I do next" in
   seconds; a single primary CTA (Create your agent) and a secondary (see it / try Forge).
2. **Live proof:** a real, performant interactive demo (a live agent / walk companion / forge strip)
   that loads fast and never shows placeholder voids.
3. **Conversion path:** every section drives toward create/onboarding; remove dead ends; strong
   social proof (real numbers/launches/creations, not fabricated stats).
4. **Performance:** the homepage is the most-measured page — green CWV (coordinate with prompt 11),
   minimal JS above the fold, lazy demos.
5. **Trust + clarity:** $THREE positioned correctly (the one coin), pricing/onramp clarity, footer
   with docs/status/legal/social.
6. **A/B-ready:** instrument the primary CTA + hero variants (coordinate with prompt 45) so conversion
   can be measured + improved.

## Acceptance
- Above-the-fold communicates value + has a clear primary CTA; live demo loads fast, no voids.
- Every section routes toward onboarding; social proof is real; green CWV on the homepage.
- CTA/hero instrumented for measurement; clean console; responsive; changelog for visible changes.

---
### Operating rules — read CLAUDE.md + STRUCTURE.md first. No mocks/fake data/fabricated stats. $THREE only (`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`). Stage explicit paths; never `git add -A`. Don't commit `api/*.js` bundles. User-visible change → `data/changelog.json` + `npm run build:pages`. Push both remotes when asked; never pull from `threeD`. DoD = CLAUDE.md checklist.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "prompts/42-homepage-conversion.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
