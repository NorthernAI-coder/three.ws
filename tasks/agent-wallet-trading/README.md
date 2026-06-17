# Agent Wallet & Trading → 100% — Completion Plan

**Goal:** Ship the complete, production-grade flow for a three.ws 3D AI agent's
own Solana wallet:

> A user creates an avatar → it has a self-custodied Solana wallet by default →
> the user funds it by scanning a QR with their phone or copying the address and
> sending SOL → the agent can **trade pump.fun tokens**, **snipe new pump.fun
> launches**, and **pay for services via x402** — all from its own wallet, with
> the user always able to withdraw funds back out.

This is **not a rewrite**. The audit below confirms most of the backend already
exists and is real. The remaining work is: deploying the autonomous worker,
wiring the user-facing UX to the bar in `CLAUDE.md`, closing two correctness
gaps, and proving the whole loop end-to-end on devnet. Bar: **100% production
ready, zero error, complete, professional, best-possible UX.**

The only coin this platform references is **$THREE**
(`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`). No other token may be named,
hardcoded, or recommended anywhere in this epic. Runtime-supplied mints in the
generic pump.fun trade path are the only exception and must never be promoted.

## Current state (verified 2026-06-17)

**Real and working — do not rebuild:**

- **Wallet by default.** Every agent created via `POST /api/agents`
  unconditionally generates a real Solana keypair, encrypts the secret
  (AES-256-GCM, key derived from `JWT_SECRET`), and stores it in
  `agent_identities.meta.encrypted_solana_secret` with the public
  `meta.solana_address`. Same on first-login default-agent bootstrap.
  `api/agents.js:258`, `api/_lib/agent-wallet.js:325` (`generateSolanaAgentWallet`),
  `:419` (`recoverSolanaAgentKeypair`), `:18` (`deriveKey`).
- **Custodial signing authority.** Platform can recover the keypair server-side
  to sign — so trading / sniping / x402 from the agent wallet is technically
  possible today.
- **Balance + activity API.** `GET /api/agents/:id/solana` returns live SOL
  balance with RPC failover + 60s cache; `…/solana/activity` returns tx history.
  `api/agents/solana-wallet.js:251`, RPC plumbing `api/_lib/agent-pumpfun.js:26`,
  `api/_lib/solana/connection.js`.
- **QR + copy primitives.** Zero-dep QR generator `src/erc8004/qr.js`; a Receive
  button + QR canvas + copy-address exist on the agent-detail page — but
  **owner-gated** (`bindWalletActions(isOwner)`), not an onboarding surface.
  `src/agent-detail.js:1784`, `pages/agent-detail.html:419-443`.
  Client balance poll: `src/agent-solana-wallet.js:287` (30s).
- **Pump.fun trade (real).** Bonding-curve + AMM buy/sell via `@pump-fun/pump-sdk`.
  `api/pump/[action].js` (buy/sell prep+confirm), instruction builders
  `api/_lib/pump-swap-ix.js`, `api/_lib/pump.js:130`. **But the product path is
  user-signed** (external wallet); only the sniper signs from the agent wallet.
- **Sniper engine (real, not deployed).** `workers/agent-sniper/` is a genuine
  autonomous trader: live PumpPortal feed + scoring (`index.js:97`,
  `scorer.js:21`), real v0 tx signing from the agent keypair
  (`executor.js`, `trade-client.js:29`, `keys.js:25`), serious pre-trade
  guardrails (`executor.js:51`), and position lifecycle
  (`positions.js:20`). PnL/track-record APIs are live: `api/sniper/{strategy,
  history,stream,leaderboard,trader}.js`, migration
  `api/_lib/migrations/20260615020000_agent_sniper.sql`.
- **x402 pay (real).** `api/x402-pay.js` builds/signs/submits Solana USDC x402
  payments; per-agent path exists (`:179` `loadAgentKeypairForUser`, `:611`
  routing). Asset `X402_ASSET_MINT_SOLANA` (`:263`); Solana payload builder `:320`.

**Gaps these tasks close (verified, not speculative):**

| # | Gap | Evidence |
|---|-----|----------|
| 00 | **`schema.sql` never declares the `meta`/`skills` columns every wallet write targets**, and indexes `wallet_address` before that column is added — a fresh DB 500s on the first provision and breaks task 01's backfill | `api/_lib/schema.sql:401-415` (no `meta`/`skills`), `:419-423` (index before `ADD`); `meta` only appears via `migrations/2026-04-29-onchain-unified.sql` which assumes it exists |
| 01 | No single "agent wallet" product surface; legacy agents predating auto-provision may have no wallet; no guaranteed `walletReady` invariant | `api/agents.js:150,258`; no backfill migration |
| 02 | Funding UX is owner-only on agent-detail; no onboarding deposit panel (QR + `solana:` deep-link + live "funds received" confirmation) reachable right after creation | `src/agent-detail.js:1771` (`bindWalletActions(isOwner)`); `pages/create-agent.html:1493` success screen has no fund step |
| 03 | No authenticated endpoint to trade pump.fun **from the agent's own wallet**; only the sniper worker signs from it | `api/pump/[action].js` buy path is user-signed (`:524` verify-after-sign); guardrails live only inside `workers/agent-sniper/executor.js:51` |
| 04 | Buy/sell widget is SOL-only and user-wallet-only; no agent-wallet discretionary trade UI with full state design | `src/game/coin-buy.js` |
| 05 | Sniper worker is **not deployed** — long-lived process, Dockerfile exists, no Cloud Run pipeline / env / watchdog-alerting; nothing fires snipes in prod | `workers/agent-sniper/Dockerfile`; no deploy script; no cron (can't run on Vercel) |
| 06 | No UI to arm a sniper strategy or watch live positions/PnL, though every API exists | `api/sniper/strategy.js` (POST) has no form; `stream.js`/`history.js`/`leaderboard.js` unsurfaced |
| 07 | Graduated positions park forever in `error='graduated:awaiting_amm_exit'`; no automatic AMM exit | `workers/agent-sniper/executor.js:161` (`CoinGraduatedError`) |
| 08 | x402 falls back to a **shared platform wallet** when no `agentId` is passed; no in-product per-agent pay affordance / activity | `api/x402-pay.js:266` (`X402_AGENT_SOLANA_SECRET_BASE58`), `:611` |
| 09 | **No withdraw/sweep path** — the platform takes custodial SOL/SPL deposits with no way for the user to get funds out; no per-agent spend limits or custody audit trail surfaced | no withdraw endpoint; spend caps live only inside the sniper |
| 10 | No end-to-end proof of create→fund→trade→snipe→x402→withdraw on devnet; no one-pass Definition-of-Done sweep across the new surfaces | `tasks/devnet-smoke-trade.md` precedent |

## Execution order

Written to run **independently and in parallel** where possible. Concurrent
agents share one worktree — stage explicit paths, never `git add -A`, and
re-check `git status` before committing.

| #  | Task                                                              | Wave | Blocks   |
| -- | ----------------------------------------------------------------- | ---- | -------- |
| 00 | Schema baseline: declare `meta`/`skills` columns + fix index order| 0    | 01       |
| 01 | Agent-wallet foundation: `walletReady` invariant + backfill + hub | 1    | 02,04,06 |
| 02 | Public/onboarding deposit panel (QR + copy + deep-link + live)    | 1    | 10       |
| 03 | Authenticated "trade from agent wallet" endpoint + shared guards  | 1    | 04       |
| 04 | Agent-wallet pump.fun trade UI (buy/sell, all states)             | 2    | 10       |
| 05 | Deploy sniper worker to Cloud Run (simulate→live, watchdog alerts)| 1    | 06,10    |
| 06 | Sniper arming UI + live positions/PnL dashboard                   | 2    | 10       |
| 07 | Automatic AMM exit for graduated positions                        | 1    | —        |
| 08 | x402: per-agent wallet default + in-product pay + activity        | 1    | 10       |
| 09 | Custody safety: withdraw/sweep, spend limits, key/audit hardening | 1    | 10       |
| 10 | End-to-end devnet smoke harness + Definition-of-Done sweep        | 3    | —        |

```
00 ─→ 01 ─┬─→ 02 ─┐
    ├─→ 03 ─→ 04 ─┤
    └─→ 06 ←─ 05 ─┼─→ 10 (e2e + DoD sweep)
07 ── independent  │
08 ── independent ─┤
09 ── independent ─┘
```

## Definition of done (whole plan)

- A first-time user creates an avatar and, on the same success screen, can scan a
  QR (or copy the address / tap a `solana:` deep-link) to fund the agent wallet,
  and sees the balance update live when SOL arrives.
- From the agent's own funded wallet the user can: buy & sell a pump.fun token,
  arm a sniper strategy that fires on real new launches, and pay an x402 endpoint
  — each with designed loading/empty/error/success states, hover/active/focus,
  mobile-responsive at 320/768/1440, a11y, and zero console errors/warnings.
- The user can withdraw all SOL and SPL tokens back to any address; spend limits
  and a custody audit trail exist.
- The sniper worker is deployed and running (simulate verified, live gated), with
  feed watchdog + alerting.
- Graduated positions exit automatically via AMM; no position parks indefinitely.
- `node scripts/agent-wallet-smoke.mjs` (task 10) proves the full loop on devnet,
  re-runnably.
- Every user-visible change has a `data/changelog.json` entry; `npm run build`,
  `npm run typecheck`, and `npm test` are clean; the **completionist** subagent
  passes on each task's changed files.

When every numbered task file in this directory has been shipped and deleted,
delete this README in the final commit.
