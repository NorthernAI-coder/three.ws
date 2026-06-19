# Task 02 — Lineage Royalties: the economic fork graph

> Read [00-README-innovation.md](./00-README-innovation.md) first. This builds directly
> on the existing fork model (`POST /api/marketplace/agents/:id/fork`, `fork_of`,
> `forks_count`, avatar fork lineage). Reuse it — do not re-implement forking.

## The screenshot moment

Someone forks a beloved agent, customizes it, and it blows up. A slice of every tip
and every dollar that fork earns **automatically streams back up the family tree** to
the people who made the original — on-chain, transparent, forever. A creator wakes up
to "your 1,400 descendants earned you ◎12.3 this week" and a living, zoomable money
tree of their lineage. Forking stops being theft and becomes the most rewarding thing
a creator can hope for. That is an economic primitive no platform has.

## What you're inventing

A **royalty graph native to agent lineage.** When an agent is forked, the creator can
set a small, capped royalty (e.g. 0–10%) that flows from the fork's future earnings to
its ancestors, optionally decaying by generation so it never compounds into a tax. It's
opt-in, transparent before you fork, and provably honored.

## Build it

**Lineage (real, already partly present)**
- `agent_identities.fork_of` is your edge. Build a real ancestor walk (cap depth, e.g.
  ≤8 generations) — a helper `api/_lib/lineage.js` that returns the ordered ancestor
  chain + each ancestor's payout wallet (`agent_payout_wallets` / `solana_address`).
- Add `royalty_bps` + `royalty_decay` to the fork settings (additive migration). The
  fork page (`src/agent-wallet/affordance.js` fork flow + `api/marketplace/[action].js`
  `handleFork`) must show the inherited royalty **before** the user forks. Honest consent.

**Royalty settlement (on-chain, real)**
- When a fork receives a tip (`src/shared/agent-tip.js`) or books revenue
  (`agent_revenue_events`), compute the royalty split across the ancestor chain and
  settle it as **real** SOL/USDC transfers from the fork's custodial wallet, through
  `enforceSpendLimit` + `recordCustodyEvent` (category `lineage_royalty`). Record each
  split in a new `agent_lineage_payouts` table with the on-chain signature.
- Two honest settlement modes — pick the right one and explain it in UI: (a) **instant
  split** at receipt (best for tips: the tip tx and royalty tx are batched/sequential and
  both shown), or (b) **accrue + sweep** on a cron (`api/cron/`) when dust would make
  per-event transfers wasteful. Never strand accrued funds; never fake an accrual number.
- Decay: generation N gets `royalty_bps * decay^N`. Below a dust floor, stop — and say so.

**Visualize the tree (the shareable artifact)**
- A real, interactive lineage graph (zoom/pan, lazy-loaded) on the agent profile and a
  dedicated `/agent/:id/lineage` view: ancestors above, descendants below, edges weighted
  by royalties actually paid (real data from `agent_lineage_payouts`). Each node links to
  that agent. Designed empty state for roots with no forks yet ("be the first to fork").
- "Royalties earned from descendants" + "royalties paid to ancestors" as real, audited
  totals on the owner's wallet hub and the Economy Passport (task 06).

## Innovate further
- **Lineage leaderboards:** most-forked agents, top-earning families, fastest-growing
  trees — real, surfaced on discovery/trending. Forking becomes competitive.
- **Royalty receipts in chat:** an agent can truthfully tell a tipper "thanks — 3% of
  that just went to my creator @x" with the real Solscan link.

## Guardrails
- Royalty is capped and disclosed pre-fork; a fork's owner always keeps the majority.
- Cycle-safe (an agent can't be its own ancestor). Missing/incomplete ancestor wallets
  skip gracefully (log, don't fail the tip). Visitors see the tree; only owners see
  controls. One agent, one owner — royalties never imply shared custody.

## Definition of done
Per the README checklist. Prove live: fork an agent with a real royalty, send the fork a
real tip, watch the split land in the ancestor's wallet with on-chain signatures, see it
on the tree and in both agents' ledgers. Add your improvement, summarize, then delete
this file (`prompts/agent-wallets/innovation/02-lineage-royalties.md`).
