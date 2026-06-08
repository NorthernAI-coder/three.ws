# C3 — $THREE holder leaderboard + endpoint + gated 3D badge (wow-sprint Task 15)

**Track:** C — build next · **Priority:** P1 · **Effort:** 1–2 days
**Depends on:** the new endpoint is independent; the client surface uses **C1**'s store for the
viewer's own rank. C1 not strictly blocking for the backend half — build the endpoint in parallel.

## Context

`tasks/wow-sprint/15-holder-leaderboard-and-badges.md` wants a public $THREE holder leaderboard plus
a holder-gated, shareable 3D badge — the strongest growth flywheel in the backlog. **This is mostly
net-new** (~10% exists). Read the task doc fully first.

### What already exists to reuse (do NOT rebuild)

- **Holder data reader:** `fetchHolderBalances({ mint })` in `api/_lib/coin/holders.js` returns
  `Map<owner, bigint>` of every holder via Helius DAS `getTokenAccounts` (handles Token-2022,
  paginates). This is the canonical holder-list source — wrap it; don't write new RPC.
- **Leaderboard endpoint pattern:** `api/cosmetics/leaderboard.js` and `api/bounties/leaderboard.js`
  — `wrap()` + `cors` + `method` + strict-whitelist params + `Cache-Control: s-maxage=...` +
  **empty-board-on-error (never 500)**. Copy this shape.
- **Server-side hold gate:** `api/community/holder-pass.js` + `signHolderPass`/`HOLDER_MIN_USD` in
  `api/_lib/holder-pass.js` — read authed wallet → `getBalances` → `solanaMintUsdPrice` → sign.
  This is the template for gating the badge **server-side** (never trust a client-reported balance).
- **Market/supply:** `fetchTokenMarketData(mint)` in `api/_lib/market/token-market.js` for
  `supply` (to compute `pctOfSupply`) and price.
- **Name resolution:** `src/solana/sns.js` to resolve holder addresses to SNS names in the board.
- **Badge export:** `exportAvatar`/`downloadAvatar` in `src/avatar-export.js` (PNG/GLB);
  `public/agent-badge.html` / `public/agent-passport.html` for markup patterns; `pages/three-live.html`
  for the Three.js scene patterns if the badge is a 3D render.
- **$THREE mint config:** `TOKEN_MINT` in `api/_lib/token/config.js`.

## What to build

### Backend (independent — can start now)

1. **Add `?action=leaderboard`** to `api/three-token/[action].js` (a new branch, **not** a new
   file — match how `stats`/`burns`/`activity` live there). It should:
   - Call `fetchHolderBalances({ mint: TOKEN_MINT })`, aggregate per owner, sort desc.
   - Paginate via whitelisted `?limit` (clamp, e.g. ≤100) and `?offset`.
   - Attach `pctOfSupply` using `fetchTokenMarketData().supply`; optionally resolve SNS names.
   - Truncate/format addresses for display; never leak more than needed.
   - `Cache-Control: s-maxage=60` (holder sets change slowly); **empty board on error, never 500**.
2. **Add `?action=holder`** (authed branch) — server-verified per-wallet $THREE balance + tier +
   rank, reusing `getBalances`/`solanaMintUsdPrice`. This is the **server-side gate** for the badge
   (don't trust client balance). Optionally fold badge-eligibility into this response.

### Frontend (uses C1 for the viewer's own rank)

3. **Holders page** — new `src/dashboard-next/pages/holders.js` + `pages/dashboard-next/holders.html`
   (wire the route in `vite.config.js` and add a nav entry in `src/dashboard-next/nav.js`). Render:
   - The leaderboard (rank, address/SNS, amount, % supply) with pagination, real loading/empty/error
     states, and the viewer's own row highlighted (from C1 `position` / the `holder` endpoint).
   - A **holder-gated 3D badge**: gate visibility/minting on the **server** `holder` response (not a
     client balance check). For eligible holders, render a shareable badge (reuse the 3D scene +
     `avatar-export` for PNG/GLB download) and an OG-style share path.
4. **States, motion, a11y, responsive** — per CLAUDE.md UI standards. Empty board = a helpful
   "be the first / how to acquire $THREE" state, not a blank.

## Acceptance criteria

- [ ] `GET /api/three-token/leaderboard?limit&offset` returns a real, paginated, sorted holder
      board with `pctOfSupply`; empty board (not 500) on upstream failure; cached.
- [ ] `GET /api/three-token/holder` (authed) returns server-verified balance + tier + rank.
- [ ] The holders page renders the board with pagination + the viewer's highlighted rank.
- [ ] The 3D badge is gated **server-side**; eligible holders can render + download (PNG/GLB) + share.
- [ ] All states designed (loading/empty/error/overflow); responsive; accessible; hover/active/focus.
- [ ] No console errors; Network tab shows real Helius-backed data.

## Verification

1. `curl '/api/three-token/leaderboard?limit=20'` → real ranked holders; `&offset=20` paginates;
   simulate an upstream failure → empty board, 200, not 500.
2. `npm run dev`; open the holders route — confirm board, pagination, your-rank highlight, and that
   the badge only appears/mints for a server-verified holder.
3. Confirm a non-holder (or signed-out) cannot mint/download the badge (gate is server-side).
4. `npx vitest run` for any new endpoint/page tests you add.

## Rules

Obey [CLAUDE.md](../../CLAUDE.md). Only $THREE. Real Helius holder data — no sample holders. Gate on
the server; never trust client-reported balances. Design every state.

## Completion protocol

1. Re-read your diff (`git diff`) and confirm every line is justified.
2. Delete this file: `tasks/week-2026-06-08/C3-holder-leaderboard-badge.md`.
3. Commit your code **and** this file's deletion together, e.g.:
   `git add -A && git commit -m "feat(holder): $THREE leaderboard + holder endpoint + gated 3D badge; close C3"`
4. Do **not** push — the human controls pushes.
