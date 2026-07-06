# 06 — Pump.fun data as free `/api/v1` endpoints (including honest whale detection)

Read `prompts/x402-catalog/00-CONTEXT.md` first and obey every rule in it. Work alone, finish
100%, never ask questions.

## Mission

three.ws already has real pump.fun plumbing (`api/pump/*.js`, `api/_lib/pump-launch-feed.js`,
`api/_lib/pump-alert-runner.js`, Helius integration). Expose it as clean, FREE, versioned
endpoints under `/api/v1/pump/*` — including the whale-activity detection currently trapped
inside the paid `api/x402/pump-agent-audit.js` "oracle". Free data here is a funnel to the paid
pump-launch product.

## Context

- These are NOT third-party proxies — they're native routes backed by our own modules, so they
  do NOT go in `api/v1/_providers.js`. They go under `api/v1/pump/` and get registered in
  `api/v1/_catalog.js` (read its header: every native v1 route needs a catalog entry — id,
  method, path, auth, scope, summary, params).
- Read before writing: `api/pump/trending.js`, `api/pump/curve.js`, `api/pump/search.js`,
  `api/pump/dashboard.js`, `api/pump/helius-stats.js`, `api/_lib/pump-launch-feed.js`, and the
  whale logic inside `api/x402/pump-agent-audit.js` (lines defining what a "whale" is: wallet
  buying ≥5 SOL in one tx across top bonding-curve coins).
- Look at how `api/v1/sentiment.js` / `api/v1/market/intel.js` are built (auth handling,
  `wrap`/`json`/`error` from `api/_lib/http.js`, rate limiting) — match that pattern.
- If an `api/pump/*.js` route holds logic you need but it isn't importable (logic inline in
  the handler), extract the shared part into `api/_lib/` and have BOTH routes use it — never
  copy-paste and never break the existing route.

## Tasks

1. Create `api/v1/pump/[action].js` (single dynamic route, matching however `api/v1/agents/`
   or `api/portfolio/[action].js` handles actions) exposing:
   - `trending` — reuse the trending module. Slim, cap 25.
   - `curve` — bonding-curve progress for a mint (`mint` param, example: $THREE CA).
   - `search` — text search over pump tokens (`q` param).
   - `launches` — the three.ws platform launch feed from `pump_agent_mints`
     (`api/_lib/pump-launch-feed.js`) — this is the allowed runtime launch-directory surface.
   - `whales` — port the whale-activity detection from `pump-agent-audit.js` as a free read:
     `limit` param (default 5, max 25), returns `{ wallets, whale_count, total_sol_moved }`.
     Drop the decorative "bullish/bearish signal + confidence" fields — report facts only.
2. Every action: public auth (no key needed), per-IP rate limit (reuse
   `api/_lib/rate-limit.js`; 20/min is fine), proper `cache-control` headers for cacheable
   reads (trending/launches: 30–60s), errors surfaced honestly (upstream down = 503 with a
   clear message, never empty-array fakery).
3. Register all five in `api/v1/_catalog.js` with specific summaries + documented params.
4. **Tests** in `tests/api/v1-pump.test.js`: each action responds through the handler with
   real-shaped fixtures at the module boundary you extracted (fixtures captured from real
   calls), rate limit enforced, unknown action 404s, catalog entries exist and match the
   routes. Targeted vitest until green.
5. **Docs:** `docs/api-reference.md` section for `/api/v1/pump/*` with runnable curls
   ($THREE mint for examples). Changelog entry (`feature`): free pump.fun market data —
   trending, curve progress, search, launches, whale activity.
6. Do NOT modify or delist `api/x402/pump-agent-audit.js` — storefront changes belong to
   prompt 18 and prompts must not depend on each other. Just build the free surface.
7. Commit (explicit paths) and push per 00-CONTEXT.

## Definition of done

Five free pump endpoints live under `/api/v1/pump/*`, registered in the catalog, whale logic
shared (not duplicated) with the existing paid route, tests green, docs + changelog updated,
committed, pushed.
