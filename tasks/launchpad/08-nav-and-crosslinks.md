# 08 — Launchpad: audit and fix all cross-links and nav entries

## Problem

The token launchpad has seven distinct surfaces:

| Surface | URL | Purpose |
|---------|-----|---------|
| Launchpad Studio | `/launchpad` | White-label launchpad builder |
| Launches Feed | `/launches` | Public feed of every agent-launched coin |
| Pump Dashboard | `/pump-dashboard` | Per-agent coin management console |
| Pump Live | `/pump-live` | Real-time new launch stream |
| Pump Visualizer | `/pump-visualizer` | 3D trending token scene |
| Token in 3D | `/coin3d` | 3D snapshot of any individual token |
| Coin/community world | `/communities/<mint>` | Social 3D world per coin |

These surfaces are not consistently cross-linked. A user who discovers `/launches` has no way to get to `/pump-live` or `/pump-visualizer`. A user on `/coin3d` cannot navigate to the launch feed filtered for that token's agent. The main nav has no "Token" or "Launch" section linking these surfaces together.

This task audits every surface and adds the missing links so the launchpad feels like a cohesive product, not seven isolated pages.

## Target files

- [public/nav-data.js](../../public/nav-data.js) — single source of truth for nav menus (see memory: Nav single source of truth)
- [pages/launches.html](../../pages/launches.html) — page-level links
- [src/launches.js](../../src/launches.js) — card actions (see Task 02 for coin3d link — if 02 is done, skip that part)
- [pages/pump-live.html](../../pages/pump-live.html) — page-level links
- [pages/pump-visualizer.html](../../pages/pump-visualizer.html) — page-level links
- [pages/coin3d.html](../../pages/coin3d.html) — page-level links
- [pages/launchpad.html](../../pages/launchpad.html) — page-level links

## Nav changes (nav-data.js)

Check whether a "Token" or "Launch" dropdown exists in the main nav. If not, add one (or extend the existing "Platform" / "Tools" dropdown — match the existing grouping convention already in nav-data.js). The new dropdown must include:

| Label | URL | Description |
|-------|-----|-------------|
| Launch a Coin | `/launchpad` | Create a token for your agent |
| All Launches | `/launches` | Public feed of every agent coin |
| Live Stream | `/pump-live` | Real-time new launches |
| 3D Visualizer | `/pump-visualizer` | Trending tokens in 3D |
| Token in 3D | `/coin3d` | View any token as a 3D scene |

Keep the existing nav structure — do not restructure menus that already work. Only add what is missing.

## Per-page cross-link additions

### /launches page

In the page header or below the filters row, add a compact "explore" link row:
```
Live stream →  |  3D Visualizer →  |  Launchpad Studio →
```

Each link must be plain `<a>` tags with `class="lx-explore-link"` and correct `href`. No JS required.

### /pump-live page

In the `#header` bar (already has the page title and stats), add an "All launches →" link to `/launches` and a "Visualizer →" link to `/pump-visualizer`.

### /pump-visualizer page

In the `.vz-controls` overlay, add a "Feed →" link to `/pump-live` and "All launches →" to `/launches`.

### /coin3d page

Below the HUD or in the page header, add:
- "All launches →" link to `/launches`
- "3D world →" link to `/communities/<current mint>` (the mint is already in `window.location.search` — read `new URLSearchParams(location.search).get('mint')` to build the link; render it only when a mint is present)

### /launchpad page

On the launchpad page, in the intro or hero section, add a "See all launched coins →" link to `/launches`.

## Verification steps

1. `npm run dev`. Open the main nav. Confirm the new dropdown exists and all links resolve (curl-verify each).
2. Visit each of the 5 pages above. Confirm the added links appear, have correct hrefs, and do not break existing layout.
3. On `/coin3d?mint=<valid_mint>`, confirm the "3D world" link resolves to `/communities/<that_mint>`.
4. Confirm no existing nav links were removed or moved.

## Definition of done

- Main nav has a dropdown (or expanded existing dropdown) linking all 5 launchpad surfaces.
- Each page listed above has the specified cross-links rendered with correct hrefs.
- `/coin3d?mint=<X>` shows a "3D world →" link to `/communities/<X>`.
- All new links return HTTP 200 when curl'd on the dev server.
- No layout regressions on any changed page at 375px, 768px, 1440px.
- `npm test` green.
- Completionist subagent run on changed files.
