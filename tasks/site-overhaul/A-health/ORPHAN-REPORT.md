# A07 — Orphaned & Duplicate Page Sweep — Report

**Re-sweep:** 2026-06-16 · **Track:** Health · **Status:** Complete
**Verifier:** [`verify-routes.mjs`](verify-routes.mjs) (run from repo root)

Inventory of every `pages/**.html`, `public/**.html`, and root `*.html`,
cross-referenced against the production route table (`vercel.json`) and the
build/dev route map (`vite.config.js` — Rollup `input` + dev clean-URL
middleware). Each file is classified **live / orphan / duplicate / partial**, and
every orphan was routed, redirected, or deleted. No route points at a missing
file.

> An earlier sweep (2026-06-05) resolved a prior batch — `avatar-edit`,
> `create/video`, `extension-{privacy,terms}`, `embed-walk` (wired) and
> `deal`, `pump-3d-agent`, `pumpfun-{search,trending}` (deleted). All of those
> are now live/gone and verified. This re-sweep covers orphans that have
> accumulated since.

## How reachability is determined

```
pages/<path>.html   ─(Rollup input)→  dist/pages/<path>.html ─(flatten-pages-dir)→  dist/<path>.html
public/**           ─(publicDir copy)────────────────────────────────────────────→  dist/**
docs/ , blog/       ─(closeBundle cpSync)─────────────────────────────────────────→  dist/docs , dist/blog
```

- `public/**` ships verbatim, so every `public/x.html` is reachable at `/x.html`;
  a clean URL (`/x`) needs a `vercel.json` route.
- **`pages/*.html` ships only if it is a Rollup `input`** in `vite.config.js`. A
  `pages/*.html` that is **not** an input is never built — any route pointing at
  it 404s in production. The dev server's `/<slug>` → `pages/<slug>.html`
  fallback masks this locally, so the Rollup `input` map is the source of truth.
- Two route definitions must stay in sync: `vercel.json` `routes` (prod) and the
  `vite.config.js` dev clean-URL middleware. Both were updated.

## Headline numbers (post-sweep)

| Metric | Count |
|---|---|
| `pages/*.html` files | 151 — **100% are Rollup inputs** |
| `public/**/*.html` files | 255 |
| Root `*.html` files | 3 (untracked, never ship — see below) |
| Vercel literal `.html` route dests | 202 — **0 broken** |
| Vercel parameterized (`$1`) dests | 7 — all directory-backed |
| **Broken routes (dest → missing file)** | **0** |
| **Orphan `pages/` files (not built)** | **0** |

## Findings & actions — `pages/*.html`

### Orphans wired live — had a route + links, but were never built

These four had a Vercel route **and** inbound links, yet were absent from the
Rollup input map → the route 404'd in production. Added as build inputs in
`vite.config.js` (+ matching dev clean-URL aliases):

| Page | Route | Notes |
|---|---|---|
| `pages/activity.html` (Agent Activity · Oracle) | `/activity` | 14 inbound links; unbuilt |
| `pages/trending.html` (Trending) | `/trending` | 13 inbound links (nav, home); unbuilt |
| `pages/create-next.html` ("Your avatar is ready") | `/create/next` | wired as a create milestone; unbuilt |
| `pages/mint-success.html` ("Agent deployed") | `/mint-success` | post-deploy success page; unbuilt |

### Orphans wired live — linked, but had no route at all

Linked from nav / forge UI with neither a build input nor a route → the links
404'd. Added build input **and** route (`vercel.json` + dev alias):

| Page | New route | Linked from |
|---|---|---|
| `pages/coin-intel.html` (Coin Intelligence) | `/coin-intel` | nav-data, sitemap, `src/radar.js` |
| `pages/compose.html` (Scene Composer) | `/compose` | forge.html, `src/app.js`, `src/forge.js`, sitemap |

### Built pages missing a clean-URL prod route (dev/prod mismatch)

These ship as `dist/X.html` (reachable at `/X.html`) but their clean URL `/X`
was wired only in the dev middleware — linked by clean URL from nav/sitemap, so
they 404'd in prod. Added the missing prod routes:

| Page | New route | Linked from |
|---|---|---|
| `pages/radar.html` | `/radar` | nav, home, launches, sitemap |
| `pages/smart-money.html` | `/smart-money` | nav, sitemap |

### Deleted (dead)

| File | Reason |
|---|---|
| `pages/forge-v2.html` | "Forge v2 preview" — **0** inbound references anywhere; superseded by the canonical `pages/forge.html` (`/forge`). |
| `pages/strategy-lab.html` | Dead **duplicate**. The live, routed `/strategy-lab` is served by `public/strategy-lab.html` (registered in the dev middleware). The `pages/` copy was never a build input and differed — it shipped nothing. |

### Partial — kept intentionally

| File | Reason |
|---|---|
| `pages/gallery-picker.html` | Avatar gallery-picker component embedded by other surfaces (`public/demos/*`, worlds lobby). Build input so its scripts bundle; reachable at `/gallery-picker.html`. Not a nav page — intentional partial. |

## Findings & actions — `public/**.html`

`public/**` files all ship verbatim and are reachable at `/<path>.html` (the
final `vercel.json` catch route `"/(.*)" → "/$1"` serves them), so none are
"404 orphans." Categories:

- **Live (routed):** `login`, `register`, `studio/`, `pay/`, `discover/`,
  `gallery/`, `agents/`, `reputation/`, `validation/`, `demos/**`, `demo/**`,
  `news/**`, `sitemap/`, `strategy-lab`, etc. — all have routes / inputs.
- **Partials (not standalone routes):** `public/nav.html`, `public/footer.html`
  fragments injected via `#nav-container` / footer loader; `public/demos/404.html`
  is the demos lab's designed not-found page (also embedded as the index empty
  state, documented in the `docs/` demo-routes map). Left as-is.
- **Static-only demo/test surfaces:** reachable at `/<name>.html` (satisfy the
  no-404 bar) but not surfaced in nav. Flagged for a future curation pass rather
  than deleted here — several are referenced by docs.

### Root `*.html`

`demo5.html`, `demo6.html`, `example.html` exist in the repo root but are
**untracked** (not in git) and are **not** built or copied — Vite only processes
`pages/` and `public/`, so they never ship. Left as local scratch (deleting
untracked files outside scope); flagged so they are not mistaken for live pages.
`.gitignore` or deletion is recommended if they ever appear staged.

## Duplicate dashboards — status & hand-off to E06

The brief referenced `pages/dashboard/*`, `pages/dashboard-next/*`, and
`public/dashboard-classic/*`. Current ground truth:

- `pages/dashboard/` — **does not exist** (already removed).
- `public/dashboard-classic/` — **does not exist** (already removed). All
  `/dashboard-classic/*` URLs **301-redirect** into `/dashboard/*` (18 rules).
- `pages/dashboard-next/` — **canonical** built dashboard (24 auto-discovered
  inputs). `/dashboard/` and `/dashboard/<x>` serve / rewrite to
  `dist/dashboard-next/<x>.html`.
- `public/dashboard/` — **legacy static tree** (18 files). Every section URL
  either 301-redirects to its `dashboard-next` equivalent
  (`/dashboard/wallets → /dashboard/account`, `/dashboard/strategy → /dashboard/library`, …)
  or is caught by `/dashboard/([^./]+) → /dashboard-next/$1.html`. The static
  files are effectively shadowed by redirects.

**No dashboard route is broken** — the consolidation is already expressed as a
redirect layer. Physically deleting the shadowed `public/dashboard/*` files is
**owned by E06** and intentionally left untouched: that tree is under active
concurrent development (recent commits touch both `public/dashboard/` and
`pages/dashboard-next/`), and removing it mid-flight risks breaking redirect
fallbacks. Flagged for E06 to finish.

## Verification

```
$ node tasks/site-overhaul/A-health/verify-routes.mjs
(1) vercel routes whose .html dest has no build target:  (none) ✓
(2) pages/*.html not registered as a Vite input:         (none) ✓
```

The verifier now (a) scans the whole `vite.config.js` for inputs (robust against
the input block's whitespace) and (b) validates parameterized (`$1`) dests by
checking the directory ships ≥1 file, instead of skipping them blindly.

An isolated Vite build of the six newly-wired pages (`activity`, `coin-intel`,
`trending`, `compose`, `create-next`, `mint-success`) completes with **exit 0** —
all module imports (`/src/shared/agent-3d.js`, `/src/erc8004/chain-meta.js`,
`/src/scene-compose.js`) resolve cleanly. (The full 437-page `npm run build` is
memory-bound in this sandbox and gets OOM-killed; route integrity is verified by
the script + isolated build, matching the prior sweep's approach.)

## Files changed

- `vite.config.js` — 6 new Rollup inputs (`activity`, `coin-intel`, `trending`,
  `compose`, `create-next`, `mint-success`) + dev clean-URL aliases for each.
- `vercel.json` — added routes `/radar`, `/smart-money`, `/coin-intel`,
  `/compose`.
- Deleted: `pages/forge-v2.html`, `pages/strategy-lab.html`.
- `tasks/site-overhaul/A-health/verify-routes.mjs` — hardened (whole-file input
  scan + parameterized-dest directory validation).
