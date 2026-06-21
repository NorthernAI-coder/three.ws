# 39 — PWA & notifications

> Part of **Road to $1B** (`prompts/road-to-1b/`). Read `00-README.md` and `/CLAUDE.md` first.

**Phase:** 4 — Growth
**Owns:** PWA manifest + service worker, install experience, push/email/Telegram notifications, `api/newsletter-subscribe.js`, changelog Telegram push.
**Depends on:** `10`, `25`, `33`, `37`. Pairs with `30`, `35`.

## Why this matters for $1B
Re-engagement is retention, and retention is valuation. An installable PWA + a
well-built notification system (a launch filled, a skill sold, a tip received, an
agent mentioned) brings users back without paid spend. The platform already pushes the
changelog to a $THREE-holder Telegram channel — extend that muscle into real product
notifications.

## Map
- Existing: `api/newsletter-subscribe.js`, changelog Telegram push
  (`npm run changelog:push`, `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHANGELOG_CHAT_ID`).
  `error-reporter.js` shows there's already client infra to build on.

## Do this
1. **PWA:** add/validate a complete web app manifest (name, icons across sizes, theme/
   background colors, display mode, start URL) so the app is installable on mobile +
   desktop. `npm run generate-icons` covers icon sizes.
2. **Service worker:** offline-friendly shell + smart caching for static assets/GLBs
   (coordinate with prompt `10` cache policy); cache-first for immutable assets,
   network-first for data; a clean offline page. Versioned SW with safe update flow
   (no stale-forever bug).
3. **Push notifications:** real web-push (with permission requested at a *good* moment,
   not on first load) for high-value events: your launch filled, skill sold, tip
   received, payout ready, agent mentioned/forked. User-controllable per category.
4. **Email:** transactional emails (welcome/onboarding — prompt `30`, receipts —
   prompt `32`, security alerts) via a real provider; double-opt-in newsletter built
   on `newsletter-subscribe.js`. Localized (prompt `38`).
5. **Telegram:** keep the holder changelog push; optionally let users opt into
   per-account Telegram alerts for their agents/launches. Reuse the existing bot infra.
6. **Preference center:** one place to manage every notification channel + category,
   with easy unsubscribe (and honoring it — prompt `37`). No notification without a
   real off switch.
7. **Instrument:** track notification sent → opened → returned (prompt `33`) so the
   re-engagement loop is measurable and tuned, not spammy.

## Must-not
- Do not request push/notification permission on first load — ask at a value moment.
- Do not send a notification type the user can't turn off.
- Do not cache so aggressively that users get stuck on a stale build (safe SW updates).
- Do not reference any coin other than $THREE in any notification copy.

## Acceptance
- [ ] Complete PWA manifest; app installable on mobile + desktop.
- [ ] Versioned service worker with smart caching, offline page, safe update flow.
- [ ] Web-push for high-value events, permission asked at a good moment, per-category control.
- [ ] Transactional emails + double-opt-in newsletter via a real provider, localized.
- [ ] Telegram changelog retained; optional per-account alerts.
- [ ] Unified preference center with honored unsubscribe.
- [ ] Notification sent→opened→returned instrumented.
