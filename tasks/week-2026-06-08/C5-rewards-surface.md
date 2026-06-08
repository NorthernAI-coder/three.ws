# C5 — Holder rewards / revenue-share surface (wow-sprint Task 17)

**Track:** C — build next · **Priority:** P2 · **Effort:** ~1 day · **Depends on:** **C1** (the shared hook)

## Context

`tasks/wow-sprint/17-holder-rewards-surface.md` wants a surface that shows $THREE holders the
protocol revenue-share they're accruing. ~40% exists: the revenue-share **calculator** already
renders in `src/dashboard-next/pages/three-token.js` (~lines 442–580) from
`/api/three-token/revenue-share`. The missing piece is a dedicated, honest rewards surface driven by
the holder's real position. Read the task doc fully first.

## HARD CORRECTNESS CONSTRAINT (read this twice)

**There is NO on-chain rewards/claim program.** `contracts/` has no rewards program, and
`/api/three-token/revenue-share` returns protocol-level **pro-rata math**, not a per-wallet
claimable balance. Therefore:

- This surface is an **accrual / calculator** view only.
- **Do NOT add a "Claim" button that performs (or pretends to perform) a transaction.** A button
  wired to nothing, a `setTimeout` fake success, or a stubbed claim are all hard CLAUDE.md
  violations.
- If you show a claim affordance at all, it must be clearly labeled **"coming"** / disabled with an
  honest explanation — never a fake action.

## Prerequisite

Consume the **C1** store (`src/pump/three-token-data.js`): `revenueShare` for the pool math and
`position` for the holder's $THREE amount → their accrued share. Do not re-fetch directly.

## What to build

1. **Rewards surface** — either a new `src/dashboard-next/pages/rewards.js` +
   `pages/dashboard-next/rewards.html` (routed in `vite.config.js`, nav entry added), **or** a
   dedicated section within `three-token.js` if the team prefers one page. Decide based on the task
   doc; default to a dedicated section to avoid page sprawl unless the doc says otherwise.
2. Render, from the C1 store:
   - The protocol revenue-share pool (USD), pool %, total holders, per-token yield (from
     `revenueShare`).
   - **The viewer's accrued share** = their $THREE `position.amount` × `per_token_yield` (or the
     correct formula per the endpoint's fields). Show amount + USD, with an honest "estimated
     accrual" label and a short explainer of how it's computed.
   - Historical/over-time context if the activity feed supports it (reuse `activity`).
3. **States:** signed-out (CTA to connect), holding-zero (CTA to acquire $THREE), loading skeleton,
   error. The "claiming coming" note where a claim would eventually live.
4. **Motion + a11y + responsive** per CLAUDE.md.

## Acceptance criteria

- [ ] The surface shows the real pool math + the viewer's **estimated accrued** share from their
      actual position (via the C1 store).
- [ ] No claim transaction exists; any claim affordance is honestly labeled "coming"/disabled.
- [ ] All states designed (signed-out / zero / loading / error); responsive; accessible.
- [ ] No duplicate revenue-share fetching — all via the C1 store.
- [ ] No console errors; numbers trace to `/api/three-token/revenue-share` + `/api/wallet/balances`.

## Verification

1. `npm run dev`; open the rewards surface.
2. Connected holder: accrued share = position × yield, USD correct, "estimated/coming" labeling
   present.
3. Signed-out and zero-balance states render their CTAs.
4. Confirm there is no network call or button that attempts a non-existent claim.
5. `npx vitest run` for any new tests.

## Rules

Obey [CLAUDE.md](../../CLAUDE.md). Only $THREE. **No fake claim.** Honesty over polish — label
estimates as estimates. Design every state.

## Completion protocol

1. Re-read your diff (`git diff`) and confirm every line is justified.
2. Delete this file: `tasks/week-2026-06-08/C5-rewards-surface.md`.
3. Commit your code **and** this file's deletion together, e.g.:
   `git add -A && git commit -m "feat(holder): honest revenue-share accrual surface via shared store; close C5"`
4. Do **not** push — the human controls pushes.
