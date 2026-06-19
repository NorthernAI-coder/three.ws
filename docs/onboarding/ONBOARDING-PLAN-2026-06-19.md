# three.ws Onboarding Plan

_Date: 2026-06-19 · Owner: platform · Status: Phase 1 in progress_

## Goal

Turn the existing, scattered onboarding pieces into one coherent first-run journey
with a single source of truth for progress. Optimize the **consumer creator** path
(Create → Brain → Embed) as the default, with the **agent-economy** path
(wallet · fund · x402 · monetize) as an opt-in branch that unlocks only when the
user reaches for it. No upfront crypto friction.

## What already exists (do not rebuild)

- **Floating guide** — [public/getting-started.js](../../public/getting-started.js):
  welcome modal + resumable checklist (create/brain/embed core, onchain/monetize
  optional). Public API: `window.__twsGuide.complete(id)` and the
  `three-ws:guide` CustomEvent. Progress in `localStorage['tws-guide:progress']`.
- **Dashboard onboarding panel** — [renderOnboarding()](../../src/dashboard-next/pages/home.js):
  derives step completion from real server data (`avatars`, `agents`, `widgets`).
- **Setup wizard** — [pages/start.html](../../pages/start.html).
- **Post-creation banner** — [pages/app.html](../../pages/app.html) (`#agent-onboarding`).
- **IRL permission onboarding** — [src/irl/onboarding.js](../../src/irl/onboarding.js) (self-contained).
- **Shared state primitives** — [src/shared/state-kit.js](../../src/shared/state-kit.js).

## The three real gaps

1. **Two disconnected progress systems.** The dashboard panel knows the truth from
   the server; the floating guide only guesses from the current route. They drift —
   a user with an avatar + agent can see "2 of 4" on the dashboard and "0/3" in the
   floating pill on the same session.
2. **No funding onboarding.** Users are told "pay with a Base/Solana wallet" but are
   never shown how to get USDC.
3. **No x402 first-run context.** The payment modal appears with zero explanation.

## Plan

### Phase 1 — Unify the spine _(in progress)_

Make the dashboard (which holds authoritative server state) the reconciler that
keeps the floating guide honest, and replace fragile route-detection with precise
completion signals.

- **Reconcile guide from server truth.** On dashboard boot, after fetching
  avatars/agents/widgets, emit `window.__twsGuide.complete()` for each genuinely
  completed step (avatar→`create`, agent→`brain`, widget→`embed`). Runs even when
  the panel is dismissed — reconciliation is data sync, not UI.
  → [src/dashboard-next/pages/home.js](../../src/dashboard-next/pages/home.js)
- **Precise brain completion.** Fire `three-ws:guide` step `brain` when a persona is
  actually saved to an agent, not merely when `/brain` is visited.
  → [src/dashboard-next/pages/brain.js](../../src/dashboard-next/pages/brain.js)
- **Bidirectional panel sync.** The dashboard panel reflects guide progress for the
  optional `monetize` step so completion reached on another surface ticks here too.
  → [src/dashboard-next/pages/home.js](../../src/dashboard-next/pages/home.js)

**Acceptance:** create an avatar + agent, never open the floating pill, visit the
dashboard → the pill reads the correct core count. Save a persona to an agent → the
`brain` step ticks without visiting any detection route. No console errors.

### Phase 2 — Close the funding gap (consumer + economy)

- Surface the `fund` skill as a designed step (how to get USDC on Base/Solana, what
  it costs, why) instead of a bare payment prompt.
- Activate it as an opt-in checklist branch only when the user triggers a
  monetize/x402 action — progressive disclosure, never upfront.
- Touchpoints: [src/dashboard-next/pages/monetize.js](../../src/dashboard-next/pages/monetize.js),
  [pages/agent-wallet.html](../../pages/agent-wallet.html).

### Phase 3 — x402 first-run explainer (economy track)

- One-time, dismissible intro on the first x402 payment: what a micropayment is,
  what's being paid, that it settles in USDC. Match the IRL onboarding card pattern.
- Touchpoints: [pages/club.html](../../pages/club.html), [pages/shopper.html](../../pages/shopper.html).

### Phase 4 — Polish + empty states

- Replace minimal empty states (monetize/agents/widgets) with "here's your next
  action" disclosure via [src/shared/state-kit.js](../../src/shared/state-kit.js).
- Quality wins: keyboard nav through the checklist, hover/active/focus states,
  transitions on step completion.

## Step-id mapping (canonical)

| Guide step (`getting-started.js`) | Dashboard panel | Server-truth source        |
| --------------------------------- | --------------- | -------------------------- |
| `create`                          | avatar          | `avatars.length > 0`       |
| `brain`                           | agent           | persona saved / `agents`   |
| `embed`                           | widget          | `widgets.length > 0`       |
| `onchain` (optional)              | —               | deploy/onchain surface     |
| `monetize` (optional)             | monetize        | guide progress / monetize  |
