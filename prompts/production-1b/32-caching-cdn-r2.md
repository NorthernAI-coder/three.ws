# 32 — Caching, CDN & R2 asset strategy

> Part of the three.ws "Production → $1B" program. Run in a fresh chat. Read
> `/CLAUDE.md` first (its rules override everything) and `prompts/production-1b/00-README.md`
> for shared context.

## Why this matters for $1B

3D is heavy: GLBs, textures, animations, and HDRs are megabytes each, and every
uncached fetch is latency the user feels and bandwidth the platform pays for. At $1B
scale, correct `Cache-Control` + CDN edge caching turns a slow viewer into an instant
one and cuts origin egress dramatically. Meanwhile the 500k/month Upstash command
budget means a single hot read that hits Redis on every request can torch the entire
budget in days — so caching is also a cost-survival discipline, not just speed.

## Mission

Ensure static + GLB/3D assets carry correct immutable/long-cache headers, R2 has CORS
+ a lifecycle for orphaned assets, expensive reads are Redis-cached within budget with
stampede protection, and CDN edge caching is used wherever the data allows.

## Map (trust but verify — files move)

- **Cache headers** — [vercel.json](../../vercel.json) `headers` — existing rules:
  versioned `agent-3d` → `max-age=31536000, immutable`; `/avatars/*.glb` &
  `/animations/*` → `max-age=604800, stale-while-revalidate=2592000`; `/assets/*` →
  immutable; generic media regex covers `glb|gltf|hdr|exr|ktx2|basis|bin|woff2|…`.
- **R2 client** — [api/_lib/r2.js](../../api/_lib/r2.js) — S3-compatible (AWS SDK v3):
  `putObject`, `getObject`, `deleteObject`, `headObject`, `copyObject`, presigned
  up/download, `publicUrl(key)`. Env: `S3_ENDPOINT/ACCESS_KEY_ID/SECRET_ACCESS_KEY/BUCKET/PUBLIC_DOMAIN`.
- **R2 CORS** — [scripts/set-r2-cors.mjs](../../scripts/set-r2-cors.mjs) (`npm run apply:r2-cors`)
  — `public-read` (GET/HEAD) + `browser-upload` (PUT) rules with three.ws/preview/codespace/localhost origins.
- **Redis cache primitives** — [api/_lib/cache.js](../../api/_lib/cache.js) —
  `cacheGet/cacheSet/cacheWrap` (TTL), 2s in-process memo, single-flight in-flight
  coalescing, `acquireLock` distributed lock for expensive recompute.
- **Redis budget** — [api/_lib/redis-usage.js](../../api/_lib/redis-usage.js) —
  `REDIS_MONTHLY_BUDGET = 500_000`, warn 80% / crit 90%; [api/admin/redis-health.js](../../api/admin/redis-health.js).
- **Generated GLB storage** — [api/_lib/forge-store.js](../../api/_lib/forge-store.js),
  [api/_lib/reconstruct-finalize.js](../../api/_lib/reconstruct-finalize.js) (put to R2 → `publicUrl`).
- **Tests** — [tests/api/forge-cache-headers.test.js](../../tests/api/forge-cache-headers.test.js),
  [tests/http-cache-control.test.js](../../tests/http-cache-control.test.js),
  [tests/api/redis-usage.test.js](../../tests/api/redis-usage.test.js),
  [tests/api/skill-price-cache.test.js](../../tests/api/skill-price-cache.test.js).

## Do this

1. **Audit asset cache coverage.** For every static + 3D asset type served (GLB,
   GLTF, HDR, EXR, KTX2, BASIS, BIN, fonts, images, versioned JS), confirm a
   `Cache-Control` rule in `vercel.json` matches it. Content-addressed/versioned
   assets get `max-age=31536000, immutable`; mutable-but-cacheable assets get a long
   `max-age` + `stale-while-revalidate`. Fill any gap the audit finds.
2. **Never long-cache mutable HTML/API.** Verify HTML pages and `api/*` responses
   default to `no-store` (via `http.js`) unless a route is explicitly safe to edge-cache;
   long-caching a stale dashboard or balance is a correctness bug. Add `s-maxage` +
   `stale-while-revalidate` only to read endpoints whose data tolerates it (e.g. feeds, changelog).
3. **R2 CORS is current.** Run `npm run apply:r2-cors` and confirm the allowed origins
   cover prod, `*.vercel.app` previews, codespaces, and localhost, with `ETag`/`Accept-Ranges`
   exposed for range requests (GLB streaming). Add any missing origin idempotently.
4. **R2 lifecycle for orphans.** There is no object lifecycle today — generated GLBs
   accumulate forever. Add a lifecycle/cleanup path: either an R2 lifecycle rule for a
   `tmp/`/`scratch/` prefix, or a cron that deletes orphaned/unreferenced objects
   (cross-checked against the DB so nothing live is removed). Never delete a referenced asset.
5. **Cache expensive reads within budget.** Identify hot, expensive reads (on-chain
   scans, snapshots, price/market aggregates). Wrap them in `cacheWrap` with a sane
   TTL. Confirm high-frequency cheap reads use `local`/in-process memo (not a Redis
   GET per request) so the 500k/month budget survives a spike.
6. **Stampede protection on cold cache.** For any expensive recompute, use
   `acquireLock` so a traffic spike against a cold key fans out into ONE recompute
   platform-wide, not N. Verify the in-flight GET coalescing path works under
   concurrent reads.
7. **CDN edge caching.** Ensure cacheable read endpoints set `s-maxage` so Vercel's
   edge serves them without hitting the function/origin, and that GLBs are served from
   the R2 public CDN domain (not proxied through a function). Watch `redis-health` /
   `redis-usage` while exercising to confirm budget headroom.
8. Run `npx vitest run tests/api/forge-cache-headers.test.js tests/http-cache-control.test.js
   tests/api/redis-usage.test.js tests/api/skill-price-cache.test.js`. Verify headers
   live in the browser Network tab (`npm run dev`). Add a `data/changelog.json` entry
   if a user-visible perf change shipped; `npm run build:pages`.

## Must-not

- Never apply `immutable`/long `max-age` to mutable HTML, dashboards, balances, or `api/*` writes.
- Never delete an R2 object that is still referenced — cross-check the DB before any lifecycle delete.
- Never add a hot read that issues a Redis command per request without memo/local bucketing — respect the 500k budget.
- Do not pull/fetch/merge from the `threeD` remote (push-only mirror). No mocks/stubs/TODOs.
- The only coin is `$THREE` — no other token in any cache key, fixture, or copy.

## Acceptance (all true before claiming done)

- [ ] Every static + 3D asset type has a correct `Cache-Control` rule (immutable for versioned, SWR for mutable).
- [ ] HTML/API stay `no-store` except explicitly edge-cacheable reads with `s-maxage` + SWR.
- [ ] `apply:r2-cors` run; CORS covers prod/preview/codespace/localhost with range headers exposed.
- [ ] An R2 lifecycle/cleanup removes orphaned assets only, cross-checked against the DB.
- [ ] Expensive reads use `cacheWrap`; hot cheap reads avoid per-request Redis; budget headroom confirmed.
- [ ] Stampede protection (lock + in-flight coalescing) verified on a cold expensive key.
- [ ] Cache-header tests pass; headers verified in the browser; changelog updated if user-visible.
