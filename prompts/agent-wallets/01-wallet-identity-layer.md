# Task 01 — The Wallet Identity Layer (foundation)

> **Read [00-README-orchestration.md](./00-README-orchestration.md) first.** It
> defines the ownership model, design tokens, surfaces, real APIs, hard rules, the
> definition of done, and the "improve then delete this file" close-out. This task
> assumes all of it.

## Mission

Turn the tiny, under-used wallet chip into a **living wallet identity component**
that appears on *every* surface where an avatar/agent is shown, and reads as one
coherent system across the whole app. This is the foundation the rest of the
program builds on — get the data contract and the component right.

Today there is [src/shared/agent-wallet-chip.js](../../src/shared/agent-wallet-chip.js):
a small violet pill showing a shortened Solana address with the vanity prefix/suffix
highlighted, a copy button, an explorer link, and an owner-only "vanity" action /
visitor "tip" action. It is imported by a handful of surfaces but not all, and it
shows almost nothing about the wallet's actual state.

## What the upgraded component must show

A wallet is an identity. At a glance, anywhere an avatar appears, a user should see:

- **Vanity-aware address** (keep the prefix/suffix highlight — it's a great touch).
- **Live balance** — total portfolio value in USD, derived from real SOL + USDC +
  SPL holdings via `GET /api/agents/:id/solana` and
  `GET /api/agents/:id/solana/holdings`. Real numbers only.
- **Ownership state** — a clear, tasteful marker for "Yours" vs "owned by
  @creator". Owner badge vs creator attribution (read `meta.forked_from` /
  `user_id`). This is the user's core ask: make ownership legible everywhere.
- **A micro P&L sparkline / 24h change** when data exists (see below for the data
  source). Degens read P&L before anything else.
- **Multi-chain awareness** — the agent has both Solana and EVM wallets; the chip
  should not pretend Solana is the only one. Show the primary, make both reachable.

On hover/focus (desktop) or tap (mobile), the chip should **expand into a rich
preview popover** — balances broken out (SOL / USDC / $THREE / other SPL), the full
vanity address with copy, top holdings, and the primary actions appropriate to the
viewer's role (Deposit/Withdraw/Vanity/Trade for owner; Tip/Fork-to-own for
visitor). The full Wallet HUD (task `02`) opens from a "Open wallet" affordance in
this popover — coordinate the handoff with that task.

## Innovation mandate (this is where you earn the bar)

Do not just bolt numbers onto a pill. Think about what would make a trader
screenshot this. Ideas — implement the strong ones, invent better:

- **A wallet "pulse"** — a subtle live animation when the balance changes (a tip
  lands, a trade fills), driven by real polling or a real event source. No fake
  ticks.
- **Identity = address as art.** The vanity address is the agent's brand. Treat it
  like one: a tasteful gradient/monospace treatment, a one-click "share my wallet"
  that produces a real OG card (reuse `/api/agent-share`).
- **Reputation at a glance** — total tips received, lifetime volume, # of forks
  (real counts from the DB). The wallet becomes a trust signal.
- **Cross-surface consistency** — the same agent's wallet looks identical in the
  galaxy, the marketplace, and its profile. One component, one truth.

## Data contract & component API (the foundational deliverable)

- Keep a single shared module under `src/shared/` as the source of truth. Either
  extend `agent-wallet-chip.js` or introduce a clean
  `src/shared/agent-wallet-identity.js` that the chip and the HUD both consume —
  your call, but there must be exactly one normalizer for "agent → wallet
  descriptor."
- Define a documented descriptor (address(es), vanity prefix/suffix, balances,
  USD value, P&L, ownership state, reputation counts) and a normalizer that maps a
  raw agent/avatar record into it. Every surface passes its existing agent object;
  the normalizer handles the field aliasing (`agent.solana_address` /
  `agent.meta.solana_address` / `avatar.agent_solana_address`, etc.).
- Export both an HTML-string renderer (for template-built lists like trending) and
  a DOM-node factory with wired handlers (for interactive pages), mirroring the
  current `walletChipHTML()` / `walletChipEl()` split.
- **Balance fetching:** lists must not fire N×3 requests on render. Design a
  batched/lazy strategy — render the chip immediately from whatever the list
  payload already carries (address, vanity), then lazily hydrate balance/P&L on
  viewport-enter (IntersectionObserver) or via a single batch endpoint. If a batch
  balance endpoint doesn't exist and you need one, **build it for real**
  (`POST /api/agents/balances` taking an array of ids, reading real chain state with
  sane caching) — no client-side fan-out storms, no fake numbers.

## P&L data source (build it real or don't show it)

If there is no existing source of historical wallet value, you have two honest
options — pick one and implement fully:

1. Compute 24h change from real on-chain holdings valued at real current vs.
   24h-ago prices (price feeds already used in
   [api/_lib/agent-wallet.js](../../api/_lib/agent-wallet.js) / coingecko / pump.fun).
2. Persist periodic balance snapshots server-side and derive change from them.

Whichever you choose, the sparkline reflects real value. If there is genuinely no
data yet for a wallet, render the *empty* sparkline state, not a fake curve.

## Coverage (wire it EVERYWHERE — audit, don't assume)

Add/upgrade the wallet identity component on **all** surfaces listed in the
orchestration README: agent detail, character page, avatar page, marketplace
detail, trending/leaderboard, galaxy, my-agents/dashboard, launches feed, and any
shared agent-card component. Grep the codebase for existing imports of the chip to
find current call sites, then find the surfaces that *should* have it but don't.
Every place an avatar's face shows, its wallet identity shows.

## Constraints specific to this task

- The chip renders in dense lists (trending rows, galaxy cards) and on roomy pages.
  It must be responsive and not blow up list layouts. Test at 320 / 768 / 1440.
- Polling must be cheap and must stop when the element is offscreen or the tab is
  hidden (`visibilitychange`). No runaway intervals.
- Never render a secret. Only public addresses and balances.
- Respect the viewer role on the popover actions (owner vs visitor vs logged-out).

## Definition of done

Per the orchestration README's checklist. Specifically also: the chip is present
and visually identical for the same agent across at least the profile, trending,
galaxy, and marketplace surfaces; balances are real and hydrate without jank; the
ownership marker is correct for owner vs visitor; no N+1 request storm in lists.

When done, run the self-review + improvement pass, add a changelog entry, commit
(staging explicit paths only, pushing to **both** `threeD` and `threews` if the
user asks to push), then **delete this file**
(`prompts/agent-wallets/01-wallet-identity-layer.md`).
