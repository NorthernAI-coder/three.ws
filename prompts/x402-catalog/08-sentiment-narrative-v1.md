# 08 — Harden + free-tier the existing v1 sentiment/intel routes

Read `prompts/x402-catalog/00-CONTEXT.md` first and obey every rule in it. Work alone, finish
100%, never ask questions.

## Mission

`api/v1/sentiment.js`, `api/v1/market/intel.js`, and `api/v1/market/projects.js` already exist
but are undocumented, unadvertised, and their access model predates the free-tier strategy.
Audit them, give them a genuine free lane, and document them so they're a real part of the free
crypto API instead of dead routes.

## Context

- Read all three route files end to end, plus their backing modules (`api/sentiment.js`,
  `api/aixbt/*` — note aixbt is a keyed upstream; check which env var it needs and what
  happens today when it's absent).
- Catalog: `api/v1/_catalog.js` — check whether these routes are registered; fix any drift
  between catalog entries and actual behavior (params, auth, summaries).
- Free-tier pattern: unauthenticated per-IP quota via `api/_lib/rate-limit.js`, then a clear
  upgrade message — mirror however `api/v1/pump` or other public v1 routes gate (read what
  exists at the time you run; if nothing else has a free pattern yet, implement per-IP
  rate-limited public access directly — this prompt must not depend on any other prompt).

## Tasks

1. **Audit.** For each of the three routes: does it respond today? With what auth? What does it
   return when its upstream key is missing? Fix anything broken at the root (a route that 500s
   on missing env must 503 with `not_configured` and name the env var).
2. **Free access.** Make sentiment and any keyless-backed intel data publicly readable with a
   per-IP quota (20/min). For aixbt-backed endpoints that consume a paid upstream key, keep
   auth/x402 required but make the 401/402 response state exactly what a caller can do
   (get a key at /dashboard/developers, or pay per call).
3. **Catalog truth.** Update `api/v1/_catalog.js` entries: accurate summaries, params, auth
   levels. Every entry must match observed behavior — verify by invoking the handlers.
4. **Tests** in `tests/api/v1-sentiment-intel.test.js`: each route's happy path with captured
   real-shaped fixtures, missing-env 503 (not 500), quota enforcement, catalog/behavior
   consistency. Targeted vitest until green.
5. **Docs:** `docs/api-reference.md` section for sentiment + market intel with runnable curls
   (use `$THREE` / generic ids for examples). Changelog entry (`improvement`), holder-readable:
   sentiment and narrative intel are now part of the free API.
6. Commit (explicit paths) and push per 00-CONTEXT.

## Definition of done

All three routes verified working (or degrading with honest 503s), freely readable where the
upstream is free, catalog + docs + changelog accurate, tests green, committed, pushed.
