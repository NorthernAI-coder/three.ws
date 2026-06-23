# Phase 4 · 07 — Telegram / X distribution bots

Read `00-README.md` in this folder and `/CLAUDE.md` first — shared context, existing
files, non-negotiable rules. This task assumes them.

## Goal

Push wins off-platform to where the audience already is. A Telegram channel (and an X
poster) that broadcasts notable, provable events — big closes, new graduations,
leaderboard moves, weekly Wrapped highlights — each as a PnL card (prompt 01) with a
referral-tagged link back (prompt 03). Distribution, not spam: only verified,
genuinely notable events, rate-limited, with clear unsubscribe/opt-in semantics.

## Build on (do not rebuild)

- `src/pump/telegram-delivery.js`, `api/pump/deliver-telegram.js`,
  `scripts/changelog-telegram.mjs` — existing Telegram delivery + the bot token
  convention (`TELEGRAM_BOT_TOKEN`, channel/chat id env vars). Reuse, don't reinvent.
- Migrations `*_sniper_telegram_notify.sql`, `*_copy_telegram.sql` — existing
  Telegram link state.
- Share-card endpoints (prompt 01), referral links (prompt 03), the verification
  badge (prompt 05 — only broadcast verified traders), `api/cron/rewards-distribute.js`
  cron pattern.

## Deliver

1. **Event selection.** A defensible "is this notable?" filter from real data: e.g.
   realized PnL above a threshold, ROI above X%, a graduation, a top-N leaderboard
   entry, or a Wrapped highlight — and **only from verified traders** (prompt 05).
   No threshold-gaming: dedupe per trade/event, cap posts per trader per window.
2. **Telegram broadcaster.** A scheduled job (cron, idempotent like
   `rewards-distribute.js`) or hook off the close path that posts the card image +
   caption + referral link to the channel via the existing delivery module. One post
   per event (idempotency key), structured logging, graceful skip if creds absent
   locally (mirror the changelog-telegram `--dry-run` convention).
3. **X poster (real or cleanly gated).** If X/Twitter API creds are configured, post
   the same card + link. If creds are absent, the path is a no-op that logs why —
   never a fake "posted" success and never a hardcoded credential. Document the env
   vars needed.
4. **Controls.** Per-trader opt-out (don't broadcast me), global kill switch via env,
   and rate limits enforced server-side. All copy plain-language; `$THREE` only.

## Acceptance

- Only verified, genuinely-notable, deduped events are broadcast; per-trader and
  global caps enforced (test covers selection + dedup + opt-out).
- Telegram posts carry the real PnL card + a `?ref=` link; re-running the job never
  double-posts (idempotency).
- Missing Telegram/X creds → clean dry-run/no-op with a log line, not a crash or a
  fake success. No credentials committed.
- No token other than `$THREE` appears in any post.
- `npm test` + `npm run typecheck` green. `data/changelog.json` entry
  (`feature`/`infra`); `npm run build:pages` run. New cron (if any) in `vercel.json`.

## When done

Run the `/CLAUDE.md` self-review protocol, then delete **only this file**
(`07-telegram-x-bots.md`).
