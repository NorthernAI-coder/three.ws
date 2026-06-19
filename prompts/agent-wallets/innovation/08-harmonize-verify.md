# Task 08 — Harmonize & Verify the Innovation Program (run LAST)

> Read [00-README-innovation.md](./00-README-innovation.md) first. Run this only after
> 01–07 have landed (or as a continuous sweep alongside them). This task SHIPS fixes —
> it is not a read-only review.

## Mission

Make Treasury Autopilot, Lineage Royalties, Vanity Constellation, Living Wallet Aura,
Programmable Paywalls, the Economy Passport, and the A2A Exchange feel like **one
coherent, gamechanging product** — not seven bolted-on demos. Find every seam, prove
every promise live, and fix everything that's half-wired.

## 1. They must interlock (this is where the magic is)
Verify the features compound, and wire any missing connection:
- A paid unlock (05) on a fork pays ancestors (02).
- A tip triggers Treasury Autopilot rules (01) AND a Living Aura burst (04) AND updates
  the Passport (06).
- A2A earnings (07), royalties (02), tips, and unlocks (05) all feed the same lifetime
  totals on the Passport (06) and the wallet hub.
- Vanity (03) + rarity show identically on chip, hub, passport, and aura.
If two features touch the same number, it must be **one** source of truth, not two
diverging computations.

## 2. One product, one vocabulary
- One shared component per concern under `src/shared/` (aura, paywall-gate, passport card,
  lineage tree). No copy-pasted variants. Consolidate duplication you find.
- One violet wallet accent via tokens (no raw hex), one address formatter, one USD
  formatter, one ownership-role resolver, one balance normalizer — reused by all seven.
- Identical loading/empty/error treatments and motion language across all features.

## 3. Coverage & role correctness (defense in depth)
- Every innovation surface present everywhere it should be; same agent looks/behaves the
  same across profile, marketplace, dashboard, trending, AR/IRL, embeds.
- Owner / visitor / logged-out correct on every surface: owner-only and fund-moving
  controls are absent from the DOM for non-owners AND rejected server-side
  (`user_id === auth.userId`, spend guards). No client-only gating on anything that moves
  money. One agent, one owner upheld end to end.

## 4. Prove every promise LIVE (not in code review)
Run each end-to-end in a real browser and capture the real network/chain calls:
- Autopilot rule fires on a real event and acts on-chain within limits.
- Fork → real tip → royalty split lands in an ancestor's wallet with a signature.
- Grind pool finds a `3ws…`, sealed-envelope gift claimed, funds sweep safely.
- Tip → avatar reacts in 3D and AR; aura tiers match real balances.
- Gated content unlocks only on a verified on-chain payment; supporter badge appears.
- Passport stats each verify on-chain; OG image + embed pull real data.
- One agent autonomously hires + pays another; both ledgers + Mission Control update.

## 5. Real-data audit (zero tolerance)
Grep the whole program diff for sample arrays, hardcoded balances/addresses, `setTimeout`
fake progress, optimistic-grant-before-confirm, TODOs, stubs, commented-out code, and any
non-`$THREE` coin reference. Replace every one with the real implementation. Every number
on screen traces to a real call in the Network tab or a signature on-chain.

## 6. Performance & resilience
No N+1 balance/activity storms (batch + lazy hydration; polling stops offscreen and on
`visibilitychange`). Heavy modules (3D particles, graphs, QR, trade engine) lazy-loaded.
60fps on trending/galaxy/exchange. Edge cases designed: 0/1/1000 items, dust, frozen
wallet, mid-action network failure, expired session, over-limit, an agent with no wallet.

## 7. Tests, changelog, ship
`npm test` green; add tests for the shared helpers and for the cross-feature invariants
(royalty math, unlock verification, autopilot caps, passport sourcing). Each shipped
feature has a real, holder-readable `data/changelog.json` entry; `npm run build:pages`
passes. (Never run `npm install`.)

## Definition of done
All seven interlock through single sources of truth; one visual + interaction language;
every role correct; every promise proven live with real on-chain calls; zero fake data;
green tests; complete changelog. Write a short summary of what you audited, what you fixed,
and the verified cross-feature flows.

When done: commit (explicit paths only; push to **both** remotes if asked), then **delete
this file**. When 01–08 are all deleted, delete `00-README-innovation.md` too — the
innovation program is shipped.
