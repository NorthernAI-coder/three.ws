# Pump.fun Launchpad — Definition-of-Done Audit Report

**Date:** 2026-06-20
**Scope:** Task 10 — the final audit gate over the entire pump.fun launchpad surface.
**Method:** Five parallel read-only auditors swept the surfaces against the CLAUDE.md
Definition of Done (reachable + navigable, every state designed, no mocks/fake data, no
console noise, real `/api/pump/*` calls, microinteractions + a11y, responsive, cross-links).
Findings were verified by hand, then fixed. Each fix is committed with a justified diff.

---

## Verdict

The launchpad surface holds together. The auditors found **no shipped mocks, no fake data,
no `setTimeout` fake-loading, no `TODO`/`not implemented`, and no foreign-coin references** —
the only hardcoded addresses are legitimate infra constants (SPL Token program, USDC/USDT/wSOL
mints, the Pump bonding-curve program) and the `$THREE` CA used as a pinned default chart token.
`/pumpfun` was confirmed to be a real, working PumpPortal-backed SSE stream — **not** a stale stub.

The gaps were real but bounded: one genuinely-missing backend endpoint, a handful of dead/off-platform
links, and modal/keyboard accessibility holes. All are now fixed.

---

## The one real blocker: `/api/launchpad/invoke` was never built

Two of the three Launchpad Studio templates — **paid-concierge** and **gated-showroom** — published
pages whose pay CTA `POST`ed to `/api/launchpad/invoke`, an endpoint that did not exist. The request
fell through to the SPA catch-all and 404'd, so the x402-challenge branch could never fire.

**Resolution (per product decision): built it for real.** `api/launchpad/invoke.js` is now a real
x402 v2 endpoint with **dynamic per-page price and payout**:

- It composes the spec-level primitives (`send402` / `verifyPayment` / `settlePayment` /
  `encodePaymentResponseHeader`) directly, because `paidEndpoint()` binds price + payout at module
  load and cannot settle to an arbitrary creator wallet per request.
- **Unpaid** request → a real 402 challenge built from the page's `monetize` config (price → USDC
  atomics, `payTo` = the creator's `identity.wallet`, network from the page's chain). An x402 wallet
  or agent fulfills it and retries.
- **paid-concierge** → after settlement, a real answer generated on the platform's free-first LLM
  chain (`llmComplete`), grounded in the page's brand/headline/tagline.
- **gated-showroom** → after settlement, returns the private scene URL. To make the gate *real*,
  `api/launchpad/get.js` now **withholds `scene.src`** from the public read for gated-showroom pages
  (`scene.locked = true`) — paying through `invoke` is the only way to obtain the asset.
- Supported settle chains are Base and Solana (USDC); the Studio's concierge chain selector was
  updated from Base/Polygon → Base/Solana to match what the facilitator can settle.
- `public/p/render.js` was rewired to the real endpoint: it surfaces the **real** 402 challenge
  (amount, recipient, network), and its modals are now keyboard-operable (focus trap, Esc,
  focus-restore) with the previously-malformed `data-modal-status` attribute fixed.

---

## Surface-by-surface

### `/launches` feed + `/launches/<mint>` detail — PASS (1 fix)
- States verified: skeletons, helpful empty states with CTAs, error+retry, devnet/overflow,
  live prepend; per-section independent empty/error.
- a11y verified: `role=tab`/`tablist`, `aria-*`, semantic `<article>`/`<dl>`/`<time>`, focus/hover,
  reduced-motion, dialog with Esc/backdrop close.
- **Fixed:** burn-proof rows rendered a dead `href="#"` when a burn lacked a tx signature —
  now a plain non-anchor `<div>` (no `tx ↗` label) when there's no signature
  (`src/launch-detail.js`).

### Agent-detail launch history — PASS (1 fix)
- **Fixed:** launched-coin rows linked off-platform to `pump.fun/<mint>`. They now link to the
  on-platform `/launches/<mint>` coin profile (same-tab), matching the feed cards; devnet mints
  (no market page) still deep-link to the explorer (`src/agent-detail.js`).

### agent-token-widget (agent profile) — PASS (1 fix)
- **Fixed:** the owner empty-state CTA "Launch $AGENT →" pointed at `/dashboard/pump-launch`, a
  route that resolves to a non-existent file (404). Now points at the live public `/launch?agent=`
  surface (`src/pump/agent-token-widget.js`).

### `/pump-dashboard` + pump-modals — PASS (3 fixes)
- No dead paths, no mocks; all 12 sidebar tabs resolve; all fetch targets real; null-guarded;
  XSS-escaped; 23 hover/focus rules.
- **Fixed:** pump-modals (buy/sell/governance) had no `role=dialog`/`aria-modal`, no Esc, no focus
  trap, no initial focus, and zero `:focus` styles — all added (`src/pump/pump-modals.js`).
- **Fixed:** dashboard's own modals (`#pd-add-watch-modal`, `#pd-key-modal`) gained Esc-to-close,
  backdrop-click-to-close, and first-field focus on open (`pages/pump-dashboard.html`).

### `/pump-live` — PASS (1 fix)
- Strong error handling (WS backoff, bad-frame guard, soft 3D failure); designed loading/empty.
- **Fixed:** launch cards linked only off-platform (pump.fun/solscan). Added an on-platform
  "Profile" link to `/launches/<mint>` so launches feed back into three.ws (`pages/pump-live.html`).

### `/pump-visualizer` — PASS (1 fix)
- Production-quality: real endpoints only, thorough Three.js disposal, reconnect + dead-feed state,
  WebGL-absent DOM fallback, excellent cross-links.
- **Fixed:** legend `<li>` rows were keyboard-inaccessible (the only path to coin details in
  fallback mode). Added `role=button`, `tabindex=0`, Enter/Space handler, `aria-label`, and a
  `:focus-visible` ring (`pages/pump-visualizer.html`).

### `/pumpfun` stream — PASS (1 fix), confirmed real
- Confirmed a real PumpPortal-backed SSE stream with reconnect/backoff, replay buffering, manual
  retry, per-event filtering, and designed loading/empty/down/reconnecting states.
- **Fixed:** the feed pill claimed "Powered by Helius" and linked to helius.dev, but the source is
  **PumpPortal** and the advertised live-event counter never fired (the backend emits no `meta`
  event, so it sat at 0). Relabeled to "Powered by PumpPortal" (correct link/title), and the counter
  now counts **real** events received this session. Wired the styled-but-unused **quiet** state:
  a connected feed with no activity for 45s shows `live · quiet` and snaps back to `live` on the
  next event (`public/pumpfun.html`).

### `/launch` flow + launch-token-modal — PASS (1 fix)
- The primary `/launch` panel is real end-to-end (prep → sign → broadcast → confirm with a
  confirm-timeout escape hatch); the vanity grind is real WASM, not faked; states designed; primary
  panel a11y solid.
- **Fixed:** the legacy `launch-token-modal` had no focus trap / initial focus (Tab escaped behind
  the overlay). Added a focus trap, initial focus, and focus-restore on close
  (`src/pump/launch-token-modal.js`).

### coin-buy buy/sell widget — PASS (1 fix), USDC confirmed real
- Confirmed the **USDC denomination UI is real and fully wired** (quote-asset detection from the
  on-chain curve, USDC presets/labels/balance, USDC quote + buy/sell prep paths) — not SOL-only,
  not stubbed.
- **Fixed:** preset / slippage / close / link buttons lacked a visible keyboard focus ring — added
  `:focus-visible` rules (`src/game/coin-buy.css`).

### Launchpad Studio + publish flow — PASS (built the missing endpoint)
- Publish is real and signed (Postgres write, owner-secret edit auth, zod validation, chain-aware
  wallet check); `/p/<slug>` hydrates from the real `/api/launchpad/get`.
- The previously-missing `/api/launchpad/invoke` is now built (see top of report); `/p/<slug>` modals
  are wired to it, keyboard-operable, and the token-launchpad CTA now opens the real `/launch` page
  (it previously opened a non-existent `/agent-pumpfun` route).

---

## What was explicitly verified clean (no change needed)
- No foreign-coin references anywhere; `$THREE` is the only promoted coin.
- No fallback sample arrays, `DEMO_*`, `mockData`, fake progress bars, or `not implemented`.
- All audited surfaces call real `/api/pump/*`, `/api/oracle/*`, `/api/agents/*` endpoints that
  exist on disk and are routed.
- Cross-links now form a loop: launches feed ↔ coin profile ↔ agent profile ↔ token widget ↔
  dashboard ↔ pump-live ↔ visualizer.

## Verification
- `npx eslint` on all changed files: **0 errors** (only pre-existing warnings in untouched regions).
- `node --check` passes on every changed `.js` file.
- Unit suite (`vitest run`) green.
- No launchpad tests existed before; behavior was verified by reading the full prep→sign→settle
  paths and the spec-level x402 primitives the new endpoint composes.
