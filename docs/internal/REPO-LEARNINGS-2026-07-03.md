# Cross-repo learnings — 2026-07-03

Audit of nirholas/cluster + 10 other owned repos (HQ, four.ws, and 8 public) for patterns worth adopting in three.ws. Full analysis was done against shallow clones; this file records the actionable output. Audience: engineers.

## Ranked adoption backlog

| # | What | Source | Why | Effort |
| --- | --- | --- | --- | --- |
| 1 | **Needy-only auto-refill** for the economy master | `cluster` `src/services/fleet.js` `attemptRefill` | Replaces "master tops up everyone below floor" with: refill only wallets below an affordability floor, sized against a remaining *global* cap, bounded by max-refills, journaled. Gives `api/_lib/economy-master.js` a campaign-level spend ceiling. | Medium |
| 2 | **AAD binding in wallet encryption** | improvement *over* `cluster` (which omits it) | Bind `agent_id`+pubkey as AES-GCM `additionalData` in the custodial keystore so a DB-write attacker can't swap encrypted secrets between agents — this is a *known unresolved weakness* listed in `docs/internal/AGENT-WALLET-CUSTODY.md`. | Small |
| 3 | **Keyless-PDA escrow** | `solana-marketplace-escrow` `program/programs/keyless-escrow/src/lib.rs` | Escrow vault is a PDA with no private key; payout destinations fixed at funding time (release→seller, refund→buyer). Direct security upgrade for labor-market/marketplace escrow — can't leak a key that doesn't exist. Has an audit doc + SDK + x402/MCP wrappers. | Medium |
| 4 | **Exact sweep-to-zero fee math** | `cluster` `fleet.js` `sweepBatchFees` | `cuLimit = 200·signers + 450`; per-signer fee reserve; computes the exact fee so the source wallet lands at precisely 0 (sub-rent-exempt dust gets the tx rejected). Replace any flat reserve in sweep/consolidation paths. | Small |
| 5 | **Dry-run + honest landed/total reporting** | `cluster` fleet ops + `reportSwap` | Every spending op returns `{dryRun, plan}` without sending; live runs report `landed/total` *including build-failures*, surface the first error, keep the confirm UI open on total failure. Adopt across sniper/funding/swarm ops. | Small–Med |
| 6 | **Payment circuit breaker + jittered retry** | `agenti` `packages/sdk/src/resilience.ts` | Closed/open/half-open breaker around x402 calls. Our payment paths retry naively or not at all. | Small |
| 7 | **GPU force-graph engine** | `visualize-web3-realtime` `packages/core/src/engine/{ForceGraphSimulation,SpatialHash}.ts` | 5k nodes @ 60fps, one InstancedMesh draw call, framework-agnostic core (skip the React renderer). Scales agent-network / coin-community / oracle-graph visuals. | Medium |
| 8 | **KOL multi-source fetcher fleet** | `kol-quest` `fetchers/sources/*` | 20+ adapters (birdeye, bitquery, dune, flipside, helius, moralis, debank, zerion, covalent, geckoterminal, solscan, gmgn, kolscan…) behind one interface — fattens `kol-mcp`/`signals-mcp` far beyond the current gmgn/kolscan pair. | Medium |
| 9 | **Sanitizing append-only journal** | `cluster` `src/lib/journal.js` | Deep secret-strip at every nesting level, BigInt-safe, never-throw, 0600 append-only; doubles as offline P&L analytics source. Pattern for worker-side money ops alongside `agent_custody_events`. | Medium |
| 10 | **x402 discovery manifest builder** | `agenti` `packages/sdk/src/discovery.ts` | Generates OpenAPI 3.1 + `/.well-known/x402` from route defs for x402scan discoverability. We advertise via bazaar but ship no machine manifest. | Small |

## Also noted (unranked)

- **Stateless HMAC session tokens + scrypt access codes + dep-free Ed25519 verify** — `cluster/dashboard/lib/{session-token,access-code,wallet-auth}.ts`; liftable nearly as-is if we ever need lightweight non-OAuth auth surfaces.
- **On-device ML worker** (transformers.js NER/sentiment off-main-thread with capability fallback) — `HQ/src/services/ml-worker.ts`; free local moderation/sentiment without an LLM call.
- **PumpFun live claim/fee-distribution monitors** — `pumpkit/packages/claim/src/rpc-monitor.ts`, `packages/core/src/monitor/FeeDistMonitor.ts`; we only have one-shot fee collection, no live creator-reward/whale event stream for coin communities.
- **Price anomaly detector** (median/MAD spike scoring) — `agenti/packages/sdk/src/anomaly.ts` → feeds `alerts-mcp`/`signals-mcp`.
- **Portable IP rate-limiter + Upstash-or-memory cache** — `HQ/api/_ip-rate-limit.js`, `_upstash-cache.js`.
- **Resumable job + supervisor engine** (cooperative checkpoint cancellation, secret-stripped persisted params, exponential-backoff campaign restarts) — `cluster/src/services/{jobs,supervisor}.js`; large but the right shape for long-running sniper/spend campaigns.
- **Recovery-snapshot keystore discipline** (timestamped ciphertext backups rotated to 20, atomic tmp+rename writes) — `cluster/src/lib/keystore.js` → mirror in `api/_lib/vault-wallet.js`.

## Explicitly skipped

- **three-ui** — pared-down three.ws snapshot, no improvements; nothing to port.
- **boosty** — WIP, redundant with cluster's more mature fleet engine.
- **four.ws Stripe stack** — subscription billing misaligned with x402/agent-wallet monetization. (Its NextAuth wallet-as-credentials config is a decent reference if we ever want cookie-session wallet login.)
- **pumpfun-creator-rewards** — we already have `pump-fun-skills/coin-fees`; only its username→wallet→mint resolution is mildly interesting.

## Caveat

`cluster` is single-operator, password-per-action, localhost-trust: **no KMS, no AAD, single per-keystore salt**. Treat its crypto as a floor to improve on (see #2), not a ceiling to copy.
