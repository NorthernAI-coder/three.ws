# 12 — Vault UI (/vault): browse, buy, unlock, view in 3D

Read `prompts/bnb-chain/00-CONTEXT.md` first, then `/workspaces/three.ws/CLAUDE.md`.
**Prereqs: 11** (vault API). Run it first if missing. Do not build UI against unbuilt APIs.

## Why
The face of Track B. A polished page where anyone browses encrypted 3D listings, buys one
(BSC testnet), watches the cross-chain grant settle, unlocks, and sees the model render in
our existing Three.js viewer. This is the screenshot-worthy artifact. Hold the CLAUDE.md
UI/UX bar: every state designed, transitions, responsive, a11y, microinteractions.

## Build — `/vault` page
- New page wired into the Vite app + nav (find how existing pages register: `data/pages.json`,
  the router, and the nav component — match them). Reuse the existing GLB viewer component
  (grep for the Three.js viewer used by forge/marketplace) — do NOT build a new viewer.
- Flow UI:
  1. **Browse** — grid of listings from `GET /api/vault/list`. Each card: name, price,
     seller, locked-state badge. Skeleton loading, designed empty state ("No models listed
     yet — list yours"), error state.
  2. **Buy** — connect wallet (reuse existing wallet connect; BSC testnet), call the vault
     contract `buy`. Show tx pending → confirmed. If gasless is available (prompt 02), offer
     the sponsored path and label it.
  3. **Settling** — after purchase, poll `GET /api/vault/status`; show an honest
     "granting access on Greenfield…" state for `pending-grant` (this async step is a feature
     to surface, not hide — it's the cross-chain magic).
  4. **Unlock + view** — on `unlocked`, call `POST /api/vault/unlock`, decrypt client-side
     (`vault-crypto` browser build), load the GLB into the viewer. Download button for the GLB.
- Every interactive element: hover/active/focus states. Responsive at 320/768/1440.

## States
0 listings, 1 listing, many (paginate/virtualize if needed). Wallet not connected. Wrong
network (prompt to switch to BSC testnet). Purchase rejected in wallet. Grant stuck pending
(bounded poll → "still settling, check back" with a manual refresh). Decrypt failure (show a
real recovery message). Non-buyer viewing a locked card (clear CTA).

## Tests
- Logic tests for any pure helpers (state machine: purchase→pending→unlocked) in `tests/`.
- Manual browser exercise is REQUIRED (CLAUDE.md DoD): run `npm run dev`, drive the full flow,
  confirm zero console errors and real network calls. Capture what you saw in PROGRESS.

## Definition of done
Inherit 00-CONTEXT DoD (incl. the UI-specific items: all states designed, no console errors,
real API calls in network tab). Additionally:
- [ ] `data/pages.json`: register `/vault` (path, title, description, `added` date).
- [ ] `STRUCTURE.md`: add a row for the vault surface.
- [ ] `data/changelog.json`: entry (tag `feature`) — "Vault: buy & unlock encrypted 3D models on BNB Chain".
- [ ] Real browser proof in PROGRESS: the full buy→settle→unlock→render flow on testnet, with the tx hash and a note that the GLB rendered.
