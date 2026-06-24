# 07 · End-to-End Critical Flows (Playwright)

## Mission
Lock down the revenue- and trust-critical journeys with real browser E2E tests so a regression can
never reach production silently.

## Context
- Playwright configured; `npm run test:e2e`. Existing specs in `tests/e2e/` (e.g. `avatar-edit.spec.js`).
- Dev server `npm run dev` (port 3000). Pages serve at `/<page>.html` and pretty routes.

## Critical journeys to cover (one spec each)
1. **Forge text→3D:** load `/forge`, enter a prompt, pick the free NVIDIA engine, Generate, assert
   the stage transitions empty→generating→result and a GLB viewer mounts.
2. **Forge photo→3D:** upload a reference image, generate, assert result.
3. **Avatar create → edit → save:** create flow → `/avatars/:id/edit` → change wardrobe/sculpt → save,
   assert persistence.
4. **Walk companion + playground:** enable the companion, open the full-page playground, move with
   WASD, assert the avatar walks and the chosen avatar loads.
5. **Wallet connect:** connect, assert connected state + balance render (use the project's test/dev
   wallet path, not a mock).
6. **x402 paid call:** exercise one paid endpoint through the real x402 flow end-to-end.
7. **Marketplace browse → item → action.**
8. **Onboarding wizard:** complete all steps to a deployed embed.
9. **Search:** query → results → navigate to a result.
10. **Feature tour:** start, advance stops, enter free-roam, exit.

## Tasks
- Author stable selectors (prefer roles/test-ids; add `data-testid` where DOM is ambiguous).
- Each spec asserts the **designed states** (loading/empty/error/success), not just the happy pixel.
- Make them resilient to async (web-first assertions, no arbitrary sleeps).
- Wire into `npm run test:e2e` and the CI gate (prompt 37).
- Document any flow that needs creds/secrets to run, and how CI supplies them.

## Acceptance
- All 10 specs pass locally against `npm run dev` (or a built preview).
- No arbitrary timeouts; specs are stable across 3 runs.
- Specs assert error/empty states, not only success.

---
### Operating rules — read CLAUDE.md + STRUCTURE.md first (they override defaults)
- No mocks of the flows under test — drive the real UI and real endpoints (use the project's dev/test wallet + free engines).
- $THREE is the only coin (CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`). Never reference any other token, anywhere.
- Concurrent agents share this worktree — stage explicit paths; re-check before committing.
- esbuild trap: never commit `api/*.js` starting with `__defProp`/`createRequire`.
- Push to BOTH remotes when asked; never pull/fetch/merge from `threeD`.
- Definition of done = CLAUDE.md's checklist.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "prompts/07-e2e-critical-flows.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
