# Task — Rug-Loss Protection Vault ($THREE mutual pool, x402-settled claims)

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

The firewall clears a trade as safe — and sometimes a coin still rugs anyway. That residual risk is
exactly what insurance is for. Build a **$THREE-denominated mutual-protection vault**: members pay a
small premium into a shared pool, and when a member suffers a *verified* rug loss on a trade the
firewall had cleared, the pool auto-compensates them, with premiums and claim payouts settled via
x402. It pairs perfectly with the firewall — the firewall reduces rug frequency, the vault covers the
tail — and creates a genuinely novel, self-funding safety net that no launchpad offers. The pool is
$THREE-only; runtime trade mints are just the assets being insured.

## Context (real, verified)

- Firewall decisions: `api/_lib/trade-firewall.js` and the `firewall_decisions` record
  (verdict/enforced) — the cleared-trade ledger that defines coverage eligibility (only trades the
  firewall actually cleared can be claimed).
- Loss truth: `agent_custody_events` (the audited buy/sell trail used to verify a real, realized rug
  loss rather than a normal drawdown).
- Settlement rail: `api/x402-pay.js` (the x402 payment path for premiums in and claim payouts out).
- Pool denomination: **$THREE** (`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`) — the only coin the
  vault holds or pays in.

## Goal

A mutual-protection pool with $THREE-denominated membership/premiums, an automated claims engine that
verifies rug losses against firewall + custody records, and x402-settled premium collection and
payouts, all transparent and solvency-aware.

## What to build

1. **Vault + membership** — a $THREE-denominated pool with membership tiers, premium schedule, and a
   live, auditable pool balance + solvency ratio; premiums collected via `api/x402-pay.js`.
2. **Coverage rules** — only trades present in `firewall_decisions` with a cleared verdict are
   eligible; coverage caps per trade and per member to keep the pool solvent.
3. **Automated claims engine** — verify a claimed rug against `agent_custody_events` (real realized
   loss) + on-chain evidence (e.g. liquidity pull / honeypot), distinguish a rug from an ordinary
   loss, and auto-approve/deny with a transparent reason.
4. **x402 payouts** — settle approved claims to the member via `api/x402-pay.js`, recording the
   payout and updating pool solvency.
5. **UI** — a vault page: join/premium flow, live pool solvency, your coverage, a file-claim flow
   with evidence, and a public claims ledger. All states designed; responsive; accessible.
6. **Solvency safeguards** — pause new coverage / scale payouts if the solvency ratio dips below a
   floor; never promise a payout the pool can't fund.

## Constraints

- Coverage is gated on cleared `firewall_decisions`; loss verification reads `agent_custody_events`;
  any vault-triggered trade honors spend guards (`api/_lib/agent-trade-guards.js`) and the firewall
  (`api/_lib/trade-firewall.js`).
- The vault holds and pays exclusively in **$THREE** — the only promoted coin; insured runtime mints
  are trade data only, never recommended.
- No mocks, stubs, or fake claims — real firewall/custody records and real x402 settlement only.

## Success criteria

- Reachable in the UI as a vault page; a member really joins (premium via x402), a verified rug on a
  firewall-cleared trade auto-pays a real x402 $THREE claim, and pool solvency updates live.
- Real `firewall_decisions` / `agent_custody_events` / x402 data; guard-honored, custody-audited.
- All states designed; responsive at 320/768/1440; accessible (ARIA, keyboard, focus, contrast,
  reduced-motion).
- `npm run build`, `npm run typecheck`, `npm test` clean; `data/changelog.json` entry (tags:
  feature); completionist passes; chain extended with 10 new registered prompts.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file (after authoring + registering 10 chained prompts)

```bash
git rm "tasks/trading-frontier/next/rug-loss-protection-vault.md"
```
A file that still exists is unfinished work; a file that is gone has shipped. Do not delete early.
