# C4 — $THREE token page upgrade: real curve + live trade tape + swap (wow-sprint Task 16)

**Track:** C — build next · **Priority:** P2 · **Effort:** 1–2 days · **Depends on:** **C1** (price header)

## Context

`tasks/wow-sprint/16-token-page-upgrade.md` wants a canonical $THREE coin page that is trustworthy:
a real bonding-curve/price header, a **live trade tape**, and a working swap. The pieces exist but
are scattered; the canonical page does **not**. Read the task doc fully first.

The `/api/pump/trades-stream` P0 (broken SSE contract) was **already fixed** — the live tape is now
buildable.

### Existing pieces to assemble (do NOT rebuild)

- Price/curve: `src/pump/bonding-curve-chart.js`, `src/components/bonding-curve.js`,
  `api/pump/curve.js` (note: also being hardened in **A1** — coordinate; for $THREE, which is a real
  pump mint, the curve endpoint works normally).
- Swap quote/exec: `src/pump/pump-swap-quote.js`, `src/swap-jupiter.js` (after **B1** trims its
  tiles).
- Live trades: `api/pump/trades-stream.js` (SSE, fixed) and/or `api/pump/coin-trades.js` (REST),
  with the polling pattern in `src/home-live-token.js` as a reference.
- Price header data: the **C1** store (`protocol.token` price/market-cap/volume). Use it — don't
  add another price fetch.
- $THREE mint: `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`.

## What to build

1. **New canonical page** `pages/three-token.html` (route in `vite.config.js`) + `src/pages/three-token-coin.js`,
   assembling:
   - A **price header** fed by the C1 store (price, 24h change, market cap, volume, holders).
   - The **bonding-curve / price chart** for $THREE (reuse `bonding-curve-chart.js`).
   - A **live trade tape**: subscribe to `api/pump/trades-stream.js` (SSE) with a reconnect loop and
     a REST fallback to `coin-trades.js`; render buys/sells with amount + USD + relative time;
     respect `prefers-reduced-motion` for any tape animation.
   - A **working swap** widget for $THREE (reuse `pump-swap-quote.js` / `swap-jupiter.js`); SOL/USDC
     are the allowed quote/settlement assets.
2. **Cross-link** the page from the holder dashboard (C2), the leaderboard (C3 "acquire $THREE"
   CTA), and nav — no dead ends.
3. **All states + motion + a11y + responsive** per CLAUDE.md. Empty trade tape = a designed "no
   recent trades" state. Graduated-token edge case handled (if/when the curve completes).

## Acceptance criteria

- [ ] `pages/three-token.html` exists, is routed, and is reachable from nav + holder surfaces.
- [ ] Price header reads from the C1 store (no separate price fetch).
- [ ] Live trade tape streams real trades via SSE with a working reconnect + REST fallback.
- [ ] Swap widget executes a real $THREE swap (quote → confirm) with SOL/USDC as quote/settlement.
- [ ] All states designed (loading/empty/error/graduated); responsive; accessible; reduced-motion
      respected.
- [ ] No console errors; Network tab shows real curve/trades/quote calls.

## Verification

1. `npm run dev`; open `/three-token` (or the chosen route).
2. Confirm the price header matches `/api/three-token/stats`, the tape shows live trades and
   reconnects after a forced disconnect, and a swap quote returns a real route.
3. Test at 320 / 768 / 1440px; toggle reduced-motion; throttle to confirm the error/empty states.
4. `npx vitest run` for any new tests.

## Rules

Obey [CLAUDE.md](../../CLAUDE.md). Only $THREE on the page. No mock trades, no fake price. Real SSE,
real swap. Coordinate with **A1** if you touch `api/pump/curve.js`.

## Completion protocol

1. Re-read your diff (`git diff`) and confirm every line is justified.
2. Delete this file: `tasks/week-2026-06-08/C4-token-page-upgrade.md`.
3. Commit your code **and** this file's deletion together, e.g.:
   `git add -A && git commit -m "feat(token): canonical $THREE coin page — curve + live tape + swap; close C4"`
4. Do **not** push — the human controls pushes.
