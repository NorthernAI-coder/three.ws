# Task 09 — Browser E2E coverage of the launch flow

**Priority:** MEDIUM. **Depends on:** Task 02 (USDC UI). **Type:** test + frontend hardening.

## Goal

Add real browser E2E coverage (Playwright) for the launch modal's four steps and the trade
widget, and fix the UX gaps the frontend inventory flagged along the way: generic error copy and
the untraced graduation visual state transition. Today there is zero E2E coverage of the most
important conversion path in the product.

## Why this matters

The launch flow (`src/pump/launch-token-modal.js`, ~1000 lines, 4 steps, wallet signing, canvas
share card) is where users convert. A silent regression here is invisible until a user can't
launch. Manual testing doesn't scale; this is the one flow that must never break.

## Context — read first

- `src/pump/launch-token-modal.js` — steps 1 (form) → 2 (quote+curve chart) → 3 (connect) →
  4 (sign/broadcast/confirm + success share card).
- `src/pump/pump-modals.js`, `src/game/coin-buy.js` — trade widget (post Task 02).
- `src/pump/bonding-curve-chart.js` — graduation progress; trace the graduated visual state.
- Per memory (`page-audit-tooling`, `vitest-cold-import-contention`): use a **dedicated-port
  Vite** dev server pre-started for Playwright; mock the wallet's `signTransaction` at the
  `window.solana` boundary (the only acceptable mock — it's an external browser extension, not
  our code or a real API) so the test drives the real prep/confirm endpoints.
- `scripts/page-audit.mjs` — existing browser-check harness to model the setup on.

## Scope

1. **E2E spec** (Playwright, in `tests/` or `scripts/` per existing convention) covering:
   form validation (bad symbol rejected), quote step renders breakdown + curve chart, wallet
   connect, sign+broadcast (wallet signing stubbed at the extension boundary), success card +
   mint chip + share link. Assert real `launch-prep`/`launch-confirm` calls fire.
2. **Trade widget E2E** — buy and sell happy paths for a SOL coin and a USDC coin (Task 02).
3. **Fix error copy** — replace generic "Connection error, please try again" with messages mapped
   to the actual failure (insufficient SOL, RPC down, user rejected, slippage exceeded).
4. **Graduation visual state** — verify and, if missing, implement the curve→graduated visual
   transition in the chart/widget so a graduated coin is visually unmistakable.

## Definition of done

- [ ] Playwright spec runs green locally against a dedicated dev server; covers all 4 launch steps
      + buy + sell.
- [ ] Error states show specific, actionable copy (no generic catch-all).
- [ ] Graduated coins render a distinct visual state; verified in a browser.
- [ ] Spec documented (how to run); pre-started dev server pattern followed (no flaky networkidle).
- [ ] `npm test` still passes.
- [ ] Changelog entry (tag: `improvement`) for the clearer error messages + graduation state.
