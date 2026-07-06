# 04 — Free Crypto Data API: Live pump.fun Launches

Read `prompts/x402-overhaul/00-CONTEXT.md` first, then `/workspaces/three.ws/CLAUDE.md`.
Independent work order — completes fully on its own.

## Agent use-case (name it in the docs)
A sniper/discovery agent wants the freshest pump.fun launches with enough signal to filter:
name, symbol, mint, age, current market cap, bonding-curve progress, dev wallet. A free live
feed is exactly what agents poll.

## Build — `GET /api/crypto/launches`
- New file `api/crypto/launches.js`, free plain-handler pattern (00-CONTEXT).
- Input: `?limit=<N default 20, max 100>&minMarketCap=<usd optional>&maxAgeMin=<optional>`.
- Data: reuse the existing pump.fun feed helpers — `_lib/pump-launch-feed.js`,
  `_lib/pumpfun-ws-feed.js`, `_lib/agent-pumpfun.js`, `_lib/pump-trending-score.js`. Do NOT
  build a new scraper; wrap what exists. If those helpers expose more than we surface, surface
  the useful fields.
- Output: `{ launches: [{ mint, name, symbol, createdAt, ageMinutes, marketCapUsd,
  bondingProgressPct, dev, url, imageUrl }], count, ts, source }`. Sorted newest first;
  respect filters.

## Catalog registration
Drop `api/_lib/crypto-catalog/launches.js` (entry shape per 00-CONTEXT).

## States
No launches match filter → 200 `{ launches: [], count: 0 }` with a note, not an error. Feed
source momentarily empty/down → 200 with last-known or empty + `source` note; never 500.
Cap limit at 100.

## Tests
Filter logic (minMarketCap, maxAgeMin, limit cap); field mapping from the feed helper;
empty-result shape. Use synthetic/`$THREE` fixtures — never commit a real third-party mint.

## Definition of done
Inherit 00-CONTEXT DoD + gates. Plus:
- [ ] Live call captured in PROGRESS.md (real recent launches).
- [ ] `docs/crypto-api.md` section + curl + use-case.
- [ ] `data/changelog.json` (tags: `feature`) — "Free live pump.fun launches feed for agents".
- [ ] Note in PROGRESS: this pairs with `/api/crypto/bonding` (05) and `/api/crypto/whales`
      (06) — cross-link them in docs if those pages exist.
