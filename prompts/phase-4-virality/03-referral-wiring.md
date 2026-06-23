# Phase 4 · 03 — Referral wiring everywhere

Read `00-README.md` in this folder and `/CLAUDE.md` first — shared context, existing
files, non-negotiable rules. This task assumes them.

## Goal

The referral primitives exist but are not woven into the viral surfaces. Wire them so
**every shared card, every invite, every win** carries the sharer's referral code,
attribution survives the signup → activation → copy journey, and the referrer can
*see* their reach and earnings. Referrals are how a shared card converts into a
tracked, rewardable new user.

## Build on (do not rebuild)

- `api/_lib/referrals.js` — `generateReferralCode`, `normalizeReferralCode`,
  `getReferralCodeAvailability`, `setReferralCode`, code regex/reserved checks.
- `api/_lib/referral-rewards.js`, `api/_lib/activation.js` — reward + activation.
- `api/_lib/migrations/20260628120000_referral_activation.sql` — existing schema.
- Share cards/routes from prompt 01; the feed from prompt 02; notifications
  (`api/_lib/notify.js`).

## Deliver

1. **Code in every share link.** Every share URL produced in prompt 01/02 and across
   profiles, leaderboard, vaults, and the feed embeds the signed-in user's referral
   code (e.g. `?ref=<code>`). Anonymous/logged-out sharers fall back to a neutral
   link (no broken `?ref=undefined`).
2. **Attribution capture & persistence.** Landing with `?ref=` captures the code
   (cookie/storage), survives navigation, and is bound to the new account at signup —
   then to activation (first copy / first vault deposit / first deploy) via
   `activation.js`. Self-referral and code re-binding are rejected. No double-credit.
3. **"Your referral code" surface.** A real UI (settings/profile) to claim a custom
   code (`getReferralCodeAvailability` + `setReferralCode`), copy the link, and see a
   QR. Validation messages for taken/reserved/invalid codes, all states designed.
4. **Earnings & reach dashboard.** Show the referrer their funnel from real data:
   clicks → signups → activations → $THREE earned (from `referral-rewards.js`). No
   vanity numbers — every figure traces to a row. Notify on a successful activation
   ("X joined from your link and made their first copy").
5. **Reward integrity.** Rewards are idempotent and only fire on genuine activation,
   not signup. Document the split/rules inline where they're computed.

## Acceptance

- A shared card link carries the sharer's code; following it through signup +
  first-copy credits the referrer exactly once (test covers the full chain +
  self-referral rejection + idempotency).
- Custom-code claim flow handles taken/reserved/invalid with designed states.
- Earnings dashboard numbers reconcile to `referral-rewards.js` rows.
- `$THREE` is the only token referenced in any reward copy.
- `npm test` + `npm run typecheck` green. `data/changelog.json` entry
  (`feature`/`improvement`); `npm run build:pages` run.

## When done

Run the `/CLAUDE.md` self-review protocol, then delete **only this file**
(`03-referral-wiring.md`).
