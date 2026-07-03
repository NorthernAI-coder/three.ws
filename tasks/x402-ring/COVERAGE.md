# x402 Ring — Endpoint Coverage

Coverage of **every** paid x402 endpoint on three.ws — the tips, services, intel,
health checks and settlements the ring economy pays across, not just
`ring-settle`. The canonical set lives in
[`api/_lib/x402/ring-catalog.js`](../../api/_lib/x402/ring-catalog.js); this file
is the proof each one settles when actually paid.

**46 paid endpoints cataloged** (100% of `paidEndpoint(` construction sites plus
the custom-dance `permit2-paid-demo`), **35 autobuy** (swept on the ring loop) and
**11 autobuy:false** (verified once, out of the loop — each justified below).

## How this file is produced

`scripts/x402-ring-coverage-sweep.js` regenerates this table from a live run: for
each entry it probes the 402 challenge, pays it once via `payX402` (real 402 →
signed Solana USDC transfer → replay with `X-PAYMENT`), records the facilitator
settle signature, confirms the 200 payload is real, and — for the load-bearing
tips/commerce endpoints — asserts the business row landed (tip written, cover
charged, billboard placed, sale recorded).

```
# autobuy set (~$0.30 total):
node scripts/x402-ring-coverage-sweep.js
# include the manual, out-of-loop endpoints (devnet / owner sign-off only):
node scripts/x402-ring-coverage-sweep.js --manual
```

It requires an env-complete, funded context: a payer keypair
(`X402_SEED_SOLANA_SECRET_BASE58`) funded with USDC + SOL, the self-hosted
facilitator on (`X402_SELF_FACILITATOR_ENABLED=true`, task 02), the ring wallets
provisioned (task 03), and `DATABASE_URL`/Redis for the business-effect
assertions. It is designed to run in the task-11 activation window; the
**Settlement status** column below is filled with real signatures by that run.

> **Settlement status (this checkout): PENDING LIVE SWEEP.** This development
> codespace has no payer secret, no facilitator env, and no database, so the live
> settle signatures cannot be produced here. What IS verified in this checkout is
> everything that does not require spending money — the request contract, price,
> Solana-accept wiring, business-effect target, and autobuy safety of every entry
> — from reading each handler. The sweep command above fills the signature column
> during activation.

## Verified in this checkout (static + structural)

- **Catalog covers 100% of paid endpoints** — `tests/x402-ring-catalog.test.js`
  scans every `paidEndpoint(` construction site under `api/` and fails if one is
  missing from the catalog. Current: 43 construction sites + `permit2-paid-demo`
  (custom dance) all cataloged; `api/_lib/aggregator.js` (the dynamic
  `/api/v1/x/*` API-proxy family) is the one documented exclusion.
- **Every `path` resolves** to a real handler file under `api/` (stale-path test).
- **Every `body()`/`query`** was written against the handler's actual validation
  (see per-endpoint contract below) — no empty bodies that 400, no GET-with-body,
  no wrong method. This is the defect the old `VOLUME_ENDPOINTS` list had: it
  POSTed `dance-tip`/`cosmetic-purchase` (both GET → 405), sent `agent-reputation`
  with no body (400), and listed a non-existent `pay-by-name` path.
- **Hourly coverage is test-proven** — the weighted rotation touches every autobuy
  slug within a simulated default-cadence hour (12 ticks × 4 = 48 selections/hour
  ≥ 38-entry rotation).

## Endpoint fixes landed in this task

| Endpoint | Root cause | Fix |
|----------|-----------|-----|
| `api-key-health` | Handler signature was `handler(req)` but `paidEndpoint` passes `handler({ req, … })`, so `req.body` was the context object (always undefined) — the client `scope` was silently ignored and always defaulted. | Destructure `{ req }` and drain the request stream (falling back to a pre-parsed `req.body`). |
| `rate-limit-probe` | Read `req.body` directly; Vercel does not reliably pre-parse it for this POST route, so `endpoint` (required) was empty → **400 on every paid call**. | Drain the stream with a pre-parsed fallback. |
| `feed-health` | Same `req.body` dependency; `feed` (required) empty → **400 on every paid call**. | Drain the stream with a pre-parsed fallback. |
| `wallet-connect` | Header comment claimed a Redis alert key (`x402:wallet-connect:alert`) the handler never writes (doc lie). | Corrected the comment to match the actual behavior. |
| rotation (`volume-shared`) | Hardcoded `VOLUME_ENDPOINTS` list had drifted: `dance-tip`/`cosmetic-purchase` POSTed (both GET → 405), `agent-reputation` sent as bare GET with no body (400), a dead `pay-by-name` path, and `fact-check` ($0.10 LLM) in the cheap rotation. | Replaced the list with a catalog-derived weighted rotation; deleted the stale list. |

## Coverage table (settle signatures pending the live sweep)

Legend: 402 = a paid challenge is returned; Sol accept = a Solana USDC accept is
advertised; Effect = the business row/state a settled call writes. Settlement is
filled by `x402-ring-coverage-sweep.js` during activation.

### autobuy — swept on the ring loop

| Slug | Price | Method | Kind | Business effect (verified target) | Settlement |
|------|------:|:------:|------|-----------------------------------|-----------|
| `ring-settle` | $1.00 | POST | settle | Real USDC payer→treasury; signed ring-tick receipt | pending |
| `dance-tip` | $0.001 | GET | tip | **Inserts `club_tips` row** (tip ledger → visit tiers/revenue) | pending |
| `club-cover` | $0.01 | GET | commerce | **Cover charged** (settled USDC → `x402_audit_log`) + admission pass | pending |
| `club-cover-snapshot` | $0.01 | POST | intel | Reads `club_tips` → membership snapshot | pending |
| `billboard` | $0.05 | GET | commerce | **Writes billboard placement** (Redis `billboard:<coin>`, canary mint) | pending |
| `mint-to-mesh-batch` | $0.05 | POST | service | Token metadata (Solana RPC) → synthesized GLB bytes | pending |
| `pump-agent-audit` | $0.02 | GET | intel | Lists pump.fun launches × `pump_agent_mints` | pending |
| `pump-agent-audit-whale` | $0.02 | POST | intel | Live pump.fun whale-activity signal | pending |
| `three-intel` | $0.01 | GET | intel | Live $THREE market signal (DexScreener) | pending |
| `crypto-intel` | $0.01 | POST | intel | Live market intel (CoinGecko→Coinbase) | pending |
| `token-intel` | $0.01 | GET | intel | Token market + risk signal ($THREE mint) | pending |
| `agent-reputation` | $0.01 | POST | intel | Agent reputation sweep aggregate | pending |
| `agent-bouncer` | $0.01 | GET | intel | Trust-ledger vet (canary id → newcomer verdict) | pending |
| `cross-chain` | $0.005 | POST | intel | External bridge status probe | pending |
| `analytics` | $0.005 | POST | intel | Live analytics report (clubs/24h) | pending |
| `onchain-identity-verify` | $0.005 | GET | intel | Agent→onchain ownership index (canary → verified:false) | pending |
| `bazaar-feed` | $0.001 | POST | intel | Bazaar service discovery feed | pending |
| `unstoppable-status` | $0.01 | GET | service | Reads + records own treasury ledger | pending |
| `symbol-availability-batch` | $0.005 | POST | service | Symbol collision check (batch) vs `pump_agent_mints` | pending |
| `symbol-availability` | $0.001 | GET | service | Symbol collision check (single) | pending |
| `skill-marketplace` | $0.001 | GET | service | Skill marketplace catalog (discovery) | pending |
| `mcp-tool-catalog` | $0.001 | POST | service | MCP tool catalog snapshot (list mode) | pending |
| `avatar-optimize-batch` | $0.001 | POST | service | Analyzes 1 avatar → upserts `avatar_optimization_results` | pending |
| `spend-session` | $0.01 | POST | health | Create/consume cycle → `spend_session_health_log` | pending |
| `telegram-health` | $0.001 | POST | health | Telegram getMe probe | pending |
| `api-key-health` | $0.001 | POST | health | Subscription/internal key validation (fixed: reads body) | pending |
| `did-verify` | $0.001 | POST | health | Resolves + verifies platform DID doc | pending |
| `notify` | $0.001 | POST | health | Records `canary_notification_log` row | pending |
| `auth-health` | $0.001 | POST | health | JWT mint/verify/refresh/expire self-test | pending |
| `model-validation-sweep` | $0.001 | POST | health | Scores stalest avatar → `model_quality_scores` | pending |
| `rate-limit-probe` | $0.001 | POST | health | Probes a target 402 price + spend budget (fixed: reads body) | pending |
| `wallet-connect-health` | $0.001 | POST | health | SIWS nonce probe + latency | pending |
| `solana-register-health` | $0.001 | GET | health | Canary registration via Solana RPC → `mcp_health_canary` | pending |
| `feed-health` | $0.001 | POST | health | Changelog RSS fetch + validate (fixed: reads body) | pending |
| `schema-check` | $0.001 | POST | health | Fetches + validates changelog.json | pending |

### autobuy:false — verified once, out of the loop

| Slug | Price | Method | Why not auto-bought | Settlement |
|------|------:|:------:|---------------------|-----------|
| `pump-launch` | $5.00 | POST | Mints a real pump.fun coin on mainnet (~0.022 SOL + on-chain token) per call. | manual/devnet |
| `endpoint-shopper-run` | $0.01 | POST | Spends up to $2 downstream + real LLM tokens per call. | manual |
| `fact-check` | $0.10 | POST | Real LLM + external search quota per uncached call; priciest intel. | manual |
| `llm-proxy` | $0.005 | POST | Real LLM provider tokens per call. | manual |
| `tutor` | $0.01 | POST | Real LLM tokens + session write per call. | manual |
| `cosmetic-purchase` | dynamic | GET | Durable ownership write + **`cosmetic_sales` insert** + possible on-chain USDC creator payout; up to several $. | manual |
| `skill-call` | dynamic | GET | Author-set price to a third-party author wallet; depends on a live listing slug. | manual |
| `service` | dynamic | GET | Price/payee/upstream are agent-controlled per `agent_paid_services` row. | manual |
| `animation-download` | dynamic | GET | Per-`animation_clips` row; needs a real listed clip id. | manual |
| `asset-download` | dynamic | GET | Per-`paid_assets` row; needs a real asset slug. | manual |
| `permit2-paid-demo` | $0.001 | GET | Base-only, Permit2/EIP-2612-only — the Solana ring payer structurally cannot pay it; verify with an `@x402/evm` wallet. | manual/EVM |

## Tips & commerce — the load-bearing business effects (task 5)

The owner named "tips and services bought and sold." Each writes a **real
business record**, not just the payment log — the sweep's effect-verifier asserts
the row lands:

- **`dance-tip`** → inserts a row into `club_tips` (the tip ledger that feeds
  visit tiers and club revenue). Verifier: `club_tips` row count increments.
- **`club-cover`** → the settled USDC cover charge is the record, logged to
  `x402_audit_log` with `settlement_status='success'`. Verifier: settled
  cover-charge count increments.
- **`billboard`** → writes a placement to Redis `billboard:<coin>` (6h TTL). The
  catalog targets a synthetic canary mint so no real coin-world board is
  overwritten. Verifier: the canary placement key exists after payment.
- **`cosmetic-purchase`** (manual) → grants durable ownership **and inserts a
  `cosmetic_sales` row** (plus an optional on-chain creator payout). Verifier:
  `cosmetic_sales` row count increments.
- **`skill-marketplace`** → this is the **discovery/analytics** surface and does
  not itself record a purchase. The actual per-listing skill purchase + author
  royalty is **`skill-call`** (dynamic, autobuy:false) — cataloged and verified
  once against a known public priced skill.
