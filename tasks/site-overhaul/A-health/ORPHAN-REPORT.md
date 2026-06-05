# A07 — Orphaned & Duplicate Page Sweep — Report

**Date:** 2026-06-05 · **Track:** Health · **Status:** Complete

Inventory of every `pages/**.html` and `public/**.html`, cross-referenced against the
production route table (`vercel.json`, 625 routes) and the dev/build route map
(`vite.config.js` — Rollup `input`, dev `fileMap`, and dynamic regex branches). Each file is
classified **live / orphan / duplicate / partial**, and every orphan was routed, redirected, or
deleted. No route now points at a missing file.

## How reachability was determined

Production output (`dist/`) is built by `npm run build:vercel` → Vite. The reachability rules:

- **`public/**`** is copied verbatim into `dist/` (the `dist/public` mirror is then flattened
  away), so every `public/x.html` is served at `/x.html`. A clean URL (e.g. `/bazaar`) needs a
  `vercel.json` route → `/bazaar.html`.
- **`pages/*.html`** is emitted **only if it is a Rollup `input`** in `vite.config.js`. Built
  pages land at `dist/pages/...` and are flattened to `dist/<name>.html` (subdirs like
  `ibm/`, `features/`, `dashboard-next/`, `create/` keep their structure). **A `pages/*.html`
  that is not a Rollup input is never built — any route pointing at it 404s in production.**
- The dev server has a generic `/<slug>` → `pages/<slug>.html` fallback, which masks these
  orphans in dev. Production has no such fallback, so the Rollup `input` map is the source of
  truth for what's actually shipped.

A validator script (below) flags (a) `vercel.json` `.html` dests with no build target and
(b) `pages/*.html` files absent from the Rollup inputs. Both now return clean.

## Findings & actions

### pages/*.html — orphans found (9) and resolved

| File | Route | Classification | Action |
|------|-------|----------------|--------|
| `pages/avatar-edit.html` (692 ln, `/src/avatar-edit.js` 27 KB) | `/avatars/:id/edit` (prod route existed → **404**) | **orphan — real feature, unbuilt** | **Wired** — added Rollup input + dev regex branch |
| `pages/create/video.html` (556 ln, `/src/create-video.js` 12 KB) | `/create/video` (prod route existed → **404**) | **orphan — real feature, unbuilt** | **Wired** — added Rollup input + dev `fileMap` |
| `pages/extension-privacy.html` | `/extension/privacy` (prod route existed → **404**) | **orphan — required legal page, unbuilt** | **Wired** — added Rollup input + dev `fileMap` |
| `pages/extension-terms.html` | `/extension/terms` (prod route existed → **404**) | **orphan — required legal page, unbuilt** | **Wired** — added Rollup input + dev `fileMap` |
| `pages/embed-walk.html` (647 ln — Walk-embed snippet generator, actively maintained) | `/embed/walk` (prod route existed → **404**) | **orphan — real feature, unbuilt** | **Wired** — added Rollup input + dev `fileMap` |
| `pages/deal.html` (995 ln — "Agent Deal" payments demo) | `/deal`, `/deal/` | **orphan — superseded by `/demo`, `/pay`, `/agent-exchange`; no inbound links** | **Deleted** file + both routes |
| `pages/pump-3d-agent.html` (16 ln — client-side redirect stub → `/pump-live`) | none | **orphan — dead stub** | **Deleted** |
| `pages/pumpfun-search.html` | none | **orphan — superseded by `/pump-dashboard`, `/pump-live`** | **Deleted** |
| `pages/pumpfun-trending.html` | none | **orphan — superseded by `/pump-dashboard`, `/pump-live`** | **Deleted** |

> The earlier route audit also named `pumpfun-{buy,counter,widget}.html`; those were already
> removed by a sibling agent during this sweep.

After this pass **every `pages/*.html` (114 files) is a Rollup input** — none are orphaned.

### Broken route dest fixed

| Route | Was | Now |
|-------|-----|-----|
| `/paywall`, `/paywall/` | `dest: /public/paywall.html` (**404** — `public/` is stripped in `dist/`) | `dest: /paywall.html` (the flattened verbatim copy). Dev `fileMap` entry added for parity. |

### Duplicate dashboards consolidated

Three dashboard trees existed. Canonical is **`pages/dashboard-next/`** (served at both
`/dashboard/*` and `/dashboard-next/*`).

| Tree | Files | Status | Action |
|------|-------|--------|--------|
| `pages/dashboard-next/` | 16 | **canonical (live)** | keep |
| `public/dashboard-classic/` | 19 | **duplicate** — every `/dashboard-classic/*` is already a `301` to `/dashboard/*` (catch-all `301` covers `index.html`), so the files were dead bytes never served | **Deleted** entire tree |
| `public/dashboard/` | 17 | **duplicate (mostly)** — all clean `/dashboard/*` slugs `301`/rewrite to `dashboard-next`; only `/dashboard/x402` → `public/dashboard/x402.html` is still canonically served | **Left for E06** (owns the dashboard merge); `x402.html` is live, the rest are shadowed |

## public/**.html — classification summary

`public/**` files are all reachable as static `/<path>.html` even without a clean route, so none
are "404 orphans." Notable categories:

- **Live (routed):** `bazaar`, `login`, `register`, `studio/`, `pay/`, `discover/`, `gallery/`,
  `agents/`, `reputation/`, `demos/**`, `demo/**`, `news/**`, `sitemap/`, `validation/`,
  `hydrate/`, etc. — all have `vercel.json` routes and/or Rollup inputs.
- **Partials (intentional, not standalone):** `public/nav.html` (198 ln) and
  `public/footer.html` (125 ln) are fragments injected into every page via `#nav-container` /
  footer loader — **not** routes. Left as-is (do not delete or route).
- **Static-only (reachable at `/<name>.html`, not surfaced in nav):** e.g. `crypto-demo.html`,
  `gmgn.html`, `arbitrage.html`, `siwx-test.html`, `pump-grid-poc.html`,
  `studio-deposit-harness.html`, `wallet-connect-demo.html`. These satisfy the DoD's
  reachability bar (no 404) but are demo/test surfaces; flagged here for a future curation pass
  rather than deleted in this sweep (several are referenced by docs/marketing).

## Verification

```
# (1) vercel.json .html dests with no build target → real 404 routes
# (2) pages/*.html absent from Rollup inputs → unbuilt
node tasks/site-overhaul/A-health/verify-routes.mjs
#   (1) → (none) ✓
#   (2) → (none) ✓
```

Live dev-server spot-checks (`npm run dev`, port 3000):

| URL | HTTP | Title |
|-----|------|-------|
| `/extension/privacy` | 200 | Privacy Policy — three.ws Walk Avatar Extension |
| `/extension/terms` | 200 | Terms of Service — three.ws Walk Avatar Extension |
| `/create/video` | 200 | Talking avatar video · three.ws |
| `/embed/walk` | 200 | Walk Avatar Embed Generator · three.ws |
| `/avatars/:id/edit` | 200 | Customize Avatar · three.ws |
| `/paywall.html` | 200 | Payment Required — three.ws |
| `/deal`, `/pumpfun-search`, `/pump-3d-agent` | 404 | (deleted, as expected) |

## Files changed

- `vite.config.js` — 5 new Rollup inputs (`avatar-edit`, `create-video`, `extension-privacy`,
  `extension-terms`, `embed-walk`); dev `fileMap` + regex branches for `/create/video`,
  `/extension/{privacy,terms}`, `/embed/walk`, `/avatars/:id/edit`, `/paywall`.
- `vercel.json` — removed dead `/deal` routes; fixed `/paywall` dest.
- Deleted: `pages/deal.html`, `pages/pump-3d-agent.html`, `pages/pumpfun-search.html`,
  `pages/pumpfun-trending.html`, `public/dashboard-classic/` (19 files).
</content>
</invoke>
