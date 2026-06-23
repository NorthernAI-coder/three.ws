# Phase 4 · 04 — Trader Wrapped (weekly recap)

Read `00-README.md` in this folder and `/CLAUDE.md` first — shared context, existing
files, non-negotiable rules. This task assumes them.

## Goal

Once a week, hand every active trader a recap worth posting: their best calls,
copiers gained, $THREE earned, reputation movement — delivered in-app and (opt-in)
to Telegram, each with a one-tap share card (prompt 01) carrying their referral link
(prompt 03). This is recurring, self-propagating content: the platform manufactures a
shareable moment for every trader, every week.

## Build on (do not rebuild)

- `api/cron/rewards-distribute.js` — the canonical scheduled, idempotent cron
  pattern. Copy its structure (windowing, idempotency key, batch, logging).
- `api/_lib/notify.js` (`insertNotification`), `api/_lib/notify-prefs.js`,
  `api/notifications/*` — in-app delivery + per-type prefs.
- `src/pump/telegram-delivery.js`, `api/pump/deliver-telegram.js` — Telegram delivery.
- The trader-stats truth layer (`api/sniper/trader.js`/`history.js`) — recap numbers.
- Share-card endpoints from prompt 01; referral link from prompt 03.
- `vercel.json` — register the new weekly cron.

## Deliver

1. **Recap computation.** A function that, for a given week window, computes per
   active trader: best trade(s), realized PnL, win rate delta vs prior week, copiers
   gained/lost, $THREE earned (perf fees + referrals), reputation/score movement, and
   a headline ("Your sharpest week yet" / "First week in the green"). All from real
   rows; skip traders with no activity (no empty "you did nothing" spam).
2. **Weekly cron.** `api/cron/trader-wrapped.js` registered in `vercel.json`,
   idempotent per (trader, week) so a re-run never double-sends. Batched, with
   structured logging and a dead-letter-safe path on partial failure.
3. **In-app recap.** A notification (`insertNotification`) linking to a recap view
   (a `/wrapped/<week>` route or modal) that renders the week as a designed,
   screenshot-worthy card with a share control + referral link. Respects notify-prefs.
4. **Telegram recap.** Opt-in delivery via the existing Telegram path to traders who
   linked Telegram, gated on their notification preferences. Plain-language, links
   back with `?ref=`.
5. **Idempotency & cost.** One recap per trader per week; cron is cheap (aggregate
   queries, not per-trader fan-out where avoidable).

## Acceptance

- Running the cron twice for the same week sends exactly one recap per trader (test
  asserts idempotency key behavior).
- Recap numbers reconcile to the trader-stats truth layer; inactive traders are
  skipped, not spammed.
- Telegram delivery only to opted-in, linked traders; in-app respects notify-prefs.
- Recap card is mobile-first, fully designed, shareable with referral link embedded.
- `$THREE` is the only token in any recap copy.
- `npm test` + `npm run typecheck` green. `data/changelog.json` entry (`feature`);
  `npm run build:pages` run. New cron present in `vercel.json`.

## When done

Run the `/CLAUDE.md` self-review protocol, then delete **only this file**
(`04-trader-wrapped-recap.md`).
