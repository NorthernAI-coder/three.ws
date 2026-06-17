# 06 — Shared coin-status widget: extract and unify across pages

## Problem

Live coin status logic (price, market cap, % to graduation, 24h volume, quick buy/sell links) is independently implemented in at least three places:

| File | What it does |
|------|-------------|
| [src/agent-detail.js](../../src/agent-detail.js) | `renderTokenSection` — displays the agent's current token chip + launch history rows with streamed market caps |
| [src/agent-home-pumpfun.js](../../src/agent-home-pumpfun.js) | `mountPumpFunCard` — inline trade panel, live quote, graduation progress |
| [src/launches.js](../../src/launches.js) | `launchCard` market cap enrichment — streams `/api/pump/coin` per card |

Each implementation fetches `/api/pump/coin?mint=<mint>` independently, formats numbers independently, and handles loading/error states independently. When the API response shape changes, all three need to be updated. Adding a new field (e.g. holder count or recent trade sparkline) requires three edits.

## Target files

**New file to create**:
- `src/pump/coin-status-card.js` — shared ES module

**Files to refactor**:
- [src/agent-detail.js](../../src/agent-detail.js) — replace inline market cap enrichment with the shared module
- [src/agent-home-pumpfun.js](../../src/agent-home-pumpfun.js) — replace inline coin data fetch with the shared module
- [src/launches.js](../../src/launches.js) — replace per-card `/api/pump/coin` fetch with the shared module

## Outcome

`src/pump/coin-status-card.js` exports a single function:

```js
/**
 * Mounts a live coin-status display into `container`.
 *
 * @param {HTMLElement} container  — where to render
 * @param {string}      mint       — Solana mint address (base58)
 * @param {object}      [opts]
 * @param {string}      [opts.variant]  — 'chip' | 'row' | 'card' (default: 'chip')
 * @param {number}      [opts.refreshMs] — live-refresh interval (default: 30_000, 0 to disable)
 * @param {boolean}     [opts.showBuy]   — show "Buy" link (default: false)
 * @returns {{ destroy: () => void }}   — cleanup handle
 */
export function mountCoinStatus(container, mint, opts = {}) { … }
```

**Variants:**
- `chip` (default) — compact inline chip: symbol, price, mcap, graduation %. Used in agent-detail token section.
- `row` — table-row-style layout with mint address, volume, and time. Used in agent-detail launch history.
- `card` — full card with name, price, mcap bar, volume, buy link, time-since-launch. Used in launches feed enrichment.

**Data source**: single `GET /api/pump/coin?mint=<mint>`. Map response fields once in this module; all three consumers benefit.

**Live refresh**: the module owns its own `setInterval` (default 30s). Call `destroy()` to stop it. Callers do not manage refresh timers.

**States**: loading skeleton → populated → error (with "Retry" button that re-fetches).

## Implementation notes

1. Create `src/pump/coin-status-card.js`. It imports nothing from outside the `src/pump/` directory except shared utils from `src/shared/` if they exist.
2. Internal helper: `formatMcap(n)` → `$1.2M`, `formatPrice(n)` → `$0.00012`, `formatPct(n)` → `34%`. Copy these verbatim from the existing implementations; do not invent new formatting.
3. Graduation ring: the `card` variant renders a small SVG arc (same as `/coin3d` graduation ring concept) from 0 to `graduation_pct`. Use a `stroke-dasharray` trick on a `<circle>` element — no canvas.
4. "Buy" link (when `showBuy: true`): `<a href="https://pump.fun/<mint>" target="_blank" rel="noopener noreferrer" class="csc-buy">Buy →</a>`. Plain external link; no trade modal in this widget.
5. Refactoring the three callers: replace their inline fetch + render code with `mountCoinStatus(el, mint, { variant: '...', … })`. Each caller still owns the containing `HTMLElement` — the module only populates it.
6. Accessibility: loading state has `aria-busy="true"` on the container. Error state has `role="alert"`. Price and mcap have `aria-label` with plain-language values ("Market cap: 1.2 million dollars").

## Definition of done

- `src/pump/coin-status-card.js` exists and exports `mountCoinStatus`.
- Visit `/launches` — market cap enrichment on cards is powered by the shared module (verify by adding a `console.log` in the module and seeing it fire per card, then removing the log).
- Visit an agent detail page with a coin — the token chip and launch history rows use the shared module.
- Visit the agent home panel for an agent with a coin — coin data is fetched via the shared module (no duplicate fetch to `/api/pump/coin` from the old inline code).
- All three variants render correctly at their target sites.
- A single field-name change in `mountCoinStatus` (e.g. rename `market_cap` → `mcap`) propagates to all three surfaces without touching any other file.
- No console errors.
- `npm test` green (add at least one unit test for `formatMcap` and `formatPct` in a `coin-status-card.test.js` alongside the module).
- Completionist subagent run on changed files.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/launchpad/06-agent-coin-shared-widget.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
