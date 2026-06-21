# 11 — Backend caching & CDN

> **Road to $1B · Production-Readiness track.** Paste this whole file into a fresh chat at `/workspaces/three.ws`. Read `CLAUDE.md` + `STRUCTURE.md` first — they override defaults.

**Phase:** 2 · Cross-cutting hardening
**Owns:** `Cache-Control` on API responses, `vercel.json` route caching, R2/Edge-config asset serving, read-path memoization.
**Depends on:** `09`. **Pairs with:** `17` (web vitals), `51` (SEO).

## Why this matters for $1B
Caching is the cheapest performance and cost win available. Read-heavy public surfaces
(gallery, launches, agent profiles, changelog) should be served from the edge, not
recomputed per request. Right caching cuts RPC/DB bills, slashes latency, and lets the
platform absorb a traffic spike instead of melting.

## Map — real anchors
- `api/_lib/http.js` — defaults to `no-store` unless a handler sets `Cache-Control`. Public reads should opt into `public, s-maxage=…`.
- `vercel.json` — per-route cache headers already exist (e.g. `/embed/v1.js` 300s+CDN, `/changelog.json` 600s, `/widget-client.js` immutable) and R2 serving via `/api/cdn-object`.
- Neon Postgres (`api/_lib/db.js`), Upstash Redis (`api/_lib/rate-limit.js` — reusable for caching).

## Do this
1. **Classify every GET endpoint:** public-cacheable (gallery, launches, agent profiles, leaderboards, prices, features), private (user dashboard), or never-cache (auth, payment state). Public reads should set `Cache-Control: public, s-maxage=… , stale-while-revalidate=…`; private reads `private`; money/auth `no-store`.
2. **Edge-cache hot public reads** with `s-maxage` tuned to data freshness + `stale-while-revalidate` so the edge serves instantly while revalidating. Use SWR generously on slow-changing data.
3. **Server-side memoization** for expensive repeated computations (e.g. $THREE balance — already 30s cached; pump quotes; on-chain reads) using Upstash with sensible TTLs and explicit invalidation on writes.
4. **Static assets:** GLBs, textures, fonts, images served with long-lived immutable cache + content hashing; confirm R2/CDN path (`/api/cdn-object`) sets correct headers and compression.
5. **Cache invalidation:** on every write that changes a cached read (new launch, profile edit, new avatar), invalidate or version the cache key — no stale-forever bugs.
6. **Verify hit rates:** check response headers (`x-vercel-cache`, age) in the browser for the hot public routes; confirm HIT after warmup.

## Must-not
- Never cache authenticated or money/payment-state responses publicly.
- Do not set immutable cache on content that changes without a hashed URL.
- Do not cache an error response as if it were success.

## Definition of done
- [ ] Every GET endpoint classified and carries correct `Cache-Control` (public/private/no-store).
- [ ] Hot public reads edge-cached with `s-maxage` + SWR; verified HIT in headers.
- [ ] Expensive on-chain/DB reads memoized with TTL + write-invalidation.
- [ ] Static 3D/image/font assets immutable + content-hashed via CDN.
- [ ] No auth/money response cached publicly; `npm test` green; `git diff` reviewed.

---
**Non-negotiables (CLAUDE.md):** No mocks / fake data / TODOs / stubs — real APIs only. **`$THREE` is the only coin** (CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`) — never reference any other token anywhere. Concurrent agents share this worktree → **stage explicit paths** (never `git add -A`); re-check `git status`/`git diff --staged` before commit. Never commit `api/*.js` starting with `__defProp`/`createRequire` (esbuild trap → `git restore -- api/ public/`). User-visible change → `data/changelog.json` + `npm run build:pages`. Push to BOTH remotes (`threeD`, `threews`) when asked; never pull/fetch from `threeD`.
