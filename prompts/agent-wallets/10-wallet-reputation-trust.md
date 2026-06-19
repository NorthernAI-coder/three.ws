# Task 10 — Wallet Reputation & Trust (the wallet as a credibility signal)

> **Read [00-README-orchestration.md](./00-README-orchestration.md) first** for the
> ownership model, design tokens, real APIs, hard rules, definition of done, and the
> "improve then delete this file" close-out. Consumes the shared wallet component
> (**task 01**), the ledger from task 07, and the economy from task 08.

## Mission

In a world of infinite forkable avatars, **trust is the scarce asset.** A wallet's
real history — how much it has earned, how long it has been active, how reliably it
pays, how many people forked it, how much it has been tipped — is the most honest
reputation signal three.ws has. Build a **wallet reputation layer**: a real,
non-gameable credibility score derived entirely from real on-chain and ledger
activity, surfaced wherever an agent appears, and wired into discovery so good actors
rise. This is the trust primitive the rest of the agent web lacks.

A reputation built on fake numbers is worse than no reputation. **Every input is a
real, verifiable fact.** No invented scores, no vanity inflation.

## What the score is made of (real inputs only)

Derive reputation from real data you can defend:

- **Earnings & volume** — real income and payment volume from `agent_custody_events`
  (task 08's economy) and on-chain reads.
- **Tips received** — real tips (`/solana/tip` records + on-chain).
- **Age & consistency** — real wallet/agent age and activity cadence from the ledger
  and chain history.
- **Fork lineage** — real `fork_count` and the fork network (`meta.forked_from`); being
  forked a lot is a real signal of value.
- **Payment reliability** — for agents that transact (task 08), real success/failure
  history of settlements.
- **On-chain identity** — whether the agent has a verified on-chain identity
  ([contracts/](../../contracts), ERC-8004) / skill licenses
  ([contracts/skill-license/](../../contracts/skill-license)) as a real trust boost.

Design the scoring to **resist gaming**: weight provable, costly signals (real volume,
age, on-chain verification, tips from distinct funded wallets) over cheap ones
(self-tips, wash activity). Document the formula in the module; it must be
explainable, not a black box. If a signal can be cheaply faked, it earns little or
nothing.

## What to build

If a reputation source doesn't exist, **build it for real**: a server-side
`GET /api/agents/:id/reputation` (and a batch variant for lists) that computes the
score from the real ledger + chain reads, cached sensibly. Never compute a trust score
on the client from a hardcoded table.

1. **A reputation badge/score on the wallet identity** (task 01's chip) — a tasteful,
   honest credibility marker that appears everywhere the agent does. Tiers must reflect
   real thresholds; a brand-new agent honestly reads as "new," not fake-trusted.
2. **A breakdown view** (in the HUD, task 02) — exactly *why* the score is what it is:
   each real input, its contribution, with links to the real evidence (signatures,
   fork lineage, on-chain identity). Transparency is the trust.
3. **Discovery wiring** — let reputation inform ranking/sorting where agents are
   browsed (trending, marketplace, services directory from task 08). Good actors rise
   on real merit. Keep it one real signal among others; never let it become a
   pay-to-win knob.
4. **Anti-gaming honesty** — surface what *doesn't* count (self-tips, wash trades) so
   the score reads as credible. If you detect obvious manipulation, discount it in the
   real computation, not with a fake flag.

## Ownership & roles

- The score is **public** (it's a trust signal others rely on) — owner and visitor see
  the same number. The owner additionally sees actionable guidance ("verify on-chain
  identity to raise trust") tied to real, available actions.
- Reputation is read-only and derived — no one can set or buy it directly. Inputs come
  only from real activity.

## $THREE rule

Volume/earnings are denominated in real assets (SOL/USDC/$THREE) from runtime data.
**$THREE is the only coin named or promoted.** Never reference another token as part
of a score, threshold, or example.

## Innovation mandate

- **Trust you can audit** — unlike a follower count, this score is backed by money and
  time and is fully explainable. That auditability is the innovation; lean into it.
- **Reputation as the antidote to infinite forks** — the user's ownership model means
  anyone can fork an avatar; reputation is what makes the *original* and the *proven*
  agent stand out from a copy. Make that contrast visible (an original with history vs.
  a fresh fork with none).
- **A real leaderboard of trusted agents** — ranked by real reputation, a destination
  that rewards genuine activity. Coordinate with task 05's trader leaderboard and task
  07's pulse stats so the platform's "best agents" views agree and reinforce.
- Invent past this where it raises the bar — but never let a single fabricated input
  touch the score.

## States & edge cases

Brand-new agent with no history (honest "new" state, not a fake high/low score); an
agent with activity but no on-chain verification; a heavily-forked agent; detected
self-tipping / wash activity (discounted in the real computation); an agent that lost
reputation (show it honestly); score unavailable because a data source is momentarily
down (degrade to last-known or "calculating," never a fake number); 0 / 1 / many
inputs in the breakdown; 320/768/1440.

## Definition of done

Per the orchestration README. Plus: the reputation endpoint computes a score from
**real** ledger + chain inputs (no hardcoded contributions) with a documented,
explainable formula; the badge appears on the wallet identity across surfaces; the
breakdown links to real evidence; discovery ranking consumes the real score; obvious
gaming is discounted in the computation; a new agent reads honestly as new; no console
errors; responsive. No non-$THREE coin named or promoted.

When done: self-review + improvement pass, real changelog entry,
`npm run build:pages`, commit (explicit paths only; both remotes if asked), then
**delete this file** (`prompts/agent-wallets/10-wallet-reputation-trust.md`).
