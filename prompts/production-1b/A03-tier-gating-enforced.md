# A03 — Hold-to-access tiers enforced across every paid endpoint

> Phase A · Depends on: none · Parallel-safe: yes
> Run in a fresh chat in `/workspaces/three.ws`. Read [CLAUDE.md](../../CLAUDE.md) first.

## Mission
"Hold $THREE to unlock fee discounts, higher quotas, and pro perks." The tier ladder is
computed correctly, but the discount and rate multipliers are only *applied* on some
surfaces (forge). If a Gold holder still pays full price on most paid endpoints, the
single biggest reason to accumulate $THREE is hollow. Enforce tiers everywhere money or
quota is spent, and make the benefit visible.

## Where this lives (real files)
- `api/_lib/three-tier.js` — 5-tier ladder (Member→Bronze→Silver→Gold→Genesis), USD-value gating, fee discount bps + rate multipliers.
- `api/_lib/forge-tiers.js` — reads tier for forge (the one surface that honors it today).
- `api/_lib/holder-pass.js` — HMAC tier pass for gated worlds.
- `api/x402/*.js` — ~27 paid endpoints using a `paidEndpoint()` helper; most do **not** apply tier discounts.
- `api/_lib/rate-limit.js` — per-user/per-IP limiters whose thresholds should scale by tier.

## Current state & gaps
- Tier discount/multiplier computed in `three-tier.js` but applied inconsistently; only forge reads `forge-tiers.js`.
- No single chokepoint: each paid endpoint prices independently, so discounts drift.
- Rate-limit quotas don't scale by tier, so "higher quotas" is unproven.
- No user-facing "your tier saved you $X" feedback or upgrade nudge.

## Build this
1. **Single pricing chokepoint:** add a helper (e.g. `api/_lib/token/apply-tier-pricing.js`) that, given a wallet + base price + base quota, returns the tier-adjusted price and quota. Route every `api/x402/*` endpoint and `paidEndpoint()` through it so discounts are computed in exactly one place.
2. **Audit & wire all paid endpoints:** enumerate every paid surface (`api/x402/*.js`, forge, cosmetics, marketplace sales, mint-to-mesh, tutor, skill-call, vanity, etc.). For each, fetch the caller's tier and apply the discount before quoting. List any endpoint that intentionally has no discount and say why.
3. **Tier-scaled quotas:** make the relevant `rate-limit.js` buckets multiply their threshold by the tier's rate multiplier so higher tiers genuinely get higher quotas. Return the effective quota in response headers.
4. **Make it visible:** in the payment/checkout UI and forge, show "Tier: Gold — 20% off (you saved $X)" and, when a user is close to the next tier, a "hold N more $THREE to reach Silver" nudge linking to the swap.
5. **Server-trust:** tier must be resolved server-side from on-chain balance (never trusted from the client).

## Out of scope
- The buyback (**A01**) and reflections (**A02**).
- Designing new tiers or thresholds (governance).

## Definition of done
- [ ] Every paid endpoint routes pricing through the single chokepoint; an audit list shows each endpoint's discount status.
- [ ] A test proves a Bronze/Silver/Gold holder is charged the correctly reduced price on ≥3 representative endpoints, and Member pays full.
- [ ] Tier-scaled quotas applied to the key limiter buckets, with effective quota in headers.
- [ ] UI shows tier savings + an upgrade nudge near a tier boundary.
- [ ] `npx vitest run` green; changelog entry; committed + pushed to both remotes.

## Verify
- Unit test: same endpoint, four tiers, assert four prices.
- Hit a paid endpoint as a known-tier wallet; confirm the charged amount and headers.
