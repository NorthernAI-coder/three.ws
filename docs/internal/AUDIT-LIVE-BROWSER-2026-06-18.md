# Live Browser Audit — 2026-06-18

Complement to [AUDIT-2026-06-18.md](AUDIT-2026-06-18.md), which deliberately did
**not** run the browser-matrix suite ("`npm test` … was not run wholesale in this
pass"). This pass closes that gap: it drives a real Chromium across the live
public surface and reports what an end user's console actually shows — the class
of defect that source-only and structural audits cannot see.

## Method

`scripts/page-audit.mjs` (the repo's own authenticated full-site console / network
/ layout harness) against two targets:

| Target | Routes | Result |
|---|---|---|
| `BASE_URL=https://three.ws` (prod, real APIs/data) | 10 high-traffic public routes | 7 errors → **2 real bugs**, 5 transient |
| `BASE_URL=http://localhost:3000` (vite dev) | 30 routes | baseline noise only (see below) |

The localhost run is dominated by environment noise that is **not** product
defect and was filtered out of the conclusions:

- **vite HMR websocket failure** (`wss://…app.github.dev/?token=…` → 302) — the
  Codespaces dev-server HMR socket, present on every page (~3 errors/page). Not
  shipped to users.
- **`/_vercel/insights/script.js` 404** — Vercel Analytics, injected only in
  prod.
- **`/api/* Failed to fetch`** — no serverless backend under bare `vite`; every
  call site already catches and degrades.

The production run is the source of truth — no backend-absent noise.

## Findings (production)

### Real defects (fixed this pass)

| # | Route | Console error | Root cause | Fix |
|---|---|---|---|---|
| L1 | `/pricing` | `THREE.GLTFLoader: setMeshoptDecoder must be called before loading compressed files` | The tier-card avatar loaded `/avatars/cz.glb` (ships `EXT_meshopt_compression`) with a bare `GLTFLoader` — the 3D avatar never rendered. | `pages/pricing.html`: import `MeshoptDecoder`, `loader.setMeshoptDecoder(...)` before load. **Verified in-browser: error gone.** |
| L2 | `/agent-economy` | `http-404 /a-embed?model=…` (×2) → cascading `Failed to resolve module specifier "@three-ws/agent-ui"` | No `/a-embed` route existed in `vercel.json` — only `/a/(\d+)/(\d+)/embed` mapped to `a-embed.html`. The economy iframes (`src/agent-economy.js:171`) and `public/getting-started.js` build `/a-embed?…` URLs that 404'd; the 404 body (`public/404.html`) then threw the module-resolution error inside the iframe. | `vercel.json`: add `/a-embed → /a-embed.html` with the embed CSP headers. `/a-embed.html` already returns 200; the clean route was the only gap. |
| L3 | `/404` (live, via any unknown path), `/demos/404`, `/demos/login` | `Failed to resolve module specifier "@three-ws/agent-ui"` then (once resolved) `setMeshoptDecoder must be called…` | These `public/*.html` files are served **verbatim** (no bundler) and imported the bare specifier with **no import map**; the avatar widget never booted. Underneath, `@three-ws/agent-ui`'s own loader (`agent-ui-sdk/src/avatar.js`) also lacked the meshopt decoder, so its default `/avatars/cz.glb` could not parse. | (a) Add an esm.sh import map to the three pages (matches the `public/demos/react-sdk.html` convention). **Verified: module-resolution error gone.** (b) Root-cause: wire `MeshoptDecoder` into `agent-ui-sdk/src/avatar.js`. |

> **L3 follow-up (publish-gated):** the public pages resolve `@three-ws/agent-ui`
> from `esm.sh@0.2.0`, which still carries the pre-fix loader. The avatar fully
> renders only after `@three-ws/agent-ui` is republished (0.2.0 → 0.2.1) so esm.sh
> serves the meshopt fix. That is an `npm publish` (credential-gated) — left as a
> follow-up rather than faked. Bundler-based consumers of the workspace get the
> fix immediately.

### Transient / not-a-bug (verified, no action)

All three resources below return **HTTP 200** in prod and every call site already
try/catches with a graceful fallback — these were single-occurrence
`TypeError: Failed to fetch` blips during the parallel crawl, not defects:

- `/` — `[agent-3d] boot failed` (`/agent-3d/latest/agent-3d.js` → 200)
- `/labs` — `nav: failed to load shared navigation` (`/nav.html` → 200)
- `/launchpad` — `Failed to load watermark` (`/three.svg` → 200; `src/viewer/screenshot.js` falls back to a watermark-less capture)

Also non-defect: `HTTP 401 /api/agents` (expected for anonymous), iframe
`allow-scripts + allow-same-origin` sandbox warnings, and WebGL `GPU stall due to
ReadPixels` performance notes.

### Clean pages (0 errors / 0 warns in prod)

`/marketplace`, `/oracle`, `/forge`, `/skills` audited completely clean.

## Accessibility gaps (fixed this pass)

Surfaced by a parallel source sweep; all low-risk, additive:

- `src/dashboard-next/pages/agents.js` — three avatar `<img>` rendered without
  `alt` → added `alt` from the avatar name/id.
- `pages/go.html` (×3), `pages/compose.html` (×2) — icon-only modal close
  buttons (`✕` / `×`) without an accessible name → added `aria-label`.
- `src/selfie-modal.js` — preview `<img>` without `alt` → added.

## Recommended follow-ups

1. **Republish `@three-ws/agent-ui` (0.2.1)** so the esm.sh-served public pages
   pick up the avatar meshopt fix (L3).
2. **Consider self-hosting an `@three-ws/agent-ui` bundle** (mirroring
   `/agent-3d/latest/agent-3d.js`) so public pages do not depend on esm.sh at
   runtime for a first-party widget.
</content>
</invoke>
