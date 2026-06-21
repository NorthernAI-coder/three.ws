# 13 — End-to-end tests for critical flows

> **Road to $1B · Production-Readiness track.** Paste this whole file into a fresh chat at `/workspaces/three.ws`. Read `CLAUDE.md` + `STRUCTURE.md` first — they override defaults.

**Phase:** 2 · Cross-cutting hardening
**Owns:** Playwright suites under `tests/e2e/*.spec.js`; `playwright.config.js`.
**Depends on:** `12`. **Pairs with:** `14` (CI), product-surface prompts `21`–`34`.

## Why this matters for $1B
Unit tests prove functions work; E2E proves the **product** works. The flows that make
or break the company — create an avatar, launch a coin, pay via x402, embed a widget —
must be guarded by browser tests that fail loudly when a refactor breaks the journey. This
is how you ship daily without fear.

## Map — real anchors
- `npm run test:e2e` → `playwright test`. `playwright.config.js` — 120s timeout, 1 retry, dev server on port 3000, 180s cold-start budget.
- Existing specs in `tests/e2e/` (e.g. `tests/e2e/avatar-edit.spec.js`).

## Do this
1. **Define the critical journeys** (the ones a $1B platform cannot ship broken):
   - Forge: prompt → generate (free lane) → preview → save/download.
   - Avatar: create/import → rig → customize → save → view in gallery.
   - Onboarding: the create wizard end-to-end → deployed embed snippet.
   - Marketplace: browse → open skill → purchase flow reaches checkout.
   - x402: hit a paid endpoint → 402 → payment modal renders → settle path (use test/sandbox where real settlement isn't safe, but exercise the real UI flow).
   - Embed/widget studio: configure → copy snippet → snippet renders an avatar on a test page.
   - Walk companion: loads and animates on a page.
2. **Author Playwright specs** for each, asserting real DOM/network outcomes (not screenshots-only). Cover the designed loading/empty/error states too.
3. **Stabilize:** use role/text selectors, explicit waits on real conditions (no arbitrary sleeps), and the existing cold-start budget. Make them deterministic.
4. **Money flows:** exercise the full UI up to the irreversible step; assert the confirmation/guard UI. Don't move real mainnet funds in CI.
5. **Wire into CI** (coordinate with `14`) so these run on PRs and block merge on failure.

## Must-not
- No mainnet money movement in CI; stop at the confirmation boundary or use a sandbox.
- No arbitrary `waitForTimeout` as the primary sync — wait on real conditions.
- Do not assert on brittle pixel screenshots for logic; assert behavior.

## Definition of done
- [ ] Playwright specs cover forge, avatar create→rig→save, onboarding, marketplace purchase entry, x402 modal, embed/widget, walk companion.
- [ ] Specs assert real behavior incl. loading/empty/error states; deterministic, no arbitrary sleeps.
- [ ] Money flows tested up to the irreversible boundary only.
- [ ] Specs run green locally and are wired into CI; `git diff` reviewed.

---
**Non-negotiables (CLAUDE.md):** No mocks / fake data / TODOs / stubs — real APIs only. **`$THREE` is the only coin** (CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`) — never reference any other token anywhere. Concurrent agents share this worktree → **stage explicit paths** (never `git add -A`); re-check `git status`/`git diff --staged` before commit. Never commit `api/*.js` starting with `__defProp`/`createRequire` (esbuild trap → `git restore -- api/ public/`). User-visible change → `data/changelog.json` + `npm run build:pages`. Push to BOTH remotes (`threeD`, `threews`) when asked; never pull/fetch from `threeD`.
