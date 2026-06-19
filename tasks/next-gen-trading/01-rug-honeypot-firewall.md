# Task 01 — Rug/Honeypot Simulation Firewall (pre-trade safety engine)

> **Operating bar (applies to the whole task).** You are a senior engineer + product
> thinker building three.ws to beat the best in the world. Be genuinely innovative — this
> must be something users can't get elsewhere, not a clone. No mocks, no fake/sample data,
> no placeholders, no TODO/stubs, no `setTimeout` fake-loading. Wire it 100% end-to-end with
> REAL APIs and real on-chain data. Every state designed (loading/empty/error/populated).
> The only coin is **$THREE** (`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`) — never name,
> hardcode, or recommend any other token; runtime-supplied mints in generic trade plumbing
> are the only exception and must never be promoted. When the build works, do a self-review
> pass and ship what would make it 10× better. Add a `data/changelog.json` entry for every
> user-visible change. Run the **completionist** subagent on your diff. Stage only the paths
> you changed (never `git add -A`); re-check `git status` before committing.

## The invention

Every pump.fun sniper buys blind and prays. We will **never let an agent buy a coin it
cannot sell.** Before any buy — discretionary, sniper, or copy — run a real on-chain
*simulated round-trip* and authority audit, and refuse trades that fail. This is a shared
safety kernel that every trade path in the platform calls. The differentiator is that it is
(a) real RPC `simulateTransaction` of an actual buy→sell in one pass, not a heuristic, and
(b) wired into the autonomous worker, not just a UI badge.

## Context (real, verified)

- Buy/sell instruction builders: `api/_lib/pump-swap-ix.js` (`buildPumpSwapInnerIx`),
  `api/_lib/pump.js` (`getPumpSdk`, `getPumpSwapSdk`, `getAmmPoolState`, `getConnection`).
- Worker execution that must call the firewall before broadcast: `workers/agent-sniper/executor.js`
  (`executeBuy`, ~L138-192) and `workers/agent-sniper/trade-client.js` (`signAndSend`).
- Discretionary buy paths: `api/agents/agent-trade.js`, `api/agents/solana-trade.js`
  (`resolveCustodialQuote`), `src/game/coin-buy.js`, wallet-hub `src/agent-wallet-hub/tabs/trade.js`.
- Shared guard module to extend (do NOT fork): `api/_lib/agent-trade-guards.js`.
- RPC with failover: `api/_lib/solana/connection.js` (`solanaConnection`). Helius is available
  (`HELIUS_API_KEY`) for `simulateTransaction` with `sigVerify:false` + account-state diffs.
- Intel already computes structural risk for graduated/observed coins:
  `pump_coin_intel.risk_flags`, `concentration_top1`, `fresh_wallet_ratio` — reuse as inputs,
  don't recompute.

## Goal

A single `assessTradeSafety({ network, mint, side, payer, quoteAmount, connection })` kernel in
`api/_lib/trade-firewall.js` that returns a structured verdict
`{ verdict: 'allow'|'warn'|'block', score, checks: [...], simulated, reasons[] }`, backed by
real on-chain reads, called by **every** buy path and exposed read-only via API + UI.

## What to build

1. **`api/_lib/trade-firewall.js`** — the kernel. Run these real checks (each a named function,
   each returning a typed sub-result; never throw past the boundary — degrade to `warn` with a
   reason if a data source is unavailable):
   - **Mint authority** — fetch the SPL mint account; flag if `mintAuthority` is non-null
     (infinite-supply risk) and whether `freezeAuthority` is set (can freeze your tokens).
   - **Round-trip simulation** — build a buy instruction for `quoteAmount` and a sell of the
     resulting base amount, pack into one v0 message, and `connection.simulateTransaction`
     with `sigVerify:false`, `replaceRecentBlockhash:true`. Parse logs + balance deltas to
     confirm the sell would actually return SOL (honeypot detection). BLOCK if the sell leg
     fails or returns ~0.
   - **LP / curve state** — pre-graduation: read bonding-curve account (real reserves,
     `complete` flag). Post-graduation: `getAmmPoolState` and verify a live pool with
     non-trivial liquidity. BLOCK if no tradable venue.
   - **Concentration / bundle** — pull `pump_coin_intel` if present; WARN on
     `concentration_top1` over a sane threshold, dev-dump flags, or extreme `bundle_score`.
   - **Price-impact ceiling** — reuse `checkPriceImpact` math from `agent-trade-guards.js`.
   - Compose a 0–100 safety score + verdict with explicit human-readable reasons.
2. **Wire it into every buy path** (this is the point — not just a badge):
   - `workers/agent-sniper/executor.js#executeBuy` — call the firewall after the quote, before
     `signAndSend`; on `block`, abort the buy, write the reason to the position `error` field /
     `agent_custody_events`, and continue the loop. Respect a per-strategy
     `firewall_level` (`block`|`warn`|`off`, default `block`) added to `agent_sniper_strategies`.
   - `api/agents/agent-trade.js` + `api/agents/solana-trade.js` — block server-signed buys that
     fail; return a structured 4xx via the existing `tradeGuardResponse` shape with the verdict.
   - Discretionary preview endpoints must include the verdict so the UI can show it pre-trade.
3. **Read-only API** — `GET /api/pump/safety?mint=<mint>&network=<net>&amount=<sol>` (rate-limited,
   public, cached briefly) returning the verdict for any mint. No auth needed to read.
4. **UI** — a compact, reusable **Safety** panel: render the verdict (color-coded allow/warn/block),
   each check with pass/warn/fail + plain-language explanation, and a "what this means" tooltip.
   Surface it in `src/agent-wallet-hub/tabs/trade.js` and `src/game/coin-buy.js` *before* the buy
   button; disable the buy button on `block` (with an explicit override only for `warn`). Use the
   existing design tokens. Designed loading/empty/error states.
5. **Migration** — dated file under `api/_lib/migrations/` adding `firewall_level` to
   `agent_sniper_strategies` and a `firewall_decisions` audit table (mint, network, verdict,
   score, checks jsonb, agent_id nullable, created_at) so blocks are observable/learnable.

## Constraints

- Real `simulateTransaction` against real RPC only — never fabricate a verdict. If RPC is
  unavailable after failover, return `warn` with reason `simulation_unavailable`, never a fake
  `allow`. Honest degradation is the rule.
- Performance: the worker is latency-sensitive at block-0. Cache mint-authority + curve reads
  briefly per mint; run checks concurrently; keep added latency to a few hundred ms and make the
  worker path configurable so a strategy can opt into `warn` (log-only) if it wants raw speed.
- Use the $THREE mint or a clearly-synthetic placeholder in any test fixture; never a real
  third-party mint.
- Extend `agent-trade-guards.js` patterns; don't duplicate spend-limit logic.

## Success criteria

- `assessTradeSafety` is called by the sniper worker, both discretionary endpoints, and the
  read-only API; a known-honeypot-shaped simulation is BLOCKED on a real RPC.
- `firewall_decisions` rows accrue for real blocks/warns; `firewall_level` is honored per strategy.
- Safety panel renders in trade + coin-buy with all states; buy button disabled on `block`.
- `npm run build` + `npm run typecheck` + `npm test` clean. Changelog entry (tags: feature,
  security). Completionist passes.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built,
wired, verified, and committed**, remove it in the same change:

```bash
git rm "tasks/next-gen-trading/01-rug-honeypot-firewall.md"
```

A file that still exists is unfinished work; a file that is gone has shipped. Do not delete early.
