# 14 — Backend caching & data layer

**Phase 3. [parallel-safe]** with 12–13.

## Where you are

`/workspaces/three.ws` — three.ws, Vercel functions (`api/`, 769 of them) +
Cloudflare workers, talking to Solana RPC, pump.fun, a database, and KV/edge
storage. Read [CLAUDE.md](../../CLAUDE.md). The only coin is **$THREE**.

## Objective

Hot read paths are cached with correct TTLs and invalidation; the database has
the indexes its queries need; expensive upstream calls (RPC, pump.fun) are
memoized/edge-cached instead of hit per request; cold starts are minimized. The
platform stays fast and cheap as traffic grows.

## Why it matters

At scale, uncached reads against RPC/pump and unindexed DB queries are both a
latency problem and a cost problem — they're how a viral moment becomes an outage
and a bill. A $1B platform serves spikes from cache and reserves origin work for
writes.

## Instructions

1. **Profile the hot paths.** Identify the most-hit read endpoints (trending,
   marketplace, agent profiles, launches feed, leaderboards). For each, find what
   it actually does per request — DB queries, RPC calls, external fetches.
2. **Cache the reads.**
   - Edge/CDN cache public GETs via `Cache-Control` + `s-maxage` +
     `stale-while-revalidate` in responses / `vercel.json`.
   - Memoize expensive upstream results (pump feed, RPC account reads, token
     snapshots) in KV with short TTLs and SWR, keyed precisely. Reuse the
     project's existing KV layer — don't add a second one.
   - Add request-coalescing so a cache-miss stampede doesn't fan out N identical
     upstream calls.
3. **Invalidation.** Define how each cache is busted on the relevant write
   (new launch, profile edit, new review). Stale data on a money/identity
   surface is a correctness bug, not just a perf one — be precise about which
   caches must be strongly consistent vs eventually consistent.
4. **Database indexing.** Review the schema/migrations (`scripts/apply-migrations.mjs`,
   `npm run db:status`). For every frequent query, confirm a supporting index
   exists (foreign keys, sort columns, filter predicates, uniqueness). Add
   migrations for missing ones. Check for N+1 query patterns and batch them.
5. **Cold starts.** Keep function bundles lean (lazy-import heavy SDKs inside the
   handler only when needed), reuse connections across invocations, and prefer
   edge runtime for light read endpoints where compatible.
6. **Pagination.** Confirm every list endpoint paginates (cursor preferred) and
   never returns unbounded result sets. Cross-check the UI consumes it.
7. **Measure.** Record p50/p95 latency and upstream-call count per hot endpoint
   before/after. Prove the cache hit-rate is real.

## Definition of done

- [ ] Top read paths are edge/KV cached with correct TTL + SWR + invalidation;
      cache hit-rate measured and meaningful.
- [ ] Request coalescing prevents miss-stampede fan-out to RPC/pump.
- [ ] Every frequent DB query has a supporting index (migrations added);
      no N+1 on hot paths.
- [ ] List endpoints paginate with bounded result sets.
- [ ] Cold-start weight reduced (heavy SDK imports lazied); connections reused.
- [ ] Before/after latency + upstream-call-count recorded per hot endpoint.
- [ ] `npm run db:status` clean; `npm test` passes.
- [ ] Changelog: `improvement`/`infra` entry if users feel the speed-up.
