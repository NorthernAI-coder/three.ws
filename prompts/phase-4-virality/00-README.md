# Phase 4 — Virality Engine (Index — DO NOT DELETE)

> This file is the index and shared context for **Phase 4** of the pump.fun
> social-trading roadmap. It is NOT a task. Do not delete it. Every numbered
> prompt in this folder is a self-contained task for one fresh agent chat. When
> an agent finishes a numbered task (and its self-review pass), it deletes
> **only its own** numbered prompt file — never this README, never another's.

Roadmap source of truth: `docs/roadmap/pumpfun-social-trading.md` (Prompt E,
"Phase 4: Social loop & growth") and `docs/roadmap/pumpfun-trading.md`
(§8, "Phase 4 — Virality engine").

---

## The vision

Phases 0–3 built the truth: a provable, on-chain track record (the leaderboard +
trader profiles), a non-custodial copy engine, and performance-fee settlement.
The product is **correct and trustworthy** — but trust alone doesn't grow it.

**Phase 4 makes wins spread.** Every profitable close should be a screenshot worth
sharing, every shared card should carry a referral link, every follow should feed a
live activity stream, and every week the platform should hand each trader a recap
worth posting. The loop we are wiring:

> a trader wins → the win renders as a beautiful, provable card → the card spreads
> (in-app feed, Telegram, X) with a referral link → a new user lands on a profile
> that *proves* the track record → they copy or deploy → they win → repeat.

The north star for this phase: a new user can arrive from a shared card, see
irrefutable proof, and start copying within one session — and the trader who earned
that follow can *see* their reach (copiers gained, $THREE earned, reputation rising).

This is not growth-hacking spam. Every recommendation is computed from **real copy
data**, every badge is gated on **attested on-chain metrics**, every card shows
**real numbers**. Proof, not promises. If a number can't be verified, it doesn't ship.

---

## What already exists (build ON this — do not rebuild it)

Proof / track-record layer (Phases 0–1):
- `api/sniper/leaderboard.js` — public leaderboard ranked by composite TraderScore
  over a window; superset rows (`win_rate`, `score`, `verified`, `roi_pct`,
  `drawdown`, recent closed trades, open positions). The shared trader-stats truth
  layer feeds this and the profile so they can never disagree.
- `api/sniper/trader.js` — single-trader stats; `api/sniper/history.js` — trade log.
- `pages/leaderboard.html`, `pages/trader.html`, `pages/arena.html` — the front door.
- `api/trader-og.js` — `GET /api/trader-og?agent_id=<uuid>`: dynamic 1200×630 SVG
  OG card (score gauge, win rate, realized P&L, trades closed, best trade) for
  `/trader/<id>/share`. The PnL-card work extends this language.
- Sibling OG generators to match style: `api/og-leaderboard.js`, `api/agent-og.js`.

Copy engine + fees (Phases 2–3):
- `api/cron/copy-fanout.js`, `api/cron/mirror-fanout.js` — copy/mirror execution.
- `api/cron/trader-score-attest.js` — on-chain attestation of TraderScore.
- `pages/vaults.html` + vault APIs — Back-an-Agent copy vaults (the money loop).
- `pages/feed.html` — "Your Feed" page ("Recent activity from the people and agents
  you follow"). Currently thin — Phase 4 fills it.

Referrals:
- `api/_lib/referrals.js` — code generation/normalization/availability/claim
  (`generateReferralCode`, `setReferralCode`, `getReferralCodeAvailability`, …).
- `api/_lib/referral-rewards.js`, `api/_lib/activation.js` — reward/activation logic.
- `api/_lib/migrations/20260628120000_referral_activation.sql`.

Notifications & distribution:
- `api/_lib/notify.js` — `insertNotification(userId, type, payload)`,
  `recordEvent(...)`, `emailAllowedForType(...)`.
- `api/_lib/notify-prefs.js`, `api/notifications/*` (index, preferences, read-all,
  track, `[id]`), `api/_lib/email.js`.
- Telegram delivery: `src/pump/telegram-delivery.js`, `api/pump/deliver-telegram.js`,
  `scripts/changelog-telegram.mjs`, migrations `*_sniper_telegram_notify.sql`,
  `*_copy_telegram.sql`, `*_oracle_watch_telegram.sql`.
- Cron pattern to copy: `api/cron/rewards-distribute.js` (scheduled, idempotent).

KOL pre-seed:
- `api/kol/[action].js` (Birdeye/GMGN proxy), `api/kol/trades.js`,
  `src/kol/leaderboard.js`, `src/kol/wallet-pnl.js`, `src/kol/wallets.js`,
  `src/kol/wallets.json`, `src/kol/gmgn-parser.js`, `src/kol/kolscan-live.js`.

Schema & infra:
- `api/_lib/schema.sql` + `api/_lib/migrations/` — add new tables here (timestamped).
- `vercel.json` — register any new cron + route.
- `api/_lib/db.js` (`sql`), `api/_lib/http.js` (`cors`, `wrap`), `api/_lib/validate.js`.

---

## The prompts

| # | Prompt | Builds on |
|---|---|---|
| 01 | PnL & trade share cards | `api/trader-og.js`, OG siblings, history |
| 02 | The Feed (follow-graph activity + recommendations) | `pages/feed.html`, copy data |
| 03 | Referral wiring everywhere | `api/_lib/referrals.js`, share cards |
| 04 | Trader Wrapped — weekly recap (cron) | `rewards-distribute.js`, notify, Telegram |
| 05 | Proven-track-record verification badge | `trader-score-attest.js`, leaderboard |
| 06 | KOL pre-seed + "claim this profile" | `api/kol/*`, `src/kol/*`, leaderboard |
| 07 | Telegram / X distribution bots | telegram-delivery, share cards |
| 08 | Integration QA & polish (run last) | all of the above |

Run 01 first (cards are the unit of virality everything else carries). 02–07 can run
in parallel chats once 01 lands. Run 08 last, after the others merge.

---

## Global operating rules (every prompt repeats these — non-negotiable)

- Read `CLAUDE.md` and `STRUCTURE.md` first; **CLAUDE.md overrides defaults.**
- **No mocks / fake data / placeholders / TODOs / stubs.** Real APIs, real on-chain
  data, real implementations. Every number on a card or in the feed is verifiable.
- **$THREE is the only coin** (CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`).
  Never reference any other token anywhere — code, copy, fixtures, cards, bot posts.
  The two runtime-data-only exceptions in CLAUDE.md still apply (user-supplied mints
  in the launcher; platform launch directories rendering real launch records).
- **Every state is designed** — loading (skeletons), empty (tells the user what to
  do next), error (actionable + recoverable), populated, overflow. Mobile-first.
- **No errors without solutions.** Ship working fallbacks and failsafes.
- Concurrent agents share this worktree — **stage explicit paths only** (never
  `git add -A`/`.`); re-check `git status` and `git diff --staged` before committing.
- **esbuild trap:** never commit `api/*.js` starting with `__defProp`/`createRequire`;
  recover with `git restore -- api/ public/`.
- Every user-visible change → an entry in `data/changelog.json`, then
  `npm run build:pages`. New page → the `added` date in `data/pages.json` feeds it.
- DB changes go in a **new timestamped migration** under `api/_lib/migrations/` and
  are reflected in `api/_lib/schema.sql`. New crons/routes → `vercel.json`.
- Tests: `npm test` (vitest + playwright) and `npm run typecheck` must pass. Add
  tests for new logic (truth-layer math, dedup, gating, idempotency).
- Push to BOTH remotes when asked (`git push threeD main && git push threews main`);
  never pull/fetch/merge from `threeD`.
- **Definition of done = CLAUDE.md's checklist.** If you can't verify a step, say so.
