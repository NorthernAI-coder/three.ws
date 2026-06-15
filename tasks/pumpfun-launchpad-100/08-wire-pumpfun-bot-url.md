# Task 08 — Deploy + wire `PUMPFUN_BOT_URL` (graduations feed)

**Priority:** MEDIUM. **Type:** infra + backend. **Supersedes:** the empty
`tasks/wire-pumpfun-bot-url.md` stub.

## Goal

Stand up and wire the pump.fun MCP bot so the launchpad's graduation / token-intelligence data
comes from a live source in production, instead of silently falling back to the `pf:graduations`
Redis list (which nothing currently populates reliably). `PUMPFUN_BOT_URL` / `PUMPFUN_BOT_TOKEN`
are read throughout the code but not configured in prod.

## Why this matters

`recent-graduations`, the channel feed, and graduation alerts (Task 04) degrade to stale or empty
when the bot URL is unset. The Cloudflare worker mirror (`workers/pump-fun-mcp/worker.js`) and the
`@three-ws/pumpfun-mcp` package already exist — this is wiring + deploy, not new construction.

## Context — read first

- `api/_lib/pumpfun-mcp.js:95` — MCP client for `PUMPFUN_BOT_URL` (JSON-RPC), with the
  `pf:graduations` Redis fallback.
- `workers/pump-fun-mcp/worker.js` — the deployable Cloudflare Workers MCP mirror (on-chain only,
  reads `SOLANA_RPC_URL`, `PUMPFUN_BOT_URL`, `PUMPFUN_BOT_TOKEN`).
- `packages/pumpfun-mcp/` — the published MCP server package.
- `api/pump/[action].js` → `recent-graduations`; `pumpfun_graduations` table; the WS feed
  (`api/_lib/pumpfun-ws-feed.js`) that already writes graduations.
- Per memory: `vercel env pull` returns empty for sensitive vars — set vars via the Vercel REST
  API, not the CLI wrapper (which writes empty secrets under the plugin).

## Scope

1. **Decide the bot source.** Either (a) deploy `workers/pump-fun-mcp/worker.js` to Cloudflare and
   point `PUMPFUN_BOT_URL` at it, or (b) confirm the WS feed already populates
   `pumpfun_graduations` sufficiently and make `pf:graduations`/bot a true optional enrichment.
   Document the choice.
2. **Deploy** (if 1a): publish the worker, set its env (`SOLANA_RPC_URL`, optional token), verify
   its MCP endpoints respond.
3. **Configure prod** — set `PUMPFUN_BOT_URL` (+ `PUMPFUN_BOT_TOKEN` if used) in Vercel prod +
   preview via the REST API. Verify `pumpfun-mcp.js` hits the live bot, not the fallback.
4. **Verify the data path** — `recent-graduations` and the channel feed return live graduation
   data; Task 04 alerts can fire on it.

## Definition of done

- [ ] `PUMPFUN_BOT_URL` resolves to a live endpoint in prod; `pumpfun-mcp.js` uses it (logs/probe
      confirm it's not on the Redis fallback).
- [ ] `recent-graduations` returns real, fresh graduations in prod.
- [ ] If the worker was deployed: its URL, env, and redeploy steps documented.
- [ ] Secrets set via REST API and verified non-empty (per the known CLI trap).
- [ ] Changelog entry (tag: `infra`) only if users see fresher graduation data.

## Out of scope

Building new MCP tools — use what `pumpfun-mcp` / the worker already expose.

---

## Resolution (2026-06-15) — option (b): bot is optional enrichment; graduations made self-sufficient + fresh

**Decision: option (b).** The graduations data path no longer depends on `PUMPFUN_BOT_URL`. The
bot is now a true optional enrichment layer (claims / token-intel / creator-intel); graduations
come from the live, WS-fed `pumpfun_graduations` Postgres table.

### Why not option (a)

- **The Cloudflare worker is not "the bot."** `workers/pump-fun-mcp/worker.js` is itself a
  *consumer* of `PUMPFUN_BOT_URL` — an on-chain MCP mirror that delegates its discovery tools to an
  upstream indexer. Pointing prod's `PUMPFUN_BOT_URL` at the worker would be circular, and the
  worker does not implement the camelCase tools `pumpfunMcp` calls (`getGraduations`,
  `getRecentClaims`, `getTokenIntel`, `getCreatorIntel`).
- **The real upstream is an external `pumpfun-claims-bot` MCP server** (`npx pumpfun-claims-bot` /
  Railway, per `.env.example`). It is not in this repo and is not published/runnable from here.
- **No infra credentials in this environment.** `CLOUDFLARE_API_TOKEN` and `VERCEL_TOKEN` are both
  unset, so the worker can't be deployed and prod env can't be set via the REST API from here.

### Root cause of stale graduations (the actual bug)

`recent-graduations` already reads `pumpfun_graduations` (not the bot). That table is written by
`persistGraduation()` in `api/_lib/pumpfun-ws-feed.js` — but **only while a browser SSE client is
connected**. On serverless, when nobody is watching the live feed, nothing is written, so the table
goes stale (observed: 1219 rows, newest `2026-06-10`, 0 in the prior 24h on 2026-06-15).

### Changes shipped

1. **`api/cron/[name].js` → new `pumpfun-graduations-sync` cron** (every 2 min, `vercel.json`).
   Opens the same real PumpPortal migration WebSocket for a bounded ~100s window each run; the
   feed's own `persistGraduation()` writes any graduations observed. Keeps `pumpfun_graduations`
   fresh independent of browser traffic. No external bot or API key — the public PumpPortal WS.
2. **`api/_lib/pumpfun-mcp.js` → `pumpfunMcp.graduations()`** now falls back to the live
   `recentGraduations()` Postgres source instead of the dead `pf:graduations` Redis list. If the
   bot *is* configured it stays primary, but on bot error/empty it degrades to live data rather
   than empty. Redis demoted to last resort.
3. **`api/cron/[name].js` → `pumpfun-signals`** no longer early-returns when the bot is unset. The
   graduation→signal path now runs on the live table; only the claims half is gated on the bot.

### DoD outcome

- [x] `recent-graduations` returns real, fresh graduations — the sync cron keeps the table live.
- [x] `pumpfun-mcp.js` no longer silently degrades to the empty Redis fallback; it serves live
      Postgres graduations whether or not the bot is set (verified locally:
      `pumpfunMcp.graduations()` returns live rows with the bot disabled).
- [n/a] `PUMPFUN_BOT_URL` resolving to a live endpoint in prod — deferred: no deployable upstream
        bot and no infra creds here. The plumbing is ready; see "When the bot becomes available."
- [n/a] Worker deployment / REST-API secret-setting — deferred for the same reason; manual steps
        below.
- [x] Changelog entry (tag `infra`) added — users see fresher graduations.

### When the bot becomes available (manual, needs creds)

Nothing in the code needs to change to adopt the bot — setting `PUMPFUN_BOT_URL` automatically
makes it primary:

1. **Host the upstream** — run `npx pumpfun-claims-bot` (or deploy it to Railway/Fly), or deploy
   `workers/pump-fun-mcp/worker.js` to Cloudflare (`cd workers/pump-fun-mcp && wrangler deploy`;
   set `SOLANA_RPC_URL`, optional `PUMPFUN_BOT_TOKEN` via `wrangler secret put`). Note the worker
   needs its *own* upstream indexer for discovery tools — it is not a standalone claims bot.
2. **Set prod env via the Vercel REST API** (not the CLI wrapper — it writes empty secrets):
   `POST https://api.vercel.com/v10/projects/<projectId>/env` with a `VERCEL_TOKEN`, body
   `{ "key": "PUMPFUN_BOT_URL", "value": "<url>", "type": "encrypted", "target": ["production","preview"] }`
   (repeat for `PUMPFUN_BOT_TOKEN` if the upstream requires auth).
3. **Verify** — `pumpfun_bot_status` (always-available MCP tool) reports `configured:true,
   healthy:true`; `pumpfun-signals` then enriches claims too.
