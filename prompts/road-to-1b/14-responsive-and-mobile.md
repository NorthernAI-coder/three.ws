# 14 — Responsive & mobile

> Part of **Road to $1B** (`prompts/road-to-1b/`). Read `00-README.md` and `/CLAUDE.md` first.

**Phase:** 3 — Experience quality
**Owns:** `pages/`, `src/` CSS/layout, viewport meta, 3D canvas sizing, `solana-mobile/` touchpoints.
**Depends on:** none  ·  **Parallel-safe with:** `12`, `13`, `15`, `16`, `17`

## Why this matters for $1B
Most crypto and consumer traffic is mobile. A janky phone experience caps growth hard —
the wallet connect, the launch, and the trade all happen on a 360px screen. `/CLAUDE.md`
mandates 320 / 768 / 1440 and proper touch targets; this prompt makes that real.

## Mission
Make every surface fully usable and polished at 320px, 768px, and 1440px, with proper
touch targets and acceptable mobile 3D performance.

## Map
- Top surfaces: `pages/home.html`, `pages/forge.html`, `pages/marketplace.html`,
  `pages/trending.html`, `pages/agent-detail.html`, `pages/agent-trade.html`,
  `pages/agent-wallet.html`, and the editors `pages/forge.html` / `pages/avatar-studio.html`
  / `pages/animations.html` (Animation Studio).
- Layout/CSS + 3D canvas sizing live under `src/`; mobile-specific surfaces under
  `solana-mobile/` (PWA/TWA wrappers, `solana-mobile/pwa/`, `solana-mobile/twa/`).
- Wallet / x402 flows: `pages/agent-wallet.html`, `api/x402/` (exercise on mobile).
- Existing gate: `npm run audit:web` (`scripts/page-audit.mjs`).

## Do this
1. Walk the top surfaces at 320 / 768 / 1440 (and a real device or DevTools emulation);
   log every overflow, fixed width, cut-off modal, and broken nav/menu.
2. Fix horizontal scroll and fixed widths (relative units, flex/grid, `max-width:100%`,
   `min-width:0` on flex children); enlarge touch targets to >= 44px.
3. Make the 3D viewer and editors (Forge, Avatar/Animation Studio) usable on touch —
   orbit/zoom/IK via touch gestures — or degrade gracefully where touch can't drive a
   control. Size the canvas to the viewport without overflow.
4. Handle the on-screen keyboard and safe-area insets for forms and chat
   (`env(safe-area-inset-*)`, `viewport-fit=cover`); inputs must not be obscured.
5. Reflow data-dense lists/tables (trading, marketplace) into stacked/scrollable cards
   on narrow screens — no clipped columns.
6. Exercise the wallet connect and x402 payment flows on mobile, including the
   `solana-mobile/` PWA/TWA path; fix any tap/redirect breakage.

## Must-not
- Do not hide core features on mobile to "fix" a layout — reflow them instead.
- Do not ship horizontal scroll on any top surface.
- Do not shrink touch targets below 44px to fit a dense layout.

## Acceptance
- [ ] No layout breakage or horizontal scroll at 320 / 768 / 1440 on the top surfaces.
- [ ] Touch targets >= 44px; safe-area insets and on-screen keyboard handled.
- [ ] 3D viewer/editors usable on touch or gracefully degraded; canvas never overflows.
- [ ] Wallet + x402 flows verified on mobile (incl. `solana-mobile/`).
- [ ] `npm test` green; `npm run lint` clean; changelog `improvement` entry.
