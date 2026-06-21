# B4 — Virality, Share Loops & Referrals

You are a senior engineer + product thinker building **three.ws**. Read `CLAUDE.md`,
`STRUCTURE.md`, and `prompts/production-campaign/00b-the-bar.md` first. **Prerequisites:**
B3 (share/referral events feed the funnel — run after, not hard-blocked).

## Why this matters for $1B
Network effects are the difference between linear growth and a compounding curve
(`00-README-orchestration.md` pillar 4). The cheapest acquisition channel is a user showing
off what they made. The bar (`00b-the-bar.md` §5): **every shareable moment has an OG card
and a share action — a generated model, a trade win, an agent profile — each a link that
unfurls beautifully.** three.ws already has the raw materials (a fleet of `*-og.js` endpoints,
`@vercel/og`, share endpoints, a referrals page) but they're not unified into a gorgeous,
universal, one-tap loop that closes back into activation. This prompt turns every proud moment
into a new visitor.

## Current state (read before you write)
- OG endpoints already exist: `api/agent-og.js`, `api/avatar-og.js`, `api/feature-og.js`,
  `api/a-og.js`, `api/app-og.js` — and `@vercel/og` is a dependency (`package.json`). They use
  a `wrap()` handler pattern (read `api/agent-og.js`). Quality and design consistency across
  them is uneven — your job is to make them universal and screenshot-worthy.
- Share endpoints exist: `api/agent-share.js`, `api/forge-share.js`, `api/oracle-share.js`,
  `api/trader-share.js`, plus `api/agent-oembed.js` (oEmbed for rich embeds). Read them — share
  routing exists in pieces; it's not one cohesive, on-brand action everywhere.
- A referral surface already exists: `src/dashboard-next/pages/referrals.js` and
  `src/dashboard-next/referral-claim.js`. Read both — extend, don't rebuild.
- The gap: no shared OG render system (each endpoint reinvents layout), no one-tap share on
  every shareable surface, and the referral loop isn't wired to attribute new activations.

## Your mission
### 1. Build one gorgeous, universal OG render system
Extract a shared `@vercel/og` layout helper into `api/_lib/` (brand frame, $THREE-consistent
palette from design tokens, three.ws logo, dynamic title/subtitle/art slot, model thumbnail or
avatar render). Refactor `agent-og.js`, `avatar-og.js`, `feature-og.js`, `a-og.js`,
`app-og.js` to use it so every card is unmistakably three.ws and pixel-clean at 1200×630.
Handle overflow (200-char names), missing art (on-brand fallback), and edge data — never a
broken or empty card. Cards must render fast (cache headers) and never 500.

### 2. Add a one-tap share action to every shareable moment
A reusable share control (Web Share API where available, copy-link + X/Telegram/Farcaster
fallback) on: a forged model (post-Forge, ties to B1's wow), a trade win (trader surface),
an agent profile, and a launched coin's record. Each share produces a real link whose `<head>`
points at the right `*-og.js` card and oEmbed (`agent-oembed.js`) so it unfurls everywhere
(X, Discord, Telegram, iMessage, Slack). Verify the unfurl shape, not just that the image 200s.

### 3. Close the referral loop
Extend `src/dashboard-next/pages/referrals.js` + `referral-claim.js`: every signed-in user gets
a real referral link; sharing a model/profile/win carries that referral param; an arriving
referee is attributed on activation (account create / first paid action). Surface real referral
stats (clicks → activations → rewards) — no fabricated counts. Define the reward honestly
(coordinate with D-monetization for any $THREE-denominated incentive; never invent another
token).

### 4. Wire share + referral events into the funnel
Emit B3's taxonomy events: `share.clicked`, `share.completed`, `referral.link.created`,
`referral.arrived`, `referral.activated`. This makes virality measurable — k-factor becomes a
number on B3's dashboard, not a hope.

### 5. Make sharing irresistible, not an afterthought
The share affordance appears at the peak emotional moment (model delivered, win banked), is
one tap, previews the actual card before sending, and confirms with delight. Hover/active/focus
states, reduced-motion honored, keyboard-reachable. The card is the product's billboard —
treat it like one.

## Definition of done
Maps to `00b-the-bar.md` §5 (every shareable moment → gorgeous OG card + share action) and §3
(screenshot test). Specifically: all five OG endpoints render through one shared, on-brand
helper and unfurl correctly on X/Discord/Telegram (verified); a one-tap share exists on
forged-model, trade-win, agent-profile, and launch surfaces with working fallbacks; the
referral link attributes real arrivals to activation with honest stats; share/referral events
flow into B3's funnel; OG endpoints cache, never 500, and handle overflow/missing art; no
console errors. **Also inherits the global definition of done in
`00-README-orchestration.md`.**

## Operating rules (override defaults)
No mocks/fake data/placeholders/TODOs — no fake referral counts, no canned share preview.
`$THREE` is the only coin in any card, copy, reward, or metadata. Design tokens only for OG
art and share UI. **Watch the `api/*.js` bundle trap** — check `head -1` of every edited
endpoint for `__defProp`/`createRequire` before committing; recover with
`git restore -- api/ public/`. Stage explicit paths only (never `git add -A`); re-check
`git diff --staged` before commit. Own the OG/share/referral lane; extend the existing
endpoints and referral pages, don't replace them.

## When finished
Run the five self-review checks. Ship one improvement — e.g. an animated/looping OG variant for
platforms that support it, or a "remix this model" deep link that drops the referee straight
into B1's first-run with the original prompt. Append a `data/changelog.json` entry (tag
`feature`). Then delete this prompt file
(`prompts/production-campaign/B-growth/B4-virality-share-loops.md`) and report the unified OG
system, the surfaces that now share in one tap, the referral attribution path, and the
k-factor events — the seam B6 uses for social proof.
