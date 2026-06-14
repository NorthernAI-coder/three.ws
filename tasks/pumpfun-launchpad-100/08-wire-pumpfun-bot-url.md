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
