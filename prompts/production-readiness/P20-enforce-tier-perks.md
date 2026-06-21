# P20 · Enforce $THREE Tier Perks at the Request Boundary

> **Workstream:** Monetization (revenue engine) · **Priority:** P1 · **Effort:** M · **Depends on:** none

## Before you start
1. Read `CLAUDE.md` (rules that override defaults) and `STRUCTURE.md` (surface map). Note the $THREE-only rule and the two coin-agnostic exceptions.
2. three.ws monorepo: vanilla JS + Vite frontend, Vercel functions in `api/`, tests via `vitest` + Playwright (`npm test`), dev server `npm run dev`.
3. **$THREE is the only coin** — CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`.

## Context
The hold-to-access lever is fully specified and partly enforced:

- `api/_lib/three-tier.js` — `TIERS` ladder (Member/Bronze/Silver/Gold/Genesis) by USD value of $THREE held. Each tier carries `discountBps` (fee discount, already consumed by `priceForAction`) AND `rateMultiplier` (1/2/3/5/10 — scales free quotas). `signTierPass`/`verifyTierPass` mint a pure-HMAC tier pass (no RPC) so a game/MCP server can gate without a price feed. `resolveUserTier(user)` reads on-chain holdings.
- `api/_lib/three-access.js` — `GATED_FEATURES` registry. Today `enforced:true` only on `forge.high` (gated in `api/forge.js`) and `forge.gameready` (gated in `api/forge-gameready.js`). **`enforced:false` on:** `worlds.private` (minLevel 2), `worlds.branded` (minLevel 3), `mcp.priority` (minLevel 2), `drops.early` (minLevel 3), `names.first_dibs` (minLevel 4). The registry's `enforced` flag is what `/three` uses to label a perk "Live" vs "Planned" — flipping it to `true` is a PROMISE the gate is actually wired.
- `api/_lib/require-three.js` — `requireFeatureAccess(req, res, featureId, { allowPayPerUse, body })` is the keystone gate: pass-first (HMAC), then session on-chain tier, then anonymous Member. On block it writes a structured `402 three_hold_required` with `held`/`required`/`usd_to_go`/`acquire`/`pay_per_use`. Returns `{ ok, access, level, wallet }`. This is the ONLY helper to call at a gated boundary — `forge.high` already uses it.
- `rateMultiplier` is currently read in exactly two places: `api/forge.js:100` (`tier?.rateMultiplier || 1` for the free-lane quota) and surfaced read-only in `api/three/[action].js:87`. **MCP/forge queueing never consumes it.**
- MCP lanes: `api/mcp-3d.js` (text→3D, image→3D, auto-rig, etc.), `api/mcp-agent.js`, `api/mcp-bazaar.js`, `api/mcp.js`. `mcp-3d.js` already does tier-aware pricing (`_mcp3d/pricing.js`) and per-IP/per-user rate limits (`limits.mcpIp`, `limits.mcpUser`). Worlds: the Colyseus multiplayer server verifies a tier pass (`verifyTierPass`) — see `three-tier.js` "signed tier pass" note.

## Problem / opportunity
Five declared perks are advertised on `/three` and in the tier ladder but `enforced:false` — a Silver holder is promised "Private worlds" and "Priority MCP routing" that no code checks. The `rateMultiplier`, the headline holder benefit ("2×/3×/5×/10× free quota"), is consumed for the free Forge lane only; MCP free quotas and any queue priority ignore it. The platform promises tier value it doesn't deliver — a credibility and revenue gap (holders have no reason to hold for unenforced perks).

## Mission
Wire each `enforced:false` perk to a real check at its request boundary using `requireFeatureAccess`, flip its `enforced` flag to `true` only once the gate ships (with a test), and make `rateMultiplier` actually scale MCP/forge free-tier quotas and queue priority.

## Scope
**In scope:** enforce `worlds.private`, `worlds.branded`, `mcp.priority`, `drops.early`, `names.first_dibs` at their boundaries; consume `rateMultiplier` in MCP + forge free-quota limiting and `mcp.priority` queue ordering; flip `enforced` flags + add per-perk tests.
**Out of scope:** changing tier thresholds or `rateMultiplier` values, the discount path (already wired), inventing new perks.

## Implementation guide
1. **`worlds.private` / `worlds.branded`.** At world-create / world-join (the multiplayer/world endpoints that mint or admit to a private/branded room), call `requireFeatureAccess(req, res, 'worlds.private', { body })` (or `worlds.branded`) before provisioning. Since the Colyseus server already verifies a tier pass, the create path should issue a `signTierPass` the room server re-checks with `verifyTierPass` — gate on the pass level so the room never needs an RPC. `payPerUse: null` for these, so the 402 is hold-only (no pay-per-use leg).
2. **`mcp.priority` + `rateMultiplier` in MCP (`api/mcp-3d.js`).** Resolve the caller's tier once per request (pass-first via header `x-three-tier-pass`, else session `resolveUserTier`). Scale the free/OAuth-funded quota by `rateMultiplier` (a Silver holder gets 3× the base `limits.mcpUser` budget). For `mcp.priority`, when the compute lane is queued, holders at minLevel 2+ jump the shared queue (priority dequeue) — wire it into the actual queue ordering, not a comment. Non-holders keep the base lane. Do not change x402 per-tool pricing (that's the pay path).
3. **`rateMultiplier` parity in forge.** `api/forge.js:100` already applies it to the free lane; ensure the same multiplier is applied consistently anywhere a free-tier daily/window quota is enforced (audit `limits.*` call sites tied to generation). One helper — e.g. `quotaFor(baseLimit, tier)` in `three-tier.js` — so the multiplier math lives in one place.
4. **`drops.early`.** At the drop/collectible mint endpoint, gate the early-access WINDOW: before the public open time, `requireFeatureAccess(req, res, 'drops.early')` must pass (minLevel 3); after public open, everyone in. The gate is time-conditional, not a hard block forever.
5. **`names.first_dibs`.** At the rare-name claim/auction-bid endpoint (`api/threews/auction.js` / `api/x402/pay-by-name.js` area), during the first-dibs window require minLevel 4. This perk has `payPerUse: 'name.auction'`, so allow the pay path after the window per `allowPayPerUse`.
6. **Flip `enforced` + tests.** For EACH perk, only after its gate is wired: set `enforced:true` in `GATED_FEATURES` and add a focused test (mirror `tests/api/forge-gameready.test.js` and `forge-high-gate.test.js`): a sub-tier caller gets `402 three_hold_required` with the right `required` tier; a holder (valid tier pass) passes. A perk whose gate isn't shipped stays `enforced:false` — never flip a flag without the boundary check.

## Definition of done
- [ ] Every flipped `enforced:true` perk has a live boundary check via `requireFeatureAccess` and a passing test for both block and allow.
- [ ] `rateMultiplier` scales MCP + forge free quotas; `mcp.priority` reorders the queue for 2+ holders.
- [ ] Money paths covered by tests (verify, settle, split, idempotency); `npm test` passes.
- [ ] User-visible change → entry in `data/changelog.json`, then `npm run build:pages`.
- [ ] `git diff` self-reviewed; `/three` "Live vs Planned" labels now match reality.

## Verification
- `vitest run` the new per-perk gate tests; assert 402 shape (`held`, `required`, `usd_to_go`, `acquire`) for a Member and pass for a holder pass.
- `npm run dev`: as a non-holder, attempt to create a private world → 402; present a Silver tier pass header → success.
- MCP: fire a batch as a holder vs non-holder and confirm the holder's effective free quota is `rateMultiplier`× and priority dequeue ordering holds under contention.
- Load `/three`: every perk row labeled "Live" is genuinely enforced; none claims an unwired gate.

## Guardrails
- No mocks/fake data. Real on-chain verification + settlement. Idempotent (no double-charge / double-payout).
- $THREE only in copy; never hardcode a non-$THREE mint.
- Stage explicit paths; re-check `git status` before commit. Push only when asked, to BOTH remotes (`threeD`, `threews`).
- Watch the `npx vercel build` trap: never commit bundled `api/*.js`.
