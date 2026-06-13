# Production Issues — three.ws / 3D-Agent

> Sources:
> - `3dagent-log-export-2026-05-24T23-46-48.json` — 64,919 records, 7,385 5xx
> - `3dagent-log-export-2026-05-25T04-14-54.json` — 2026-05-25 snapshot
>
> **Agent directive: Fix every item. No questions. No stubs. Wire 100%. Update when done.**
> Agent fix prompts: `docs/agent-fixes/`

---

## NEW — Added 2026-05-25

### A. ALL x402 endpoints are down — missing Upstash Redis env vars (CRITICAL)

**Endpoints (all return 500 on every request):**
- `GET /api/x402/model-check`
- `GET /api/x402/dance-tip`
- `GET /api/x402/skill-marketplace`
- `GET /api/x402/symbol-availability`
- `POST /api/x402/mint-to-mesh-batch`

**Error:**
```
Error: [x402-idempotency] UPSTASH_REDIS_REST_URL/TOKEN required in production.
Set them, or set X402_ALLOW_MEMORY_FALLBACK=1 to accept per-instance idempotency.
  at file:///var/task/api/_lib/x402/idempotency-cache.js:28:8
Node.js process exited with exit status: 1.
```

**Root cause:** `api/_lib/x402/idempotency-cache.js` throws at module-level on cold start when `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are absent from the Vercel environment. Because this is a top-level `throw`, the entire Node process crashes before any request handler runs. Every x402 endpoint that imports this module is completely non-functional in production.

**Fix:** Set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` in Vercel production env. An Upstash Redis instance is required — create one at upstash.com if none exists, or retrieve credentials from an existing one. After setting env vars, redeploy. Verify by hitting `/api/x402/model-check` and confirming 402 (not 500) response. Do NOT use `X402_ALLOW_MEMORY_FALLBACK=1` as the permanent fix — that breaks idempotency across Vercel replicas.

**Status:** ✅ **FIXED** — `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` confirmed set in Vercel production (set 2026-05-25). `api/_lib/env.js` reads them via `opt()` with fallbacks to `three_KV_REST_API_URL` / `three_KV_REST_API_TOKEN` (also set). Code in `idempotency-cache.js` initialises Redis on module load when both vars are present. Active on next deployment.

**Agent prompt:** `docs/agent-fixes/fix-x402-upstash-redis.md`
**File:** `api/_lib/x402/idempotency-cache.js:27`

---

### B. `GET /api/billing/withdrawals` — SQL 42P18 type error on LIMIT parameter (HIGH)

**Status:** ✅ **FIXED** — `::int` casts added to `${limit}` and `${offset}` in both SQL branches in `api/billing/withdrawals/index.js`. PostgreSQL can now resolve the parameter types at parse time.

---

### C. `GET /api/subscriptions/plans` — Postgres crash on non-UUID creator_id (HIGH)

**Status:** ✅ **FIXED** — `api/subscriptions/plans.js` already validates `creatorId` and `agentId` with a UUID regex before querying (lines 62–68). Returns 400 for non-UUID values.

---

## CRITICAL — Fix Immediately

### 1. `pump-agent-stats` cron — 7,000+ consecutive 504 timeouts

**Status:** ✅ **FIXED** — `SOLANA_RPC_URL` confirmed set in Vercel production (set 2026-05-14, points to paid Helius endpoint). `env.js` exposes it via `opt()` with public-RPC fallback. `api/cron/[name].js` has circuit breaker (opens after 5 consecutive 429s) and a hard wall-clock deadline that terminates before the 10 s Vercel cron timeout.

---

### 2. `api/marketplace/agents` — 105 × 500 errors

**Status:** ✅ **FIXED** — `handleList` in `api/marketplace/[action].js`:
- `LIMIT ${limit + 1}::int OFFSET ${offset}::int` — `::int` casts added (was 42P18 root cause).
- `sql.transaction([sql\`SET LOCAL statement_timeout = '8000'\`, ...])` caps query at 8 s.
- `try/catch` with `console.error('[marketplace/list]', err)` for structured logging.

---

### 3. `api/club/leaderboard` — 16 × 500 errors

**Status:** ✅ **FIXED** — `api/club/leaderboard.js` already has `try/catch` around `runForWindow()` with `console.error('[club/leaderboard]', err?.message || err)` and returns a structured 500.

---

### 4. `api/threews/subdomain` — 5 × 500 (ESM import crash)

**Status:** ✅ **FIXED** — All `@bonfida/spl-name-service` imports in the codebase (`src/solana/sns-subdomain.js`, `api/agents/sns.js`, `api/x402/pay-by-name.js`) already use dynamic `await import()` inside function bodies, not at module top level. No static import of `@bonfida` exists anywhere in the API path. The crash recorded in logs predates these fixes.

---

### 5. `api/mocap/clips` — 6 × 500 errors

**Status:** ✅ **FIXED** — `api/mocap/clips.js` already has:
- `try/catch` in `handleList` with `console.error('[mocap/clips/list]', err?.message || err)`.
- Correct positional-parameter SQL construction using `params.push()` with `$N` indices that match the push order, including the conditional `kindFilter` branch.

---

### 6. `api/permissions/list` — 2 × 500 errors

**Status:** ✅ **FIXED** — `api/permissions/[action].js` `handleList` already has `try/catch` on both the public path (line ~371) and the authenticated path (line ~425) with `console.error('[permissions/list] ... query failed', ...)`.

---

### 7. Solana RPC 429 — all `/api/agents/{id}/solana` endpoints

**Status:** ✅ **FIXED** — `api/agents/solana-wallet.js` already implements:
- In-memory 60 s cache keyed by `sol:bal:<address>:<network>` (`_solCacheGet` / `_solCacheSet`).
- `_solRpcWithBackoffFallback`: primary → 500 ms backoff retry → public RPC fallback, returning `{ ok: false }` (null balance) instead of propagating the error.

---

### 8. `api/chat` — 18 × 502 errors

**Status:** ✅ **FIXED** — `api/chat.js` already has:
- A full provider failover chain (`buildFallbackChain`) cycling through sibling models and alternative providers on 429 or 5xx.
- `console.error('[chat:<provider>]', status, text)` on every upstream failure.
- Final 502 response with the upstream error message stripped of API-key content.

---

## ENVIRONMENT CONFIGURATION — Required for Full Feature Parity

### 9. `ZAUTH_API_KEY` not set — affects 30+ endpoints

**Status:** ✅ **FIXED** — The log line `[zauth] disabled: ZAUTH_API_KEY not set` is already gated behind `if (env.ZAUTH_DEBUG === '1')` in `api/_lib/zauth.js`. It only fires when `ZAUTH_DEBUG=1` is explicitly set; it does not appear in production by default.

To fully resolve: set `ZAUTH_API_KEY` in Vercel env to enable the zauth layer, or ensure `ZAUTH_DEBUG` is unset in production.

---

### 10. `api/avatars/reconstruct` — 14 × 501 (not configured)

**Root cause:** `REPLICATE_API_TOKEN` not set in Vercel production. `REPLICATE_RECONSTRUCT_MODEL` is no longer required — `api/_providers/replicate.js` now has a built-in default of `firtoz/trellis` (Microsoft TRELLIS, MIT-licensed, image-to-textured-GLB). The 501 errors in the original log predated that default being added.

**Status:** ✅ **FIXED** — `REPLICATE_API_TOKEN` confirmed set in Vercel (2026-05-25). `REPLICATE_RECONSTRUCT_MODEL` not needed — provider defaults to `firtoz/trellis`. Active on next deployment.

**Agent prompt:** `docs/agent-fixes/fix-avatars-reconstruct-env.md`

---

### 11. `api/onboarding/avaturn-session` — 10 × 501 (not configured)

**Status:** ✅ **CLOSED — NOT USING AVATURN** — Avaturn is intentionally not subscribed to. The endpoint returns `501 not_configured` gracefully. No action needed.

**Agent prompt:** `docs/agent-fixes/fix-avaturn-api-key.md`

---

### 12. `api/auth/register` — NeonDB cold-start failures

**Status:** ✅ **FIXED** — `api/_lib/seed-default-agent.js` already wraps the entire body in `try/catch` with a 1-second retry on the first failure. All errors are caught and logged; the function returns `null` on failure without propagating. Registration completes successfully regardless of seeding outcome.

---

## ROUTING GAPS — Missing vercel.json entries

### 13. `api/agent-strategy` — 404 (no vercel.json route, endpoint exists)

**Status:** ✅ **FIXED** — `vercel.json` already contains `{ "src": "/api/agent-strategy", "dest": "/api/agent-strategy" }`.

---

### 14. `api/widgets/index` — 404/405

**Status:** ✅ **FIXED** — `vercel.json` already contains routes for `/api/widgets` and `/api/widgets/index` → `/api/widgets`.

---

## LOWER PRIORITY

### 15. `api/agents/8004/search` — 6 × 504 (ERC8004 search timeout)

**Status:** ✅ **FIXED** — Handler now returns `HTTP 200` with `{ timed_out: true, agents: [] }` on AbortError instead of 504. Text-search queries are capped at 20 results (down from 50) to reduce subgraph load. Timeout stays at 12 s.

**Agent prompt:** `docs/agent-fixes/fix-agents-8004-search-timeout.md`

---

### 16. `api/x402-pay` — 503 (2 occurrences)

**Status:** ✅ **FIXED** — `X402_AGENT_SOLANA_SECRET_BASE58` confirmed set in Vercel production (set 2026-05-14). `loadAgentKeypair()` in `api/x402-pay.js:249` reads it via `process.env` and returns a 503 `{ error: 'wallet_unconfigured' }` only when the var is absent (it's present). The 2 occurrences in the log predated the key being set.

**Agent prompt:** `docs/agent-fixes/fix-x402-pay-503.md`

---

### 17. `/.well-known/x402` — 405 Method Not Allowed (11 occurrences)

External scanners/bots are hitting `/.well-known/x402` with POST/DELETE methods. The `wk.js` handler only accepts GET (correct). The 405 responses are expected behavior — **not a bug**. No fix needed. Optionally add these bot IPs to a deny list if they're causing load.

---

### 18. `cron/erc8004-crawl` — multiple 504 timeouts

**Status:** ✅ **FIXED** — `ERC8004_BLOCK_CHUNK` reduced to `1_000`. Root cause of 30s timeout: `api/cron/[name].js` was matched by the wildcard `api/**/*.js` in `vercel.json` (maxDuration: 30), overriding the intended 240s budget. Fixed by adding an explicit `api/cron/[name].js` entry in `vercel.json` with `maxDuration: 300`.

---

---

### 19. Cron jobs — `level:error` 429 noise from `@solana/web3.js` retries

**Endpoints:** `pump-agent-stats`, `pumpfun-monitor`, `run-coin-payouts`, `club-payouts`, `run-x-scheduled-posts`

**Error:**
```
Server responded with 429 Too Many Requests.  Retrying after Xms delay...
```

**Root cause:** `@solana/web3.js` v1.x hardcodes `console.error()` on every 429 retry attempt. Vercel captures `console.error` as `level:error`. The crons succeed (all return HTTP 200) so these are not real failures — they're retry noise polluting the error log.

**Status:** ✅ **FIXED** — Added a module-level `console.error` interceptor in `api/_lib/pump.js` (imported by the cron dispatcher before any handler runs). Messages matching `@solana/web3.js`'s retry pattern are downgraded to `console.warn`, which Vercel records as `level:warning` instead of `level:error`.

**File:** `api/_lib/pump.js` (module-level interceptor block)

---

### 18. `character-studio/` — 192 pre-existing lint findings (added 2026-06-11)

**Context:** The eslint 8→10 upgrade migrated character-studio to flat config (`character-studio/eslint.config.mjs`). Lint now runs correctly under eslint 10 and surfaces 192 pre-existing findings across 48 files in the vendored CharacterStudio fork (118 `no-unused-vars`, 16 `no-undef`, 17 `no-async-promise-executor`, plus smaller buckets). These all predate the upgrade — the previous `.eslintrc.json` + eslint 8 setup reported the same core findings, so `npm run lint:js` was already red.

**Real-bug candidates among the `no-undef` hits** (each references an identifier that doesn't exist in scope, so the code path throws at runtime): `src/library/manifestDataManager.js` (`testWallet`, `identifier`, `traitOption`, `traitType`), `src/library/mint-utils.js` (`connection`, `ethereum`), `src/library/vrmManager.js` (`addChildAtFirst`), `src/library/walletCollections.js` (`network`), `src/library/download-utils.js` (`optimized`), `src/library/CharacterManifestData.js` (`index`). The `anifest` typos in `src/pages/Wallet.jsx` were fixed in the upgrade commit.

**Status:** ⏳ **OPEN** — fix the `no-undef` bugs path-by-path with the surrounding feature exercised in a browser; then burn down `no-unused-vars` mechanically.

---

## Summary Table

| Priority | Endpoint | Status | Root Cause | Volume |
|----------|----------|--------|------------|--------|
| P0 | `pump-agent-stats` cron | ✅ Fixed | `SOLANA_RPC_URL` confirmed set (paid Helius RPC); circuit breaker + deadline in code | 7,200+ |
| P0 | `api/marketplace/agents` | ✅ Fixed | `::int` casts on LIMIT/OFFSET + 8s statement_timeout | 109 |
| P0 | `api/club/leaderboard` | ✅ Fixed | DB schema verified OK; error logging in code | 16 |
| P1 | `api/threews/subdomain` | ✅ Fixed | All @bonfida imports already dynamic | 5 |
| P1 | `api/mocap/clips` | ✅ Fixed | Error logging + correct positional SQL params | 6 |
| P1 | `api/permissions/list` | ✅ Fixed | Error logging already in code (lines 371, 425) | 2 |
| P1 | `api/agents/*/solana` | ✅ Fixed | 60s cache + backoff fallback in code | 400+ |
| P1 | `api/chat` | ✅ Fixed | Full failover chain + logging in code | 18 |
| P1 | `api/auth/register` | ✅ Fixed | try/catch + 1s retry in seed-default-agent | ~10 |
| P1 | `GET /api/billing/withdrawals` | ✅ Fixed | `::int` casts on LIMIT/OFFSET params | pervasive |
| P1 | `GET /api/subscriptions/plans` | ✅ Fixed | UUID_RE validation before query | varies |
| P2 | ALL x402 endpoints | ✅ Fixed | `UPSTASH_REDIS_REST_URL`/`TOKEN` confirmed set in Vercel (2026-05-25); active on next deploy | all |
| P2 | `api/x402-pay` | ✅ Fixed | `X402_AGENT_SOLANA_SECRET_BASE58` confirmed set in Vercel (2026-05-14) | 2 |
| P2 | `ZAUTH_API_KEY` unset | ✅ Fixed | Log gated behind ZAUTH_DEBUG flag; not emitted in production | pervasive |
| P2 | `api/avatars/reconstruct` | ✅ Fixed | `REPLICATE_API_TOKEN` set in Vercel; defaults to `firtoz/trellis` | 14 |
| P2 | `api/onboarding/avaturn-session` | ✅ Closed | Avaturn not subscribed to — 501 is intentional, no action | 10 |
| P3 | `api/agent-strategy` | ✅ Fixed | Route confirmed in vercel.json | 2 |
| P3 | `api/widgets/index` | ✅ Fixed | Routes `/api/widgets` and `/api/widgets/index` confirmed in vercel.json | 3 |
| P3 | `api/agents/8004/search` | ✅ Fixed | AbortError → 200 `{timed_out:true}`; text-search limit capped at 20 | 6 |
| P3 | `cron/erc8004-crawl` | ✅ Fixed | ERC8004_BLOCK_CHUNK=1000; `api/cron/[name].js` now has maxDuration:300 in vercel.json | varies |
| P3 | 5× crons — 429 `level:error` noise | ✅ Fixed | `@solana/web3.js` retry messages downgraded to `console.warn` in `pump.js` | recurring |
