# 31 — Monetization, pricing & $THREE utility

> Part of **Road to $1B** (`prompts/road-to-1b/`). Read `00-README.md` and `/CLAUDE.md` first.

**Phase:** 6 — Growth & business
**Owns:** pricing surfaces, $THREE holder gating, skill/marketplace economics, x402 revenue, credits/metering.
**Depends on:** 20 (marketplace), 24 (payments), 30 (revenue events).  ·  **Parallel-safe with:** 30.

## Why this matters for $1B
Revenue and a credible $THREE utility loop are the spine of the valuation. Every paid
surface must price clearly, charge correctly, and reinforce why holding $THREE matters —
without ever promoting another coin (prompt 04). Related: `prompts/monetization/`.

## Mission
Make every monetized path clear, correct, and metered, and make $THREE the obvious,
real utility token across the platform.

## Map
- $THREE gating (e.g. `api/pump/check-three-balance.js`, `packages/three-token-mcp`),
  forge high-quality holder unlock, skill purchases (prompt 20), x402 paid endpoints
  (prompt 24), any credits/metering layer in `api/`.

## Do this
1. Map every paid/gated capability (high-quality forge, premium skills, x402 calls,
   holder perks); ensure each prices clearly and charges correctly server-side.
2. Make $THREE-holder benefits real and consistent (the forge "hold $THREE to unlock"
   pattern) — gating enforced server-side, never client-trusted.
3. If a credits/metering layer exists, verify deposits, balances, and consumption are
   correct and idempotent (ties prompt 24); designed insufficient-credit states.
4. Build/verify a clear pricing surface that explains free vs holder vs paid, with no
   dark patterns.
5. Ensure x402 paid endpoints are discoverable and priced sensibly (ties prompt 24/26).
6. Connect revenue events to prompt 30 so monetization is measurable.

## Must-not
- No client-trusted entitlement checks; no hidden/surprise charges.
- Never promote, price in, or recommend any coin other than $THREE.

## Acceptance
- [ ] Every paid/gated path prices clearly and charges correctly server-side.
- [ ] $THREE utility is real and consistently gated; pricing surface is honest.
- [ ] `npm test` green; changelog `feature`/`improvement` entry.
