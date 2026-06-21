# 40 · Caching, CDN & Asset Delivery

## Mission
Assets (GLBs, textures, animations, images, JS) load fast worldwide with correct cache headers,
immutable hashing, and a healthy CDN/R2 setup — and never serve stale HTML.

## Context
- `vercel.json` has an asset cache route (`max-age=604800, stale-while-revalidate=2592000` for
  media). R2 storage + CORS (`npm run apply:r2-cors`, `scripts/set-r2-cors.mjs`). Three.js decoders
  copied via `scripts/copy-three-decoders.mjs`. GLB optimize/compress scripts exist.

## Tasks
1. **Cache headers:** hashed/immutable assets → `immutable, max-age=31536000`; HTML → revalidate (no
   stale pages); media → the long SWR policy. Audit + fix headers per asset class in `vercel.json`.
2. **R2/CDN:** verify R2 CORS is correct (`apply:r2-cors`), assets are reachable cross-origin, and
   user-generated GLBs are served efficiently with correct content types + caching.
3. **Asset optimization:** run `optimize:glb`/`compress:glbs`; ensure shipped GLBs are compressed
   (meshopt/Draco/KTX2 as appropriate) and decoders are present (`copy-three-decoders`).
4. **Preload/preconnect:** preconnect to asset origins; preload the LCP asset per key page (coordinate
   with prompt 11).
5. **Cache busting:** confirm deploys invalidate HTML/JSON appropriately; no users stuck on old bundles.
6. **Fallbacks:** asset-origin failure degrades gracefully (default avatar/rig), never a hard break.

## Acceptance
- Correct cache headers per asset class; HTML never served stale; immutable assets cached a year.
- R2 CORS + content types correct; user GLBs served efficiently; decoders present.
- Assets optimized/compressed (document size deltas); LCP asset preloaded; graceful asset-failure fallback.

---
### Operating rules — read CLAUDE.md + STRUCTURE.md first. No mocks/fake data/stubs. $THREE only (`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`). Stage explicit paths; never `git add -A`. Don't commit `api/*.js` bundles. `vercel.json` changes are deploy-time. User-visible change → `data/changelog.json` + `npm run build:pages`. Push both remotes when asked; never pull from `threeD`. DoD = CLAUDE.md checklist.
