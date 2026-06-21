# Task 06 — Creator dashboard: make "creators earn real money" visible

> Read [00-README-orchestration.md](./00-README-orchestration.md) first. **Track C —
> Revenue.** The backend APIs exist; this is the missing self-serve creator UI. Pairs with
> `07` (reviews + attribution) and `08` (pricing/checkout).

## The thesis

The lever between a $1M platform and a $1B platform is **supply-side proof**: creators who can
see they earn real money, paid out, with real analytics — they tell other creators, and the
flywheel turns. three.ws already settles royalties and exposes per-agent revenue over APIs,
but creators have **no UI** to set prices, watch earnings, or track payouts. They're earning
in the dark. Light it up.

## What exists today (read first — these are real endpoints)

- **Revenue** — [api/monetization/revenue.js](../../api/monetization/revenue.js): per-agent
  gross/net/fees, breakdown by skill, daily timeseries.
- **Payout wallets** — [api/monetization/wallet.js](../../api/monetization/wallet.js): set
  Solana + EVM (Base) payout addresses, preferred network.
- **Withdrawals** — [api/monetization/withdrawals.js](../../api/monetization/withdrawals.js).
- **Royalty settlement** — [api/_lib/royalty.js](../../api/_lib/royalty.js): settles pending
  royalties to creator wallets; ledger has pending/settling/settled states.
- **Skill pricing** — [api/_lib/skill-pricing-rules.js](../../api/_lib/skill-pricing-rules.js)
  + the `agent_skill_prices` table support dynamic rules (first-N, after-N, time-window).
- **Creator analytics endpoint** — [api/creators/skill-analytics.js](../../api/creators/skill-analytics.js)
  exists with **no UI**.
- **The gap:** no `creator-dashboard` page; creators can't self-serve any of the above.

## What to build

A real **creator dashboard** (a new page under the dashboard surface, e.g.
`src/dashboard-next/pages/creator.js` + route; follow the existing dashboard-next patterns):

1. **Price editor.** Set/edit a skill's price and pricing rules via the real
   `agent_skill_prices` plumbing and [skill-pricing-rules.js](../../api/_lib/skill-pricing-rules.js).
   Validate inputs; show the resulting buyer-facing price (including any $THREE-holder discount
   from [three-tier.js](../../api/_lib/three-tier.js)). No fake preview — compute it for real.
2. **Live earnings.** Render gross/net/fees and the daily timeseries from
   [revenue.js](../../api/monetization/revenue.js) with real charts. Designed empty state
   ("no sales yet — here's how to get your first").
3. **Payout management + history.** Set payout wallets ([wallet.js](../../api/monetization/wallet.js)),
   see the royalty ledger (pending/settling/settled from [royalty.js](../../api/_lib/royalty.js)),
   and request/track withdrawals ([withdrawals.js](../../api/monetization/withdrawals.js)).
   Show real on-chain settlement state. Exportable history.
4. **Per-skill analytics.** Surface [skill-analytics.js](../../api/creators/skill-analytics.js)
   (installs, conversion, earnings per skill) as a real table/graph.
5. **Onboarding to selling.** A short "become a creator → set your first price → first sale"
   path, instrumented in [src/analytics.js](../../src/analytics.js) (add the creator funnel
   events). Reachable from the main dashboard and nav.

## Hard rules specific to this task

- Every figure is **real** (live API/DB/on-chain). No mock earnings, no placeholder charts.
- Owner-only: a creator sees only their own agents/skills/earnings. Enforce auth
  ([api/_lib/auth.js](../../api/_lib/auth.js)); never leak another creator's revenue.
- **$THREE only** in any token copy. Payout amounts in USDC/settlement currency are fine.
- Don't change settlement/ledger invariants — surface them faithfully.

## Definition of done

README DoD, plus: a creator can set a price, watch real earnings update after a real purchase,
set a payout wallet, and see/track a real payout; every state designed; owner isolation
verified; creator funnel events fire. Tests for the price-editor logic and the owner-isolation
guard. Changelog (`feature`). Self-review, then improve the weakest panel (likely empty state
or payout clarity).

Delete this file when done.
