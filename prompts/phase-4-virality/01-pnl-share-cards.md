# Phase 4 · 01 — PnL & trade share cards

Read `00-README.md` in this folder and `/CLAUDE.md` first — shared context, the
existing files, and the non-negotiable operating rules live there. This task assumes
them.

## Goal

Make every win shareable. A profitable closed trade — and a trader's overall track
record — must render as a beautiful, **provable** card that previews perfectly when
pasted into X, Telegram, Discord, or iMessage, and that carries a referral link back
to a page that proves the numbers. Cards are the atomic unit of virality; everything
else in Phase 4 carries them.

## Build on (do not rebuild)

- `api/trader-og.js` — the existing `/api/trader-og?agent_id=` 1200×630 SVG card
  (score gauge, win rate, realized P&L, trades closed, best trade) for
  `/trader/<id>/share`. Extend this visual language; do not fork a new style.
- OG siblings for consistent typography/gradients: `api/og-leaderboard.js`,
  `api/agent-og.js`.
- `api/sniper/history.js` / `api/sniper/trader.js` — the real closed-trade + stats
  source. The shared trader-stats truth layer is the only number source.
- `pages/trader.html` — where the share affordance lives.

## Deliver

1. **Per-trade PnL card.** A new dynamic OG endpoint (e.g. `api/trade-og.js`,
   `GET /api/trade-og?trade=<id>`) rendering a single closed trade: coin (ticker +
   thumbnail if available), entry/exit, ROI %, realized P&L in SOL and USD, hold
   time, the trader's name/avatar, and a small "verified on-chain — view the tx"
   proof line. Same dark card anatomy as `trader-og.js`. Must 404 cleanly for
   unknown/open trades and degrade gracefully if the thumbnail is missing.
2. **Share routes + meta.** `/trade/<id>/share` and the existing `/trader/<id>/share`
   serve HTML with correct `og:image`, `twitter:card=summary_large_image`,
   `og:title`/`og:description` populated from real data, plus a visible
   human-facing card and a prominent CTA ("Copy this trader" / "See full track
   record"). The referral link (see prompt 03) is embedded in every share URL.
3. **One-tap share UI.** On `pages/trader.html` and anywhere a closed trade renders
   (history rows, the feed from prompt 02), a share control that: copies the share
   URL, opens native share sheet on mobile (`navigator.share` with graceful
   fallback), and offers "share to X" / "copy for Telegram" intents. Hover/active/
   focus states, keyboard-operable, ARIA-labeled.
4. **Caching & cost.** OG endpoints set sensible cache headers (match `trader-og.js`
   `s-maxage`/`stale-while-revalidate`), and never trigger an expensive recompute on
   every crawler hit. SVG only — no headless browser.

## Acceptance

- Pasting a `/trade/<id>/share` or `/trader/<id>/share` link into a link-preview
  validator shows the card with **real** numbers; no placeholder values.
- The card's numbers match the trader profile exactly (same truth layer).
- Unknown trade id, open (unclosed) trade, and missing-avatar cases all render a
  clean state — never a broken image or a 500.
- Share control works on mobile (native sheet) and desktop (copy + intents), with
  full hover/active/focus states.
- `npm test` + `npm run typecheck` green; a test asserts the OG endpoint's numbers
  equal the trader-stats truth layer for a fixture trade.
- `data/changelog.json` entry added (`feature`), `npm run build:pages` run.

## When done

Run the self-review protocol in `/CLAUDE.md`, then delete **only this file**
(`01-pnl-share-cards.md`). Leave `00-README.md` and all other prompts intact.
