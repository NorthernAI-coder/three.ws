# Task 04 — Alert rules: server persistence + real delivery

**Priority:** MEDIUM. **Type:** backend + frontend. **Supersedes:**
`tasks/pump-dashboard-real-apis/12-alerts-server-persist.md` (carry over its intent, then mark it done).

## Goal

Move pump-dashboard alert rules from browser `localStorage` to server-side Postgres, evaluate
them against the live pump.fun event stream on the server, and deliver matches over real channels
(in-app notification + webhook + optional Telegram). Today alerts only exist in the tab that
created them: close the tab and they stop; open another device and they're gone.

## Why this matters

An alert that only fires while a specific browser tab is open is not an alert. Traders expect a
graduation/price/whale alert to fire whether or not they're looking. This is the difference
between a toy and a tool.

## Context — read first

- `tasks/pump-dashboard-real-apis/12-alerts-server-persist.md` — original task statement.
- `pages/pump-dashboard.html` — current localStorage alert UI.
- Existing server-side infra to reuse (do NOT build parallel systems):
  - `api/cron/pumpfun-monitor.js` — already evaluates `graduation_alerts` per user with cooldown
    and webhook delivery. Extend this pattern; don't fork it.
  - `pumpfun_signals`, `graduation_alerts`, `user_notifications` tables.
  - `api/_lib/pumpfun-ws-feed.js` — the live mint/trade/graduation source.
  - Telegram delivery: `api/pump/[action].js` `deliver-telegram`.
  - Observability/alerts: `TELEGRAM_ALERTS_CHAT_ID` (per memory, still unset — handle absence).

## Scope

1. **Schema.** A `pump_alert_rules` table (or extend `graduation_alerts` if it cleanly
   generalizes): `user_id`, `kind` (graduation | price_above | price_below | whale_buy | new_mint
   by_agent), `target` (mint or agent_id, nullable for global), threshold params, delivery config
   (in_app | webhook_url | telegram_chat), `cooldown_seconds`, `enabled`, timestamps.
2. **CRUD API** — authenticated endpoints to create/list/update/delete a user's rules.
3. **Server-side evaluation** — fold rule matching into the existing `pumpfun-monitor` cron (or a
   companion) consuming the WS feed / signals table; respect cooldowns; dedupe.
4. **Delivery** — write `user_notifications`, POST the webhook (with signature/secret), and send
   Telegram when configured. Each delivery channel handles its own failure without blocking others.
5. **Frontend** — dashboard alert UI reads/writes the server; `localStorage` becomes a render
   cache only. Cross-device: rules created on one device appear on another after refresh.

## Definition of done

- [ ] Rules persist server-side and survive tab close; visible on a second device.
- [ ] A real graduation/price/whale event fires the matching rule via the cron, delivering an
      in-app notification and a webhook POST (verify with a request-bin style endpoint).
- [ ] Cooldown + dedupe prevent alert storms.
- [ ] Telegram delivery works when configured, no-ops cleanly when creds absent.
- [ ] Every alert-UI state designed (no rules yet → helpful empty state; delivery-failed surfaced).
- [ ] `npm test` passes; rule-evaluation logic has unit coverage.
- [ ] Mark `tasks/pump-dashboard-real-apis/12-alerts-server-persist.md` done with a pointer here.
- [ ] Changelog entry (tag: `feature`): "Pump dashboard alerts now run server-side — fire across
      devices even with the tab closed, with webhook and Telegram delivery."

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/pumpfun-launchpad-100/04-alerts-server-persistence.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
