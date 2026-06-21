# 16 — Marketplace (buy, sell & remix)

> Part of the three.ws "Production → $1B" program. Run in a fresh chat. Read
> `/CLAUDE.md` first (its rules override everything) and `prompts/billion-dollar-program/00-README.md`
> for shared context.

## Why this matters for $1B

The marketplace is where the platform's flywheel becomes a business: creators list
agents, avatars, skills and animations; buyers discover, try, and pay; remixers fork
and re-list. If discovery is slow, a buy silently fails, a "fork" lands on a broken
page, or a listing shows a 1px thumbnail, the supply side stops creating and the demand
side stops paying — and the GMV that justifies a $1B valuation never accrues. This
surface must feel like Vercel's template gallery crossed with Stripe-grade checkout.

## Mission

Make the full marketplace loop — list → browse/search/sort/filter → detail → buy/sell/remix
→ settled payment → linked profile — correct, fast, and beautifully stated in every state,
with real USDC settlement and zero dead paths.

## Map (trust but verify — files move)

- **List + detail controller (SPA)** — [src/marketplace.js](../../src/marketplace.js)
  (list view with category sidebar + search; detail with 5 tabs; path routing
  `/marketplace` and `/marketplace/agents/:id`), [src/marketplace-detail.js](../../src/marketplace-detail.js)
  (3D avatar in header, live "try before you fork" SSE chat preview, creator modal,
  mobile sidebar), [pages/marketplace.html](../../pages/marketplace.html) (loads
  `/src/marketplace.js`; route `/marketplace` in [vercel.json](../../vercel.json)).
- **Lobby / detail-market helpers** — [src/marketplace-lobby.js](../../src/marketplace-lobby.js),
  [src/agent-detail-market.js](../../src/agent-detail-market.js).
- **Analytics surface** — [src/marketplace-analytics.js](../../src/marketplace-analytics.js),
  [pages/marketplace-analytics.html](../../pages/marketplace-analytics.html),
  [api/marketplace/analytics.js](../../api/marketplace/analytics.js).
- **Marketplace API** — [api/marketplace/[action].js](../../api/marketplace/[action].js)
  (categories, agents list `?category=&q=&sort=&cursor=&pricing=`, create/mine/detail/versions/similar/fork/bookmark/publish/view),
  [api/marketplace/purchase.js](../../api/marketplace/purchase.js),
  [api/marketplace/purchase-as-agent.js](../../api/marketplace/purchase-as-agent.js),
  [api/marketplace/purchase-bundle.js](../../api/marketplace/purchase-bundle.js),
  [api/marketplace/buy-asset.js](../../api/marketplace/buy-asset.js),
  [api/marketplace/asset-price.js](../../api/marketplace/asset-price.js),
  [api/marketplace/set-skill-price.js](../../api/marketplace/set-skill-price.js),
  [api/marketplace/reviews.js](../../api/marketplace/reviews.js),
  [api/marketplace/start-trial.js](../../api/marketplace/start-trial.js),
  [api/marketplace/animations.js](../../api/marketplace/animations.js),
  [api/marketplace/check-skill-access.js](../../api/marketplace/check-skill-access.js).
- **Cross-links** — agent profiles via [src/shared/agent-3d.js](../../src/shared/agent-3d.js)
  (`seeInWorldHref`, `hasCustomAvatar`), `/agents/:id` ([pages/agent-detail.html](../../pages/agent-detail.html)),
  avatar/animation galleries ([pages/animations.html](../../pages/animations.html),
  [api/avatars/](../../api/avatars)). Shared state kit:
  [src/shared/state-kit.js](../../src/shared/state-kit.js) (skeleton/empty/error),
  [src/shared/list-controls.js](../../src/shared/list-controls.js) (`debounce`, `syncStateToUrl`).
- **Payments** — settlement runs through the x402 + agent-wallet plumbing in
  [api/_lib/](../../api/_lib) (see prompt `18`). Platform fee logic is exercised by
  [tests/api/marketplace-platform-fee.test.js](../../tests/api/marketplace-platform-fee.test.js).
- **Tests** — [tests/api/marketplace-agent-detail-prices.test.js](../../tests/api/marketplace-agent-detail-prices.test.js),
  [tests/api/marketplace-agent-detail-subscriptions.test.js](../../tests/api/marketplace-agent-detail-subscriptions.test.js),
  [tests/api/marketplace-animations.test.js](../../tests/api/marketplace-animations.test.js),
  [tests/api/marketplace-platform-fee.test.js](../../tests/api/marketplace-platform-fee.test.js).

## Do this

1. **Exercise the whole loop in a real browser** (`npm run dev`, port 3000): open
   `/marketplace`, browse, search, switch categories, change sort, filter by pricing,
   open a detail page, run the live chat preview, fork an agent, and buy a paid skill.
   Watch the Network tab — every call (`/api/marketplace/...`) must return real data,
   200/4xx with intent, never a silent hang.
2. **Design every list state:** skeleton on load (use `state-kit.js`), helpful empty
   state for "no results in this category / no matches for this query" (offer a reset
   action — don't show a void), an error state with retry, and overflow handling for
   1000+ listings (cursor pagination via `?cursor=`, not a giant DOM). Persist
   search/sort/filter to the URL with `syncStateToUrl` so results are shareable and
   back-button-safe; debounce the search input.
3. **Sort + filter must actually work end-to-end.** Confirm each `sort` value and the
   `pricing` filter map to real SQL ordering/filtering in `[action].js` (not a no-op).
   If a control renders but does nothing, wire it or remove it — no dead controls.
4. **Detail view is complete:** real 3D avatar in the header (not an emoji placeholder),
   working tabs, accurate pricing (one-time / subscription / time-pass), reviews
   ([reviews.js](../../api/marketplace/reviews.js)), version history, "similar" agents,
   and a creator modal that lists the author's other agents and avatars. Every link
   resolves to a live page; every CTA does something.
5. **Buy/sell/remix flows settle for real:** a purchase posts to `purchase.js` /
   `buy-asset.js` / `purchase-bundle.js`, returns a real receipt, and grants access
   (verify with `check-skill-access.js`). A "fork" creates a real editable copy and
   routes the user to it. Selling: a creator can set a price (`set-skill-price.js`,
   `asset-price.js`) and see it reflected in the listing. Never fake a success toast
   without a settled transaction.
6. **Payment failure is designed, not leaked:** insufficient funds, declined, network
   timeout, and idempotent retry all yield neutral, actionable copy and never surface a
   provider's billing page or a raw stack trace. Reuse the x402 error helpers from
   prompt `18`. A second click on "buy" must not double-charge.
7. **Cross-pollinate the platform:** every listing links to the agent's public profile
   (`/agents/:id`), to "see in world", and to the avatar/animation gallery where
   relevant. A bought animation should be usable in the editor; a forked agent should
   open in Agent Studio. Wire these connections — a marketplace that doesn't link out
   is half-built.
8. **Accessibility + microinteractions:** category sidebar is keyboard-navigable, every
   card/button has hover/active/focus states, the mobile hamburger sidebar traps focus,
   and `pricing`/`sort` controls are labeled. Test mentally at 320 / 768 / 1440.
9. **Run the tests and ship the changelog:** `npx vitest run tests/api/marketplace-*.test.js`.
   Add a `data/changelog.json` entry for any user-visible change, then `npm run
   build:pages` (it validates the entry).

## Must-not

- Do not show a fake success state, a fake progress bar, or a toast without a settled
  on-chain/x402 transaction.
- Do not leak any third party's billing page, credit balance, or raw error to a buyer —
  mask to neutral copy; keep detail in server logs.
- Do not reference, list, or recommend any coin other than `$THREE` (CA
  `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`). Runtime launch records the user
  created are fine; hardcoded mints are not.
- Do not leave dead controls (a sort/filter/tab/button that renders but does nothing).
- Do not break the existing detail SPA routing, the SSE chat preview, or the platform-fee math.
- No mocks, no sample-listing arrays shipped to production, no TODOs.

## Acceptance (all true before claiming done)

- [ ] List, search, sort, filter, detail, buy, sell, fork all work in a real browser
      with real `/api/marketplace/*` calls; no console errors or warnings.
- [ ] Loading (skeleton), empty (with reset CTA), error (with retry), populated, and
      1000+-item overflow (cursor pagination) states are all designed.
- [ ] Search/sort/filter persist to the URL and survive a refresh and back button.
- [ ] A purchase settles real USDC, returns a receipt, grants access; a second click
      does not double-charge; failures show neutral, actionable copy with no vendor internals.
- [ ] Detail header shows a real 3D avatar + real thumbnail; every link/CTA resolves
      to a live page (profile, see-in-world, editor, gallery).
- [ ] Every interactive element has hover/active/focus states; layout holds at 320/768/1440;
      keyboard navigation works.
- [ ] `npx vitest run tests/api/marketplace-*.test.js` passes.
- [ ] Changelog updated and `npm run build:pages` is clean.
