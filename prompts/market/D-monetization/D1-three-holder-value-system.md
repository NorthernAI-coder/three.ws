# D1 — One $THREE-Holder Value System, Everywhere

You are a senior engineer + product thinker building **three.ws**. Read `CLAUDE.md`,
`STRUCTURE.md`, and `prompts/production-campaign/00b-the-bar.md` first. **Prerequisites:** none
— this is the foundation D2/D3/D4 price and gate against.

## Why this matters for $1B

Holding $THREE is the platform's deflation-free status lever: hold (don't spend) to unlock
perks. That promise is only worth a multiple if it is **consistent** — the same balance must
mean the same tier, the same perks, the same discount, on every surface that gates on it.
Today Forge gates "High quality" on holders but the tier ladder, the perk copy, the upgrade
path, and the balance check live in separate places and are wired into exactly one surface.
A holder who sees a "Silver perk" on one page and a dead "for holders only" string on another
does not believe the token has value — and a token nobody believes in has no market cap to
multiply. One helper, one UX, everywhere is what makes the economy legible.

## Current state (read before you write)

- `api/_lib/three-tier.js` — the **source of truth**: the `TIERS` ladder (Member → Bronze →
  Silver → …), `minUsd` thresholds, `discountBps`, `rateMultiplier`, perks, and the signed
  tier pass (`signTierPass`/`verifyTierPass`) the multiplayer server verifies. Resolves a
  tier from the live USD value of $THREE held; degrades to Member on a price/RPC hiccup.
- `api/_lib/three-access.js` — `featureId → { minLevel, enforced, label, why, payPerUse }`
  registry + `resolveAccess(user, featureId)` (async, for display) and `accessFromTierLevel`
  (pure, for enforcement). This is the platform-wide access table — but inventory it: how many
  real `featureId`s are registered vs. how many surfaces actually gate?
- `api/_lib/three-gate.js` — raw on-chain balance check (`checkThreeBalance`), fails **open**.
- `api/_lib/holder-pass.js` — the per-coin world-entry pass; `balances.js` — wallet balances.
- `api/_lib/forge-tiers.js` — Forge's quality tiers; the one surface that gates today.
- **The gap:** the ladder and access table exist server-side, but there is no single **client**
  module that every page imports to (1) read the user's tier, (2) render the same tier badge +
  perk list, (3) gate an affordance with a consistent locked state, and (4) route to one
  upgrade path. Each surface that wants to gate re-implements the check and the copy.

## Your mission

### 1. Lock the tier ladder + access registry as the single source of truth
Audit `TIERS` in `three-tier.js` for completeness (every tier has perks, a `discountBps`, a
`rateMultiplier`, and reachable, sensible `minUsd` thresholds). Inventory `three-access.js`:
register a `featureId` for **every** surface that should gate on holding — Forge high quality
(exists), private/branded worlds, priority MCP routing, higher free quotas, early-access pages.
Each entry needs honest `label`/`why` copy a holder reads in the UI. No invented perks that
aren't wired — if you register it, the gating surface honors it in this PR or a sibling prompt.

### 2. Ship ONE client holder-value module — `public/three-tier-client.js`
A single ES module every gating surface imports. It must:
- Resolve the signed-in user's tier from a real endpoint (extend/confirm an
  `api/account/tier` or `api/three/access` endpoint that returns `{ tier, usdHeld, nextTier,
  usdToNext, perks }` from `resolveUserTier`). No client-side balance math — server is truth.
- Export `renderTierBadge(el, tier)`, `gateAffordance(el, { featureId, onUnlock })`, and
  `requireTier(featureId)` returning `{ allowed, tier, upgradeUrl }`.
- A consistent **locked state**: disabled affordance + a tooltip/popover stating the exact
  requirement ("Hold $25 of $THREE to unlock — you hold $8") and a single upgrade CTA.
- Cache the tier for the session; refresh on wallet/auth change. Never block paint on the fetch.

### 3. Build the canonical upgrade path — one `/account` (or `/three`) tier surface
One page renders the full ladder: current tier highlighted, every tier's perks, the live
$-to-next-tier delta, and a real "Hold more $THREE" action that links to the $THREE acquisition
flow (the existing $THREE token/buy surface — `$THREE` CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`).
Every locked state across the platform routes here. Design all five states (loading skeleton
of the ladder, empty/not-signed-in with a connect CTA, error, populated, overflow at $10M+).

### 4. Replace the per-page reinventions with the shared module
Migrate the Forge "High quality" gate to consume `three-tier-client.js` + `three-access.js`
instead of its bespoke check. Then wire the shared gate into the other registered surfaces
(private worlds, priority routing) so they show the same badge, locked state, and upgrade
route. Delete any duplicated tier copy/threshold literals you find — one ladder, referenced.

### 5. Make holding *visibly* pay off where the user already is
Surface the holder discount and quota multiplier inline at the point of value: a tier badge in
the nav/account menu, the holder discount line on any priced action (a seam D2/D3 consume),
and the perk the user just unlocked called out on the relevant surface. Holding must feel like
it did something, not just change a number on a settings page.

### 6. Test the ladder and the gate
Extend tests so the tier resolution, the fail-open balance behavior, the pure
`accessFromTierLevel` enforcement, and the signed tier-pass round-trip are covered. Add a test
asserting every `three-access.js` `featureId` maps to a real tier level and has non-empty copy.

## Definition of done

Clears 00b-the-bar.md's monetization bar ("$THREE holding unlocks visible, consistent value
across every surface that gates on it — same tiering, same upgrade path, everywhere") and the
polish bar (all five states designed on the tier surface and the locked state). Inherits the
global definition of done in `00-README-orchestration.md`. Specifically: one client module is
the only holder gate in the codebase; Forge and ≥2 more surfaces consume it; the upgrade page
is reachable from every locked state; tier resolution degrades gracefully and is tested;
`npm test` green; verified in a browser with a real wallet at a real and a zero balance.

## Operating rules (override defaults)

No mocks/fake data/placeholders/TODOs/stubs. **`$THREE` is the ONLY coin** — never name,
hardcode, or recommend any other token (runtime user-launch mints are the sole mechanical
exception per CLAUDE.md). Design tokens only. Stage explicit paths only (never `git add -A`).
Own the holder-value lane (`three-tier.js`, `three-access.js`, `three-gate.js`, the client
module, the tier surface); extend `balances.js`/`holder-pass.js`/`forge-tiers.js`, don't
rewrite them.

## When finished

Self-review (CLAUDE.md's five checks). Ship one improvement (e.g. an empty-state illustration
on the tier surface, or a keyboard-navigable ladder). Append a `data/changelog.json` entry
(holder-readable, tag `feature` or `improvement`) since this is user-visible. Then delete this
prompt file (`prompts/production-campaign/D-monetization/D1-three-holder-value-system.md`) and
report what you shipped + the seam D2/D3/D4 consume (the tier-resolution endpoint shape and the
`discountBps`/`rateMultiplier` contract they price against).
