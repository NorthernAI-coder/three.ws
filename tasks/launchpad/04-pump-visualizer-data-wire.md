# 04 — /pump-visualizer: verify and fix data pipeline + 3D interactivity

## Problem

[pages/pump-visualizer.html](../../pages/pump-visualizer.html) is a Three.js scene where trending pump.fun tokens appear as interactive spheres sized by market cap. The page has full Three.js setup (scene, camera, bloom post-processing, OrbitControls) and fetch calls to three data sources:

- `TRENDING_API = '/api/pump/trending?limit=50'` — `/api/pump/helius-stats` → not the trending endpoint
- `STATS_API = '/api/pump/helius-stats'` — Helius blockchain stats (TPS, slot, block time)
- `LIVE_FEED_API = '/api/agents/pumpfun-feed?kind=mint'` — SSE stream of new launches (EventSource)
- `MIGRATIONS_BACKFILL_API = '/api/pump/recent-graduations?limit=20'` — graduated coins

However, it has never been formally verified. Specific risks:

1. **Three.js sphere rendering** — the code that maps `/api/pump/trending` response tokens to `THREE.Mesh` sphere objects may have field name mismatches (e.g. `marketCap` vs `usdMarketCap` vs `market_cap`) resulting in all spheres being the same (minimum) size.
2. **Texture loading** — coin logos are loaded as textures onto sphere faces. If the image URL field name is wrong or the image is blocked by CORS, every sphere shows as untextured (plain grey).
3. **Click-to-navigate** — clicking a sphere should navigate to `/coin3d?mint=<mint>`. Verify the raycaster event is wired and the mint address is correctly threaded through to the navigation.
4. **Live feed mode** — when mode switches to "feed", the page opens an `EventSource` to `/api/agents/pumpfun-feed?kind=mint`. Verify the SSE endpoint exists and returns the correct event format, that each new-mint event creates a new sphere, and that the sphere count caps to avoid scene overload.
5. **Stats bar** — `STATS_API` populates TPS, slot, and block time. Verify `/api/pump/helius-stats` returns these fields and the DOM updates.
6. **Mode switching** — the three modes (trending / feed / migrations) each have different data sources. Verify switching between modes cleans up the previous data source (closes EventSource, cancels timers) and initializes the new one correctly.

## Target files

- [pages/pump-visualizer.html](../../pages/pump-visualizer.html) — all Three.js and fetch logic is inline

## Verification steps

1. `npm run dev`. Open `http://localhost:3000/pump-visualizer`.
2. Default mode is "trending". Open Network tab. Confirm:
   - `GET /api/pump/trending?limit=50` fires and returns a non-empty JSON array.
   - Each array item has the fields the renderer expects. If not, update the field references.
3. Confirm spheres appear in the 3D scene with varying sizes.
4. Click a sphere. Confirm navigation to `/coin3d?mint=<correct_mint>` (check the URL in the address bar or console).
5. Switch to "feed" mode. Confirm:
   - `GET /api/agents/pumpfun-feed?kind=mint` opens as an EventSource.
   - New spheres appear when events arrive (may take up to 60s on mainnet).
6. Switch to "migrations" mode. Confirm `GET /api/pump/recent-graduations?limit=20` fires.
7. Verify the stats bar (`#vz-stat-tps`, `#vz-stat-slot`) updates from `/api/pump/helius-stats`.

## Fixes to apply

- **Field mapping**: read the actual `/api/pump/trending` response shape in [api/pump/[action].js](../../api/pump/[action].js) (`handleTrending` function). Align all field references in the sphere-creation code.
- **Click navigation**: in the `pointerup`/`click` event handler, after raycasting, navigate via `window.location.href = \`/coin3d?mint=\${encodeURIComponent(intersect.object.userData.mint)}\``. If the handler already does this but uses `window.open`, keep `window.location.href` (same tab) as the default; opening a new tab for every click is jarring.
- **Texture CORS**: coin logo URLs come from pump.fun metadata. If loading as `THREE.TextureLoader` fails due to CORS, use `crossOrigin = 'anonymous'` on the loader. For tokens with no image or failed image loads, use a generated SVG placeholder (use the same `mintIdenticon` approach from [src/launches.js](../../src/launches.js) or a simple colored sphere based on the mint's first byte).
- **Live feed sphere cap**: cap the scene to 200 live-mode spheres. When the cap is hit, remove the oldest sphere before adding the new one (FIFO).
- **Mode teardown**: each mode switch must call `eventSource?.close()`, `clearInterval(refreshTimer)`, and `clearTimeout(pendingFetch)` before initializing the new mode.
- **Empty/loading states**: the `vz-status` element has `data-state="loading"` on init. When data arrives and spheres are placed, set `data-state="ready"`. On fetch error, set `data-state="error"` and update the status text to "Could not load data — retry?"

## Definition of done

- Open `/pump-visualizer`, wait 3 seconds. Spheres of varying sizes appear in 3D.
- Clicking a sphere opens `/coin3d?mint=<correct mint>` in the same tab.
- Switching to "feed" mode opens an SSE connection; new spheres appear when pump.fun events arrive.
- Switching modes tears down the previous data source (no duplicate EventSource connections).
- Stats bar populates with real TPS, slot, block time from `/api/pump/helius-stats`.
- On load failure, `data-state="error"` shows with an actionable message.
- No console errors during normal operation.
- `npm test` green.
- Completionist subagent run on changed files.
