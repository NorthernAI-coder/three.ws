# Task 06 — Integration, consistency & QA pass (run LAST)

> **Read [00-README-orchestration.md](./00-README-orchestration.md) first.** Run
> this only after tasks 01–05 have landed (or as a continuous sweep alongside them).
> This task ships fixes — it is not a read-only review.

## Mission

Make the whole agent-wallet program feel like **one product built by one team**.
Catch every seam, every inconsistent state, every surface that got missed, every
viewer-role leak — and fix them. The bar: a senior engineer and a professional
sniper both use it end-to-end and find nothing half-wired.

## 1. Coverage audit (the user's explicit ask: "everywhere")

Grep for the shared wallet component imports and walk **every** surface where an
avatar/agent renders. Confirm the wallet identity chip + HUD entry point are present
and visually identical for the same agent on:

- Agent detail ([src/agent-detail.js](../../src/agent-detail.js)), character
  ([src/character.js](../../src/character.js)), avatar page
  ([src/avatar-page.js](../../src/avatar-page.js)), marketplace detail
  ([src/marketplace-detail.js](../../src/marketplace-detail.js)), trending
  (driven by [api/trending.js](../../api/trending.js)), galaxy
  ([src/galaxy.js](../../src/galaxy.js)), my-agents/dashboard
  ([src/agent-home.js](../../src/agent-home.js)), launches feed, and every shared
  agent-card.

Any surface showing an avatar **without** its wallet identity is a bug — fix it.

## 2. Consistency pass

- One shared component per concern under `src/shared/` (chip/identity, HUD, vanity
  studio, trade co-pilot). No copy-pasted variants drifting apart. If you find
  duplication, consolidate.
- One violet wallet accent, routed through tokens — no scattered raw hex. One
  address-formatting helper. One USD-formatting helper. One ownership-role resolver.
- Identical loading/empty/error treatments across surfaces.

## 3. Viewer-role correctness (defense in depth)

For owner / visitor / logged-out, verify on every surface:

- Owners see deposit/withdraw/vanity/limits/custody/trade; visitors see
  tip/fork-to-own; logged-out gets sign-in prompts before owner actions.
- Owner-only controls are absent from the DOM for non-owners (not just hidden), and
  the server rejects them regardless (confirm the endpoints enforce
  `user_id === auth.userId`). No client-only gating on anything that moves funds.

## 4. The ownership invariant (verify with a real fork)

Do a real fork end-to-end and assert: the fork has a **new, distinct** Solana + EVM
address; the source agent's wallet is **byte-for-byte untouched**; no secret was
copied; lineage shows on both sides. This is the user's central promise — prove it
holds in the live app, not just in the code.

## 5. Edge-case sweep

0 / 1 / 1000 agents in a list; empty wallet; dust balances; very long agent/token
names; an agent with no EVM wallet; provisioning-in-progress; network failure
mid-withdraw/mid-grind/mid-trade; expired session mid-action; over-spend-limit;
frozen wallet. Each must be designed and honest. Fix every raw error or fake value
you find.

## 6. Performance

No N+1 balance storms in lists (batched/lazy hydration). Polling stops offscreen and
on `visibilitychange`. Heavy modules (QR, charts, trade engine) lazy-loaded. No jank
at 60fps on the galaxy/trending surfaces. Test at 320 / 768 / 1440.

## 7. Real-data audit (zero tolerance)

Grep the whole program's diff for sample arrays, hardcoded balances/addresses,
`setTimeout` fake loading, TODOs, stubs, commented-out code, and any non-$THREE coin
reference. Remove/replace every one with the real implementation. Every number on
screen must trace to a real API call you can see in the Network tab.

## 8. Browser verification

`npm run dev`, exercise the full flow in a real browser as owner and as visitor:
chip → popover → HUD → deposit → withdraw/tip → vanity → fork → trade/snipe. Zero
console errors or warnings from program code. Capture the real API calls succeeding.

## 9. Tests & changelog

`npm test` passes. Add/extend tests for the new shared helpers (role resolver,
formatters, normalizer, batch-balance endpoint) and for the ownership invariant on
fork. Ensure each shipped sub-feature has a real changelog entry; run
`npm run build:pages` to validate.

## Definition of done

Every surface covered, every role correct, every state designed, the ownership
invariant proven live, zero fake data, tests green, browser-verified, changelog
complete. Produce a short written summary of what you audited, what you fixed, and
the verified end-to-end flow.

When done: commit (explicit paths only; push to **both** remotes if asked), then
**delete this file** (`prompts/agent-wallets/06-integration-qa.md`). When 01–06 are
all deleted, delete `00-README-orchestration.md` too — the program is shipped.
