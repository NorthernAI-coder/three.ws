# 32 — Pricing & monetization surfaces

> Part of **Production-Ready** (`prompts/production-ready/`). Read `00-README.md` and `/CLAUDE.md` first.

**Phase:** 4 — Growth
**Owns:** pricing page(s), upgrade/paywall surfaces, paid lanes (forge, MCP, skills), `prompts/monetization/` outcomes, billing/receipts.
**Depends on:** `08`, `16`, `18`, `23`. Pairs with `30`, `33`.

## Why this matters for $1B
Revenue is the numerator of valuation. Clear pricing, frictionless upgrade, and
multiple monetization surfaces (paid generation, paid MCP calls, marketplace take,
skill sales, premium features) are what turn engagement into a $1B business.

## Map
- Paid lanes already exist: paid MCP tools (USDC via x402, prompt `23`), skill
  purchases + on-chain licenses (prompt `16`), the free vs paid forge lanes (prompt
  `15`/`08`). Pricing libs: `api/_lib/skill-pricing-rules.js`, `skill-price-cache.js`,
  `x402-prices.js`. Monetization design work: `prompts/monetization/`.

## Do this
1. **Pricing page:** a clear, honest pricing page — what's free, what's paid, what
   each tier/credit unlocks, in plain language. Per-call USDC prices for MCP/forge
   lanes surfaced. Designed for both human users and agent developers.
2. **Upgrade moments:** when a user hits a free-lane limit (prompt `08`), present a
   contextual, non-annoying upgrade with the exact value they're about to get — not a
   hard wall. Track conversion on these moments.
3. **Frictionless checkout:** upgrades/credits use the hardened payment flow (prompt
   `18`) with clear confirmation, instant unlock, and a receipt. No dead ends.
4. **Monetization surfaces wired:** marketplace take-rate on sales (prompt `16`),
   paid MCP calls (prompt `23`), paid generation credits (prompt `15`), premium
   features, and creator payouts — each accounted correctly (prompt `26`) and visible
   on the business dashboard (prompt `25`).
5. **Receipts & billing history:** users/creators see their purchases, balances,
   payouts, and downloadable receipts. Real data, designed empty states.
6. **Creator economics:** make it obvious how creators earn (sell skills/avatars/
   scenes, get tipped, launch) and show real earnings — the supply-side flywheel.
7. **Experiment:** price points and packaging are configurable (source from the
   pricing libs, not hardcoded across the UI) so they can be tested; instrument
   upgrade funnel + LTV inputs (prompt `33`).

## Must-not
- Do not hardcode prices in scattered UI strings — source from the pricing config/libs.
- Do not hard-wall the core wow; convert with value at the limit instead.
- Do not show fabricated revenue/earnings; real accounting only.
- Do not reference any coin other than $THREE (USDC pricing for services is fine).

## Acceptance
- [ ] Clear, honest pricing page (free vs paid, per-call USDC prices) for users + devs.
- [ ] Contextual upgrade moments at free-lane limits with conversion tracking.
- [ ] Frictionless upgrade/credit checkout with instant unlock + receipt.
- [ ] All monetization surfaces wired + accounted + on the business dashboard.
- [ ] Receipts/billing history + creator earnings show real data with designed states.
- [ ] Prices/packaging sourced from one config; upgrade funnel instrumented.
