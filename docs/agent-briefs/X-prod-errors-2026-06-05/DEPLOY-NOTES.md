# Deploy notes — production error remediation (2026-06-05)

All 12 fixes from [`prompts/`](prompts/) are implemented in the working tree. This file
records (a) what shipped as code, and (b) the **operational actions** that must accompany the
deploy — env vars and a migration that code alone can't set. Do the operational items or some
fixes only half-land.

## Code changes (this session)

| Fix | Files | What changed |
|-----|-------|--------------|
| 01 | `api/_lib/text-extract.js`, `api/widgets/[id]/[action].js` | (already in tree) jsdom→`node-html-parser`; knowledge ingest dynamically imported & isolated. Verified clean. |
| 02 | `api/_lib/rate-limit.js`, `api/_lib/cache.js` | (already in tree) `resilientLimiter` fails open (non-critical) / closed (money) on over-quota `UpstashError`; cache memo + memory fallback. Verified. |
| 03 | `api/_lib/chat-models.js`, `api/chat.js` | (already in tree) reliability-first order, capability-aware routing, dead routes removed, bounded fallback. Verified. |
| 04 | `api/_lib/migrations/20260605120000_usage_events.sql` (new), `api/agents.js` | New idempotent `usage_events` migration; `chat_count` query guarded so a missing table can't 500 the agent fetch. `forge_creations` already guarded + migration present. |
| 05 | `api/_lib/market/ohlcv.js`, `api/ibm/oracle.js` | GeckoTerminal: retry-once on 429, preserve 429 status; oracle wraps all 3 upstream calls → clean 503/404/502. Birdeye path already cached + degrades. |
| 06 | `api/brain/chat.js` | All OpenAI-compatible providers now use `.chat()` (Chat Completions) instead of the Responses API → fixes "Invalid Responses API request" / "unsupported content types"; adaptive retry parses "can only afford N" and re-streams within budget. |
| 07 | `api/_lib/token/config.js` | `publicConfig()` reports `treasury_configured:false` instead of throwing; `treasuryWallet()` stays strict (now a typed 503) on fund-routing. |
| 08 | `api/cron/[name].js` | `IDX_HEAD_CONFIRMATIONS` buffer (cross-RPC head-skew + reorg safety) fixes "block range extends beyond current head"; range/head errors now resume via cursor instead of erroring. RPC rotation/cursor/budget already present; `1rpc.io` already demoted to last. |
| 09 | `src/solana/vanity/grinder-node.js`, `vercel.json`, `api/pump/[action].js` | `ensureWasm` resolves the WASM from multiple candidate paths (bundler-proof); explicit `api/pump/[action].js` function entry ships `src/solana/vanity/wasm/**` + `maxDuration:60`; `uri` bounded to 200 so the launch tx can't overrun 1232 bytes (413 guard already present). Grinder verified working locally. |
| 10 | `api/agents/[id]/skills-pricing.js` | `sql.transaction()` rewritten to the Neon array contract (was the pg interactive callback). |
| 11 | `api/x402-pay/og.js` | Serves SVG directly (no `sharp`/libvips) → kills the Fontconfig error. `play-og.js` and `agent-og.js` already guarded (fallback card / UUID validation). |
| 12 | `api/_lib/db.js`, `api/tts/edge.js` | NUL bytes stripped from all string query params at the `sql` proxy boundary (fixes `0x00` UTF8 insert errors platform-wide); Edge-TTS retries once on the transient HTTP-200 handshake rejection. `llm/anthropic` double body-read already correct (each branch reads once). |

## ⚠️ Operational actions required (not code)

These are the half of the incident that is environment/quota, not logic. Each maps to a fix
above.

### 1. Apply the database migrations to production (Fix 04)
The prod Neon DB is missing `usage_events` (and was missing `forge_creations`). Run the
migration runner against the prod `DATABASE_URL`:
```
node scripts/run-migrations.mjs          # uses DATABASE_URL from env
```
Confirm: `select to_regclass('public.usage_events'), to_regclass('public.forge_creations');`
both non-null, and the rows appear in `schema_migrations`.

### 2. Set `THREE_TREASURY_WALLET` in prod (Fix 07)
The token fund-routing path fails closed without it. Set it to the **real `$THREE` treasury
address** (confirm the value with the owner — do not invent one):
```
vercel env add THREE_TREASURY_WALLET production
```
Until set, `/api/token/config` now returns `treasury_configured:false` (clean) instead of 500,
but any treasury fund-routing stays blocked by design.

### 3. Upstash Redis quota (Fix 02)
The monthly 500k-command cap was exhausted. Code now degrades gracefully, but to restore
full rate-limiting/caching either **upgrade the Upstash plan** or keep usage under the cap.
The cache memo + fail-open changes reduce burn; monitor `UpstashError` frequency post-deploy.

### 4. LLM provider billing/quota (Fix 03 / 06)
- **OpenAI** key is over quota ("exceeded your current quota") — top up billing or it stays a
  dead final tier (it's already ranked last so it only costs one wasted attempt).
- **OpenRouter** free tier credit ceiling drives the `brain/chat` "more credits" errors — the
  adaptive retry handles it, but adding OpenRouter credits removes the degraded-budget path.

### 5. Paid Ethereum RPC for the delegations cron (Fix 08)
Public RPCs (`1rpc.io` etc.) 429 and don't all support `eth_getLogs`. Set a keyed RPC per
chain so it's tried first (the code already honours these env overrides):
```
RPC_URL_1=<alchemy/infura mainnet url>
RPC_URL_8453=<base url>      # + testnet chains as needed
```

### 6. (Optional) Birdeye / market data keys (Fix 05)
If a `BIRDEYE_API_KEY` is configured the three-token path uses the higher tier. GeckoTerminal
is keyless; the retry + caching keep it under the free cap.

## Verification after deploy
Grep the next 24h of function logs — these signatures should be gone or near-zero:
`ERR_REQUIRE_ESM`, `max requests limit exceeded` (as 500s), `Invalid Responses API request`,
`relation "usage_events" does not exist`, `THREE_TREASURY_WALLET is required`,
`transaction() expects an array`, `invalid byte sequence ... 0x00`,
`vanity_grinder_bg.wasm` ENOENT, `encoding overruns Uint8Array`,
`block range extends beyond current head`, `Fontconfig error`, `invalid input syntax for type uuid`.
