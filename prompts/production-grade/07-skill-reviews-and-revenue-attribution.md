# Task 07 — Skill reviews/ratings + end-to-end revenue attribution

> Read [00-README-orchestration.md](./00-README-orchestration.md) first. **Track C —
> Revenue.** Two tightly related halves: a trust signal (reviews) and a measurement spine
> (attribution). Coordinate with `06` (creator dashboard consumes both) and `05` (reviews
> feed SEO structured data).

## The thesis

A marketplace without reviews can't build buyer trust, and a business that can't trace
"who spent what on whose skill, referred by whom" can't optimize pricing, discounts, payouts,
or acquisition. Both are foundational to a $1B marketplace. The reviews **schema already
exists** — the handlers and UI don't. Attribution events are **half-defined** — the revenue
half is missing. Finish both.

## What exists today (read first)

- **Reviews schema, no handlers/UI.** A migration exists
  (`api/_lib/migrations/…skill_reviews.sql`) but there are no review endpoints and no review
  UI. Buyers cannot rate skills; creators get no feedback loop.
- **Analytics stops at activation.** [src/analytics.js](../../src/analytics.js) defines an
  activation funnel and a `$THREE` purchase funnel, but there is **no** buyer-revenue funnel:
  no `SKILL_SEARCHED` / `SKILL_VIEWED` / `PAYMENT_INITIATED` / `PAYMENT_CONFIRMED` /
  `SKILL_UNLOCKED`, and no chained attribution to creator + referrer.
- **Purchase confirmation is real** — [api/_lib/purchase-confirm.js](../../api/_lib/purchase-confirm.js)
  already credits referral commission on confirmed purchase; that's the join point for
  attribution.

## What to build

### A. Reviews & ratings
1. **Endpoints**: create/read/update/delete a review (rating + text) for a skill, gated to
   buyers who actually purchased it (verify against purchase records). Aggregate rating per
   skill. Abuse controls (one review per buyer per skill; rate-limited; moderation hook).
2. **UI**: show aggregate rating + reviews on skill/marketplace pages; let eligible buyers
   leave/edit a review; surface a creator-facing view of their reviews in the `06` dashboard.
   Designed empty/loading/error states; ARIA on the rating control; keyboard operable.
3. **Structured data**: expose aggregate rating for `05`'s `Product`/`Offer` JSON-LD.

### B. Revenue attribution funnel
4. **Events**: add the buyer-revenue funnel to [src/analytics.js](../../src/analytics.js)
   (`SKILL_SEARCHED`, `SKILL_VIEWED`, `PAYMENT_INITIATED`, `PAYMENT_CONFIRMED`,
   `SKILL_UNLOCKED`) and fire them at the real moments in the marketplace + checkout paths.
5. **Attribution chain**: at confirmed purchase
   ([purchase-confirm.js](../../api/_lib/purchase-confirm.js)), record the full chain — buyer →
   skill → creator → referrer → amount/net/fees — so the question "what % of signups buy within
   7 days, and which channel/referrer drove it" is answerable. Persist it in a queryable shape
   (real table; reuse existing revenue/royalty tables where possible). No PII beyond what's
   already stored; respect the privacy policy.

## Hard rules specific to this task

- Reviews are **real and earned** — only genuine purchasers can review; never seed fake
  reviews or ratings, ever (that violates the no-fake-data rule and is fraud).
- Attribution is **real** — derived from real purchase/referral rows, not synthesized.
- **$THREE only** in token copy. USDC settlement amounts are fine.

## Definition of done

README DoD, plus: a real buyer can review a purchased skill and a non-buyer cannot; aggregate
ratings render and feed JSON-LD; the buyer-revenue funnel events fire end-to-end; a confirmed
purchase writes a complete attribution row that the `06` dashboard can read. Tests for the
buyer-only review gate and the attribution write. Changelog (`feature`). Self-review, then
improve the weakest state (likely the review empty/first-review prompt).

Delete this file when done.
