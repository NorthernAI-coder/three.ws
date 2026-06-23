# Task — Verifiable On-Chain Backtest Attestation (trustlessly replayable strategy proofs)

> **Operating bar.** Senior engineer + product thinker building three.ws to beat the best in the
> world. Genuinely innovative, not a clone. No mocks, no fake/sample data, no placeholders, no
> TODO/stubs, no `setTimeout` fake-loading. Wire 100% end-to-end with REAL APIs and real on-chain
> data. The only coin is **$THREE** (`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`); runtime mints
> in generic trade plumbing are the only exception and are never promoted.

## ⛓ Chain protocol — do this as STEP 0, before building

This task is a node in a self-extending chain (see `tasks/trading-frontier/README.md`). Before you
build the feature below:
1. Read all of `tasks/` (every epic) + `tasks/trading-frontier/BACKLOG.md`. Know what exists/planned.
2. Invent **10 genuinely new, non-duplicate feature ideas**, each innovative, grounded in the real
   three.ws codebase (cite real files/APIs/tables), advancing sniping/trading/launching/buying/selling.
3. Write each as a full prompt in `tasks/trading-frontier/next/<slug>.md`, matching this file's
   structure exactly — including this Chain protocol section, so the chain continues.
4. Append one line per new prompt to `BACKLOG.md` after confirming it isn't a duplicate.
5. Only then build YOUR feature to the **production-ready bar** in the epic README, and `git rm`
   this file in the completion commit.

## The invention

Every trading platform lets people claim returns; none let anyone *verify* them. Build **verifiable
on-chain backtest attestations**: when a user backtests a strategy with the NL strategy compiler,
publish the result — a deterministic strategy hash, the exact data window, and the headline metrics
(return, Sharpe, max drawdown, win rate) — as a signed attestation on Solana and as an ERC-8004
validation record. Anyone can take the strategy hash + window, re-run the same backtest, and confirm
the published numbers match. It turns "trust me, my bot is up 4x" into a cryptographically anchored,
replayable claim — the trust layer for the entire signal marketplace and arena.

## Context (real, verified)

- Strategy + backtest source: `tasks/next-gen-trading/05` (the NL strategy compiler + backtester)
  produces the strategy definition and deterministic backtest the attestation certifies.
- Solana attestations: the `solana_attestations` table (the existing attestation store to write the
  proof record into).
- ERC-8004 validation: `contracts/src/ValidationRegistry.sol` and `api/erc8004/*`
  (`[action].js`, `register-confirm.js`) for cross-chain validation-record publishing.

## Goal

A pipeline that takes a completed backtest, derives a deterministic strategy hash + metrics digest,
publishes it as a Solana attestation and an ERC-8004 validation record, and offers a public verify
flow that re-runs the backtest and confirms the published numbers.

## What to build

1. **Deterministic strategy hash + digest** — canonicalize the compiled strategy + data window from
   `tasks/next-gen-trading/05` into a stable hash, and hash the metrics digest so any tamper is
   detectable.
2. **Dual-chain publish** — write the attestation to `solana_attestations` and submit an ERC-8004
   validation record via `api/erc8004/*` / `ValidationRegistry.sol`, linking both to the strategy hash.
3. **Trustless replay/verify** — a public verify endpoint + UI that, given a strategy hash, re-runs
   the backtest over the same window and reports match / mismatch with the on-chain record.
4. **Attestation badge + profile surface** — render a "verified backtest" badge (Solscan +
   validation-registry links) on agent profiles and signal-marketplace listings.
5. **UI** — a verify panel: paste/select a strategy hash, see the published metrics, run the replay,
   and view the match result with the chain links. All states designed; responsive; accessible.
6. **Tamper handling** — if a replay diverges, show exactly which metric drifted and by how much; an
   unverifiable claim is clearly marked, never silently passed.

## Constraints

- Any execution triggered from a verified strategy still honors spend guards
  (`api/_lib/agent-trade-guards.js`), custody audit (`agent_custody_events`), and the firewall
  (`api/_lib/trade-firewall.js`) on buys — attestation never bypasses live-trade safety.
- $THREE is the only promoted coin; mints inside attested backtests are trade data only.
- No mocks, stubs, or fake attestations — real Solana writes and real ERC-8004 records only.

## Success criteria

- Reachable in the UI; a real backtest produces a real Solana attestation + ERC-8004 record, and an
  independent replay verifies the published numbers.
- Real `solana_attestations` writes + real `ValidationRegistry` records via `api/erc8004/*`.
- All states designed; responsive at 320/768/1440; accessible (ARIA, keyboard, focus, contrast,
  reduced-motion).
- `npm run build`, `npm run typecheck`, `npm test` clean; `data/changelog.json` entry (tags:
  feature); completionist passes; chain extended with 10 new registered prompts.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file (after authoring + registering 10 chained prompts)

```bash
git rm "tasks/trading-frontier/next/verifiable-onchain-backtest-attestation.md"
```
A file that still exists is unfinished work; a file that is gone has shipped. Do not delete early.
