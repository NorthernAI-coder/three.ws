# B5 — Retention & Lifecycle Messaging

You are a senior engineer + product thinker building **three.ws**. Read `CLAUDE.md`,
`STRUCTURE.md`, and `prompts/production-campaign/00b-the-bar.md` first. **Prerequisites:**
B3 (lifecycle triggers fire on funnel events — run after, not hard-blocked).

## Why this matters for $1B
Activation gets a user in the door once; **retention is what a valuation is built on** — daily
use and a reason to come back tomorrow (`00-README-orchestration.md` pillar 2). A platform with
great activation and zero lifecycle messaging leaks every cohort it acquires. The machinery is
already here — Resend is a dependency, transactional email exists, the changelog→Telegram push
exists, notifications and pump alerts exist — but it isn't orchestrated into a coherent
lifecycle that welcomes, re-engages, digests, and wins back, *honestly opted into*. This prompt
turns one-time visitors into a returning, compounding user base.

## Current state (read before you write)
- `api/_lib/email.js` is real transactional email via **Resend** (`process.env.RESEND_API_KEY`),
  fire-and-forget, with `buildPayload()` and render helpers already written: `renderWelcome`,
  `renderVerify`, `renderPasswordReset`, `renderSubscriptionConfirm`, `renderPurchaseReceipt`,
  `renderSaleNotification`. Read it — extend this module's render set; don't reinvent sending.
- `api/newsletter-subscribe.js` uses Resend audiences (`RESEND_AUDIENCE_ID`) — the opt-in
  subscribe path exists. Confirm there's an honest unsubscribe path; build one if missing.
- `scripts/changelog-telegram.mjs` (`npm run changelog:push`) posts new `data/changelog.json`
  entries to the holders' Telegram channel — the changelog→Telegram loop exists; verify it's
  reliable and idempotent (no double-posts).
- `src/notifications.js` and `api/alerts/` (`rules.js`, `rules/[id].js`, evaluated by a
  pumpfun-monitor cron) are the in-app/pump notification system. Read them — the eventing and
  cron pattern you'll reuse for digests lives here.
- The gap: no welcome/onboarding-nudge sequence, no re-engagement digest, no win-back for
  dormant users, and opt-in/opt-out preferences aren't centralized or honest everywhere.

## Your mission
### 1. Build the lifecycle email sequence on `api/_lib/email.js`
Add render helpers + triggered sends for the real moments: **welcome** (post-signup — extend
`renderWelcome` into a true day-0 nudge toward the next action), **activation nudge** (signed
up but hasn't forged/walked), **re-engagement digest** (what's new in your gallery, $THREE
updates, launches), and **win-back** (dormant N days). Each email is on-brand, plain-text +
HTML, single clear CTA, and links to a real surface. Reuse the existing Resend send path — no
new mailer.

### 2. Trigger off real funnel state, not a schedule alone
Wire triggers to B3's funnel events where event-driven (welcome on `account.created`,
activation nudge on "signed up, no wow after X"), and a cron under `api/cron/` (match the
pumpfun-monitor cron pattern in `api/alerts/`) for time-based digests/win-back that query real
user state. No blasting — segment by real behavior. Idempotent: a user never gets the same
lifecycle email twice.

### 3. Unify in-app notifications with the lifecycle
`src/notifications.js` should surface the same lifecycle moments in-app (new launch, sale,
digest-worthy events) so messaging is consistent across channels. Reuse `api/alerts/` rules
where a user has configured them; don't duplicate the alert engine.

### 4. Harden the changelog→Telegram push
Make `scripts/changelog-telegram.mjs` bulletproof: idempotent (track what's posted, never
double-send), `--dry-run` honored, and gracefully skips when `TELEGRAM_BOT_TOKEN` /
`TELEGRAM_CHANGELOG_CHAT_ID` are absent. This is a holder-facing retention channel — it must
not spam or miss.

### 5. Honest opt-in / opt-out everywhere
A real preference center (extend account settings) for: lifecycle email, product digests,
in-app notifications, Telegram. Every email has a working one-click unsubscribe (List-
Unsubscribe header + link) wired to Resend audiences. Default to the minimum honest set; never
opt a user in silently. Respect the preference on every send — verify the gate.

## Definition of done
Maps to pillar 2 (retention) and §4 (honest UI). Specifically: welcome, activation-nudge,
digest, and win-back emails send via the existing Resend path, triggered by real state, fully
idempotent, with working unsubscribe; a preference center honors opt-out on every channel;
in-app notifications mirror lifecycle moments without duplicating the alert engine; the
changelog→Telegram push is idempotent and credential-safe; no email/notification fires against
a user who opted out (verified); no secrets client-side; no console errors. **Also inherits the
global definition of done in `00-README-orchestration.md`.**

## Operating rules (override defaults)
No mocks/fake data/placeholders/TODOs — real Resend sends, real user-state queries, no canned
recipient lists. `$THREE` is the only coin named in any email, digest, push, or notification.
Design tokens (or the email's existing template tokens) for all rendered mail. **Watch the
`api/*.js` bundle trap** on edited endpoints/crons. Stage explicit paths only (never
`git add -A`); re-check `git diff --staged` before commit. Own the lifecycle/notifications
lane; extend `api/_lib/email.js`, `src/notifications.js`, `api/alerts/`, and the Telegram
script — don't fork them.

## When finished
Run the five self-review checks. Ship one improvement — e.g. a "your first model, one week
later" win-back that re-uses B4's OG card, or a digest that surfaces the user's own funnel
progress from B3. Append a `data/changelog.json` entry if user-visible (tag `feature`). Then
delete this prompt file (`prompts/production-campaign/B-growth/B5-retention-lifecycle.md`) and
report the lifecycle sequence, the trigger sources, the preference center, and the idempotency
guarantees — note any send that still needs a real cohort to validate (seam for the next agent).
