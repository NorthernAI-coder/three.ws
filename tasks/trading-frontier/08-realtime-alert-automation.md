# Task 08 — Real-Time Alert & Automation Engine (push / Telegram / in-app)

> **Operating bar.** Senior engineer + product thinker building three.ws to beat the best.
> Genuinely innovative, not a clone. No mocks/fake data/placeholders/TODO/stubs/`setTimeout`
> fake-loading. Wire 100% with REAL APIs + on-chain data. Only coin is **$THREE**
> (`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`); runtime mints in generic plumbing are the only
> exception, never promoted.

## ⛓ Chain protocol — STEP 0, before building

Node in a self-extending chain (see `tasks/trading-frontier/README.md`). Before building:
read all `tasks/` + `BACKLOG.md`; invent **10 genuinely new, non-duplicate, real-codebase-grounded
feature ideas**; write each as a full prompt in `tasks/trading-frontier/next/<slug>.md` matching
this file's structure (including this Chain protocol section); append each to `BACKLOG.md` after a
dedup check. Only then build YOUR feature to the production-ready bar (epic README) and `git rm`
this file in the completion commit.

## The invention

Alpha is worthless if you see it too late. Build a **real-time alert & automation engine**: users
define alerts over live signals — "ping me when a launch scores >85 with smart money in", "alert if
my position drops 30%", "tell me when a creator I follow deploys", "notify on a rug flag in
anything I hold" — delivered via in-app toast, push, and Telegram, **with an optional one-tap auto-
action** ("...and auto-buy 0.2 SOL", "...and auto-sell"). Alerts that can *act*, wired to the
firewall + spend guards. Programmable, multi-channel, action-capable — beyond any pump.fun alert bot.

## Context (real, verified)

- Telegram already integrated (changelog push): `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHANGELOG_CHAT_ID`,
  `scripts/changelog:push`. Reuse the bot plumbing for user-scoped chat IDs.
- Live signal sources: feed `api/_lib/pumpfun-ws-feed.js`, intel `pump_coin_intel`, oracle
  `oracle_conviction`, positions `api/sniper/stream.js`, smart-money (`tasks/next-gen-trading/03`),
  creator reputation (this epic 06), graduation predictor (this epic 04).
- Auto-actions reuse `api/agents/agent-trade.js` + firewall (`tasks/next-gen-trading/01`) + spend
  guards `api/_lib/agent-trade-guards.js` + custody audit `agent_custody_events`.
- Sniper already has a `telegram_chat_id` field on strategies — generalize notifications platform-wide.

## Goal

An alert-rule model + an evaluation worker that watches live signals, delivers multi-channel
notifications, and optionally fires guarded auto-actions — with a clean rule-builder UI.

## What to build

1. **Alert model** — `alerts` (id, user_id, agent_id, network, scope [market|position|creator|
   wallet], condition jsonb (validated spec over real signals), channels [in_app|push|telegram],
   throttle/cooldown, auto_action jsonb nullable (buy/sell with size + limits), status, created_at)
   + `alert_events` (fired alerts: matched payload, delivered_to, action_taken, at).
2. **Evaluation worker** — extend `workers/agent-sniper/` (or sibling) to evaluate active alerts
   against the live feed + intel + positions on a tight cadence, with dedupe + cooldown so users
   aren't spammed. Honest on data gaps; never fire on stale/fake data.
3. **Delivery** — in-app (SSE + a notification center), Telegram (per-user chat linking flow:
   `/start`-style bind), and web push (service worker + VAPID). Each channel reliable, with
   delivery status recorded. Respect per-user channel prefs + quiet hours.
4. **Action-capable alerts** — when `auto_action` is set, the fired alert executes a guarded trade
   from the agent wallet (firewall + spend caps + kill switch + audit). Require an explicit opt-in +
   per-action confirmation default, with an express mode the user can enable knowingly.
5. **API + UI** — `/api/alerts` (CRUD, mute), `/api/alerts/events` (history), `/api/notifications/
   stream` (SSE), push subscription endpoints, Telegram bind. Build an **Alerts** surface: a rule
   builder with plain-language presets + live preview of what would match now, a channel/prefs
   panel, and an alert history with the action taken. A platform notification center (bell) for
   in-app. All states designed; accessible; responsive.

## Constraints

- Alerts evaluate **real live signals** only; auto-actions are firewall + spend-guarded + audited
  and never bypass limits or the kill switch. Conditions use a validated spec, not arbitrary code.
- Real delivery only — real Telegram messages, real push; no fake "sent" states. Failures surfaced.
- $THREE-only rule in all copy/templates; mints in alerts are runtime data.

## Success criteria

- A user defines alerts across market/position/creator/wallet scopes; they fire on real live
  signals and deliver via in-app + push + Telegram with cooldown/dedupe.
- An action-capable alert fires a guarded, audited auto-trade with opt-in confirmation.
- Alerts UI (builder, prefs, history) + notification center render all states; responsive +
  accessible. Production-ready bar met; chain extended. Build/typecheck/test clean. Changelog
  (tags: feature). Completionist passes.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file (after authoring + registering 10 chained prompts)

```bash
git rm "tasks/trading-frontier/08-realtime-alert-automation.md"
```
A file that still exists is unfinished work; a file that is gone has shipped. Do not delete early.
