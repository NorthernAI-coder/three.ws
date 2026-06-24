# 22 · Onboarding Wizard (first 5 minutes)

## Mission
A new visitor goes from zero to a deployed, monetizable 3D agent in under 5 minutes, delighted the
whole way. This funnel is the #1 driver of activation — make it frictionless and beautiful.

## Context
- 5-step wizard (per `data/pages.json`): create a 3D avatar → name your agent → enable skills →
  deploy an embed widget → set up monetization. Create flows under `/create*`.
- Account/auth: `/api/auth/me`, `/login`; wallet connect optional but supported.

## Tasks
1. **Flow integrity:** each step is reachable, resumable (refresh-safe), skippable where sensible, and
   advances only on valid input. Progress indicator accurate. No dead step, no place to get stuck.
2. **Avatar step:** fast text/selfie avatar creation with a live preview; sensible default if the user
   skips; never a T-pose.
3. **Skills + monetization:** real skills catalog; monetization setup produces a working paid surface
   (x402). Wallet connect optional and clearly explained.
4. **Deploy step:** generates a real embed snippet that works when pasted on a third-party page; copy
   button; preview.
5. **Empty/error/loading states** designed for every step; network failures recover.
6. **Conversion polish:** microcopy, progress reassurance, "you're almost there" cues, celebratory
   completion that routes into the dashboard with next actions.
7. **Analytics hooks:** emit funnel events per step (coordinate with prompt 45) without blocking UX.

## Acceptance
- A fresh user completes all 5 steps to a deployed, embeddable, monetizable agent in <5 min.
- Resumable + refresh-safe; every step's states designed; embed works on a bare page.
- Funnel events emitted; clean console; responsive; changelog entry for visible changes.

---
### Operating rules — read CLAUDE.md + STRUCTURE.md first. No mocks/fake data/stubs. $THREE only (`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`). Stage explicit paths; never `git add -A`. Don't commit `api/*.js` bundles. User-visible change → `data/changelog.json` + `npm run build:pages`. Push both remotes when asked; never pull from `threeD`. DoD = CLAUDE.md checklist.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "prompts/22-onboarding-wizard.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
