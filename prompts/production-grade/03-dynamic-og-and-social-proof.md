# Task 03 — Dynamic OG images + share buttons + real social proof

> Read [00-README-orchestration.md](./00-README-orchestration.md) first. **Track B —
> Virality.** Independent; lands early. Coordinate with `04` (referral) on the share UI and
> with `05` (SEO) on the OG/meta endpoints.

## The thesis

three.ws is intrinsically shareable — a rigged, talking 3D agent is a screenshot waiting to
happen — but right now every agent and every coin shares the **same static `og-image.png`**.
A link to your agent on X looks identical to everyone else's. That kills the single cheapest
growth loop a platform like this has. Fix the share surface and the product spreads itself.

## What exists today (read first)

- **Static OG only on detail pages.** [pages/agent-detail.html](../../pages/agent-detail.html)
  (~line 16) and [pages/launch-detail.html](../../pages/launch-detail.html) (~line 20) both
  fall back to the generic `og-image.png`.
- **A page-OG generator exists but only for static pages** — `/api/page-og` (used by the home
  page). There is no per-agent / per-coin / per-avatar OG route.
- **Share panel exists** — [src/share-panel.js](../../src/share-panel.js): link / iframe /
  web-component snippets, QR via [src/erc8004/qr.js](../../src/erc8004/qr.js), proper
  `role="dialog"` + focus management. It's good — but it's a modal you have to go find; there
  are no share buttons in the detail-page heroes.
- **No social proof on cards.** Marketplace ([src/marketplace.js](../../src/marketplace.js)),
  launches ([pages/launches.html](../../pages/launches.html)), gallery
  ([pages/gallery.html](../../pages/gallery.html)) show no follower/holder/view/like counts and
  no "trending" badges, even though the underlying feeds have the data.

## What to build

1. **Dynamic OG image routes.** Build real OG-image endpoints for agents, coins/launches, and
   gallery avatars (mirror the `/api/page-og` approach — server-rendered image with the
   agent's avatar render or coin logo, name/symbol, and a real stat or two). Wire
   `agent-detail.html` and `launch-detail.html` (and the avatar/gallery detail) to emit
   per-entity `og:image`, `og:title`, `og:description`, and Twitter card tags. Validate the
   cards render in a real share preview.
2. **Share buttons in the hero.** Put a direct share affordance (copy link + X/Twitter intent,
   plus "embed") in the detail-page hero — not buried in a modal. Reuse
   [src/share-panel.js](../../src/share-panel.js); don't reimplement it. Keyboard + focus +
   ARIA correct.
3. **Real social proof on cards and heroes.** Add the genuine signals the feeds already carry:
   holder count / market cap on coin cards, followers / chats / views on agent cards, likes /
   downloads on avatars, and a "🔥 trending" treatment for high-activity items (drive it from
   real activity data — e.g. [api/trending.js](../../api/trending.js), not a hardcoded list).
   Every number is real; if a count is 0, show a real 0 or omit gracefully.
4. **Referral-aware links (coordinate with `04`).** Shared links from a signed-in user should
   carry their `ref=` code so a share is also a referral. Build the share side here; `04` owns
   the attribution. Don't double-implement — agree on the param.

## Hard rules specific to this task

- **$THREE only** in any token-related share/OG copy. Coin/launch OG images render whatever
  mint the launch record references at runtime (allowed — platform launch directory), but
  never hardcode or promote a specific non-$THREE mint in templates or copy.
- OG endpoints must handle the missing/edge entity (deleted agent, no avatar yet, long
  name/emoji) without producing a broken image — design the fallback.

## Definition of done

README DoD, plus: pasting an agent URL and a coin URL into a link-preview tool shows distinct,
correct, good-looking cards; share buttons work from the hero with keyboard; cards show real
counts and trending treatment; shared links from a logged-in user carry `ref=`. OG routes
have tests for the edge entities. Changelog (`feature`). Self-review, then improve the
weakest card state.

Delete this file when done.
