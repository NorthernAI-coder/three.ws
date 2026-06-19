# Task 10 — Social Trading Arena: On-Chain PvP Tournaments ($THREE prizes)

> **Operating bar (applies to the whole task).** Senior engineer + product thinker building
> three.ws to beat the best in the world. Genuinely innovative, not a clone. No mocks, no
> fake/sample data, no placeholders, no TODO/stubs, no `setTimeout` fake-loading. Wire 100%
> end-to-end with REAL APIs and real on-chain data. Every state designed. Only coin is **$THREE**
> (`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`); runtime-supplied mints in generic trade
> plumbing are the only exception and are never promoted. After it works, self-review and ship
> the 10× improvement. `data/changelog.json` entry for every user-visible change. Run the
> **completionist** subagent. Stage only changed paths (never `git add -A`); re-check `git status`.

## The invention

We have **verifiable, tamper-evident track records** (`trader-stats.js`, on-chain attestations).
Turn trading into a spectator sport: **time-boxed PvP tournaments** where agents compete on
*real, verified* PnL over a window, ranked live, with results settled and attested on-chain and
**$THREE prizes** for winners. Entry can be gated or open; performance can't be faked because it's
computed from real closed positions. This converts the leaderboard from a static table into a
recurring, social, competitive product loop that drives engagement and showcases the platform's
real edge — a trading esport for AI agents.

## Context (real, verified)

- Canonical metrics: `api/_lib/trader-stats.js` (`computeTraderMetrics`, composite score,
  verification, ROI, drawdown, Sharpe). Leaderboard + SSE: `api/sniper/{leaderboard,trader,
  stream}.js`. Positions: `agent_sniper_positions`.
- On-chain attestation for tamper-evident results: Solana attestations
  (`solana_attestations`, kinds like `threews.*`), `contracts/src/ReputationRegistry.sol`, and the
  attestation helpers in `@three-ws/sdk` (`attestValidation`, `listAttestations`).
- $THREE is the only coin (`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`) — prizes are $THREE.
  Use the existing platform launch records / $THREE plumbing for prize accounting; never reference
  any other token.
- Identity + reputation: `agent_identities`, ERC-8004 (`erc8004_agents_index`). Real-time:
  `api/sniper/stream.js` SSE pattern.

## Goal

A tournament engine: create/join time-boxed competitions scored on real verified PnL, a live
leaderboard with anti-cheat, on-chain attestation of final standings, and $THREE prize settlement
— surfaced as an Arena product with live spectating.

## What to build

1. **Tournament model** — `tournaments` (id, name, network, scoring [roi_pct|realized_pnl|score],
   starts_at, ends_at, entry_rules jsonb, prize_pool_three, status) and `tournament_entries`
   (tournament_id, agent_id, joined_at, starting_snapshot jsonb, status). Scoring uses only trades
   **opened within the window** to be fair; snapshot each entrant's baseline at join.
2. **Live scoring engine** — compute each entrant's window-scoped metrics from real
   `agent_sniper_positions` via `trader-stats.js`, ranked live. Anti-cheat: reuse the verification
   gates (min trades, min unique coins, churn cap) + a wash/self-trade check (reject coins traded
   only against the entrant's own related wallets — leverage task 03 clustering if present). No
   simulated/paper trades count toward prizes (separate "practice" bracket allowed, clearly
   labeled).
3. **On-chain attestation** — at tournament close, write the final standings as a Solana
   attestation (`threews.tournament.v1` kind) so results are tamper-evident and independently
   verifiable; link the attestation from the results page. Use the existing attestation path; no
   new signing key handling.
4. **Prize settlement** — distribute the $THREE prize pool to winners per the published structure,
   recorded with a real tx + an entry in the relevant ledger, audited. Honest accounting; if prize
   funding is unavailable in an environment, the tournament still runs and ranks, and settlement
   reports BLOCKED(reason) rather than faking a payout.
5. **API + UI — the Arena** — `/api/tournaments` (CRUD, join), `/api/tournaments/:id` (state,
   live standings, prize, attestation link), `/api/tournaments/:id/stream` (SSE live rank changes).
   Build an **Arena** page: list of upcoming/live/finished tournaments, a live competition view
   (animated ranking, each agent's 3D avatar + verified badge + live PnL, recent trades ticker),
   join flow, and a results page with the on-chain attestation + prize distribution. Make it feel
   alive and competitive — this is a showcase surface. Add to `data/pages.json`. All states
   designed; accessible; responsive; reduced-motion friendly.

## Constraints

- Rankings derive only from **real verified closed trades** — never fabricate PnL, never count
  unverifiable or wash trades toward prizes. The integrity is the entire point.
- Prizes are **$THREE only**. Never introduce, name, or reference any other token anywhere in the
  arena (copy, schema, fixtures). Mints shown are runtime trade data, not promotions.
- On-chain attestation must be real (real Solana tx) or honestly reported as unavailable — no fake
  proof links.
- Settlement is real and audited; BLOCKED is a first-class honest outcome when funding is absent.

## Success criteria

- A tournament can be created and joined; live standings compute from real `trader-stats` metrics
  over the window with anti-cheat enforced.
- Final standings are attested on-chain (real tx) and linked from results; $THREE prizes settle
  (or report BLOCKED honestly with the unblock step).
- Arena UI (list, live competition, results) renders all states, is responsive + accessible, and
  is reachable from main navigation; new page in `data/pages.json`.
- Build/typecheck/test clean. Changelog entry (tags: feature). Completionist passes.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

```bash
git rm "tasks/next-gen-trading/10-trading-arena-tournaments.md"
```

A file that still exists is unfinished work; a file that is gone has shipped. Do not delete early.
