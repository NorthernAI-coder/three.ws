# Task 04 — Surface the referral program (the growth loop that's already built)

> Read [00-README-orchestration.md](./00-README-orchestration.md) first. **Track B —
> Virality.** The backend is done; this is almost entirely the missing front end + a couple
> of incentive hooks. Coordinate with `03` on `ref=` propagation in shared links.

## The thesis

three.ws has a complete, real referral engine — and **zero UI for it**. Users have a referral
code they can't see, earnings they can't watch accrue, and a leaderboard position nobody shows
them. This is a fully built growth loop sitting behind a missing button. Surfacing it is one
of the highest ROI tasks in the program: no new backend, pure activation of an existing asset.

## What exists today (read first — it's real, don't rebuild it)

- **Referral engine** — [api/_lib/referrals.js](../../api/_lib/referrals.js): every signup gets
  a collision-safe `referral_code`; `getMembershipCard()` returns the code, referred-user
  count, lifetime earnings, and a score; commission (default 5%, `REFERRAL_COMMISSION_BPS`) is
  credited on confirmed purchase via [api/_lib/purchase-confirm.js](../../api/_lib/purchase-confirm.js)
  (`creditReferralCommission`). Position is a 1-based signup ordinal today.
- **It's data-only.** There is no copy-to-clipboard share card, no leaderboard UI, no
  "earn per signup" messaging, no `ref=` propagation into agent/share URLs, no funnel step.

## What to build

1. **Referral hub / share card.** A real surface (in the dashboard/account area and reachable
   from nav) that shows the user's actual code, their share link, lifetime earnings, referred
   count, and rank — all from `getMembershipCard()`. One-tap copy and a share affordance
   (reuse [src/share-panel.js](../../src/share-panel.js)). Designed empty state ("you haven't
   referred anyone yet — here's your link").
2. **`ref=` propagation.** When a signed-in user shares an agent/coin/page (coordinate with
   `03`), embed their referral code. On landing, capture `ref=` → attribute on signup through
   the existing referral plumbing. Don't bypass the server logic in `referrals.js`.
3. **A public referral leaderboard.** Turn the existing score/position into a real, shareable
   leaderboard surface (top referrers, the viewer's own rank highlighted). Real data only.
   This doubles as social proof and an SEO/landing surface (coordinate with `05`).
4. **Incentive copy + one real reward hook.** Add honest "earn X% on every purchase you refer"
   messaging where it belongs (referral hub, maybe a homepage strip). Then wire **one** real,
   non-fake incentive milestone (e.g. refer N confirmed signups → a real, server-granted perk
   such as bonus free-generation quota via the existing quota system). It must grant a real
   benefit through real backend state — no cosmetic-only "badge" that does nothing.
5. **Funnel events.** Add referral events to [src/analytics.js](../../src/analytics.js)
   (`REFERRAL_VIEWED`, `REFERRAL_COPIED`, `REFERRAL_LANDED`, `REFERRAL_SIGNUP`) at the real
   moments.

## Hard rules specific to this task

- Earnings, counts, rank, and rewards are **real** (from `referrals.js` / DB) — never fabricated.
- Don't change the backend invariants in `referrals.js`/`purchase-confirm.js`; surface them.
- **$THREE only** in any token-denominated reward/earning copy. USDC settlement is fine.

## Definition of done

README DoD, plus: a user can find, read, copy, and share their referral link; a `ref=` landing
attributes correctly through the real engine; the leaderboard renders real data with the
viewer highlighted; the one incentive milestone grants a real server-side benefit; events fire.
Tests for `ref=` capture/attribution. Changelog (`feature`). Self-review, then improve the
weakest moment (likely the empty state or the share preview).

Delete this file when done.
