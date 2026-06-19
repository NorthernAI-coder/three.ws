# Task 05 — Grind-to-Earn: a decentralized, trustless grinding pool

**Read `prompts/vanity-frontier/00-README.md` and `/workspaces/three.ws/CLAUDE.md` first** (rules,
codespace traps, file map). This task depends conceptually on Task 01 (split-key) and Task 03
(proof-of-grind); read those prompts/their outputs if present.

You are a senior distributed-systems + markets engineer. Build a **two-sided grinding marketplace**:
requesters post vanity bounties and pay per result; a fleet of workers (idle browsers, agents,
servers) contribute compute and earn — and thanks to split-key grinding, **workers never see the
final private key.** This is a live network with a real economic loop.

---

## Why this is gamechanging

Hard vanity patterns are embarrassingly parallel but expensive for one machine. A pool turns that
into a market: requesters get patterns that are infeasible solo; workers monetize idle compute;
three.ws takes a fee and creates a recurring use + a sink for $THREE. Crucially, because the work is
**split-key** (Task 01), a worker grinds an *offset against the requester's `P1`* and never learns
the wallet's private key — so this is the first vanity pool that's safe to use for valuable
addresses. Realtime, trustless, paid. Nobody has this.

## What to build (real settlement, real compute, real realtime)

1. **Bounty model + orchestration** (server, in `api/` + `workers/`; the repo already runs
   **Colyseus** — use it for realtime worker coordination):
   - A requester posts: pattern (via Task 04's compiler if available), their `P1`, a reward, an
     escrow/payment. Real payment via x402 / on-chain in USDC and/or **$THREE** (the only coin;
     CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`). Funds escrowed until a valid result lands.
   - The server shards the keyspace (seed ranges / nonce partitions) across connected workers,
     tracks progress, dedupes, and detects the winning offset.
   - On a valid hit, **verify** `P1 + offset·B == vanityPublicKey` server-side before paying — a
     worker can't claim a bogus result. Issue a proof-of-grind (Task 03). Pay the winning worker
     (and optionally distribute partial rewards for contributed work, anti-freeloader/anti-sybil
     design). Real payouts, real settlement — no fake balances.
2. **Worker clients (make joining trivial, no dead ends):**
   - **Browser worker**: a `/pool` page where anyone clicks "earn" and their browser grinds offsets
     via the existing WASM pool, streaming progress over Colyseus, with live earnings. Every state
     designed; pauses on tab-hidden; respects the user's machine.
   - **Agent/CLI/MCP worker**: let three.ws agents and headless nodes join the pool and earn — wire
     a real worker entrypoint (e.g., in `workers/` + an MCP tool) so the agent economy can
     participate.
3. **Marketplace UI**: a `/pool` (or `/grind`) surface showing open bounties, live throughput,
   leaderboards (rarest addresses found, top earners), and a requester flow to post + fund + track
   a bounty. Real data, real-time, designed empty/loading/error/overflow states, accessible.
4. **Economics + integrity**: transparent fee, fair payout math, sybil resistance (don't let a
   worker farm rewards without real work — tie payout to verifiable contributed attempts/shares),
   and escrow that releases only on a verified result or refunds on expiry. Document the model.

## Correctness, security, edge cases

- A worker must never be able to keep or reconstruct the requester's key — verify the split-key
  invariant end-to-end and never route full secrets through the pool.
- Escrow/refund must be airtight: no result by deadline → automatic refund; valid result → atomic
  payout + delivery (sealed/trustless to the requester via Tasks 01/02).
- Realtime resilience: workers disconnect, lie, or stall — handle reassignment, timeouts, and
  duplicate claims. No double-pay.
- Rate limits, abuse protection, and clear handling of patterns that turn out infeasible.

## Definition of done

- A bounty can be posted and funded with **real** payment, sharded to **real** workers (browser +
  agent), solved, verified server-side, certified (Task 03), delivered trustlessly (Task 01/02),
  and the winning worker **really** paid. No mock balances, no fake workers, no simulated payouts.
- Realtime coordination via Colyseus working with multiple concurrent workers.
- `/pool` exercised in a real browser with real earnings/throughput; designed states; accessible;
  responsive; no console errors.
- Tests for sharding, verification, escrow/refund, payout math (vitest + direct `node`).
- `data/changelog.json` entry; `STRUCTURE.md` updated; worker + MCP entrypoints wired.
- **Self-improvement pass:** then improve — e.g., GPU/WebGPU workers, a $THREE-staking boost for
  priority bounties, a reputation system for workers, or proof-of-contribution shares. Ship the
  best.
- **Delete this file** (`prompts/vanity-frontier/05-grind-to-earn-pool.md`) last. Report what
  shipped, where, how to post a bounty and how to earn, and any tradeoffs.

If Task 01's split-key isn't merged, build the pool on the trustless invariant as specified and
integrate the moment it lands — but do NOT ship a version that routes full private keys through
workers. Trustless or nothing. Real economics, no shortcuts.
