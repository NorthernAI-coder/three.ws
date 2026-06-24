# 46 · Notifications & Transactional Email

## Mission
Keep users informed and re-engaged: in-app notifications + reliable transactional email (and the
holders' changelog channel) that are timely, correct, and respectful of preferences.

## Context
- In-app notifications: `/api/notifications` (`unread_count`), topbar bell + activity drawer.
- Transactional emails exist (recent commit). Holders' changelog → Telegram via
  `npm run changelog:push` (`scripts/changelog-telegram.mjs`, needs `TELEGRAM_BOT_TOKEN` +
  `TELEGRAM_CHANGELOG_CHAT_ID`).

## Tasks
1. **In-app notifications:** real events (purchase, sale, payout, agent activity, mentions, system),
   unread counts, mark-read, deep links; designed empty/error states; no phantom badges.
2. **Transactional email:** verify the critical emails (welcome, payment receipt, payout, password/login,
   security alerts) send reliably with correct content + links; deliverability (SPF/DKIM/DMARC) set up;
   plain-text + HTML; unsubscribe where required.
3. **Preferences:** users control which notifications/emails they get; honor opt-outs; no spam.
4. **Changelog channel:** confirm `npm run changelog:push --dry-run` previews correctly and the live
   push posts new entries to the holders' Telegram; skip gracefully when creds absent.
5. **Reliability:** queue + retry for email/notification delivery; failures logged (sync prompt 36);
   idempotent (no duplicate sends).
6. **Templates:** on-brand, accessible, responsive email templates; consistent with the design system.

## Acceptance
- In-app notifications real + actionable with correct counts; critical transactional emails send reliably.
- Deliverability configured; preferences honored; changelog push verified (dry-run + live path).
- Delivery queued/retried + idempotent; templates on-brand + responsive.

---
### Operating rules — read CLAUDE.md + STRUCTURE.md first. No mocks/fake data/stubs; real sends. $THREE only (`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`). Stage explicit paths; never `git add -A`. Don't commit `api/*.js` bundles. User-visible change → `data/changelog.json` + `npm run build:pages` (then `changelog:push` after deploy). Push both remotes when asked; never pull from `threeD`. DoD = CLAUDE.md checklist.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "prompts/46-notifications-email.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
