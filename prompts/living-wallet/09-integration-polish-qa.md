# Task 09 — Integration, polish & viewer-role QA (run LAST)

> Read [00-README-orchestration.md](./00-README-orchestration.md) in full first. Run
> this **after** tasks 01–08 have landed, or as a continuous sweep alongside them.
> This task **ships fixes** — it is not a read-only review.

## Mission (one line)

Make the entire Living Wallet program feel like **one product built by one team** —
every surface covered, every viewer role airtight, every seam polished — so a senior
engineer and a pro trader both use it end to end and find nothing half-wired.

## 1. Coverage audit — the user's explicit ask: "everywhere"

Grep for the shared wallet/identity component imports and walk **every** surface where
an avatar or agent renders. Confirm the wallet identity + entry point (chip/plate +
HUD) and the relevant Living Wallet features are present and visually identical for the
same agent on, at minimum:

- `src/avatar-page.js`, `src/agent-detail.js`, `src/character.js`,
  `src/marketplace.js` + `src/marketplace-detail.js`, `src/leaderboard.js`,
  `src/collection.js`, `src/characters.js`, `src/launches.js`, `src/launch-detail.js`,
  `src/a-me.js`, `src/agent-home.js`, `src/agent-edit.js`, the dashboards
  (`src/dashboard/dashboard.js`, `src/dashboard-next/pages/*`),
  `src/avatar-gallery-picker.js`, `src/agent-picker.js`,
  worlds (`src/walk.js`, `src/app.js` + `src/play/arena.js`, `src/irl.js`),
  `src/ar-page.js`, `src/avatar-drop.js`, voice (`src/voice/talk-mode.js`,
  `talk-scene.js`), the ERC-8004 surfaces (`src/erc8004/*`),
  `src/pump/homepage-launcher.js`, and every shared agent-card / embed.

**Any surface showing an avatar without its wallet identity is a bug — fix it.**
Produce the definitive surface inventory by grepping the codebase (do not trust a
stale list), and close every gap.

## 2. Consistency pass — one product, not eight features

- **One shared component per concern** under `src/shared/` (identity/plate, HUD/drawer,
  card, badge, co-pilot tool-layer, access helper, feed entry). No copy-pasted
  variants drifting apart — if you find duplication (including any leftover
  `src/agent-wallet/` vs `src/shared/` split, or an orphaned `ownership.js`),
  **consolidate to one** and delete the rest.
- **One** violet wallet accent via tokens (no scattered hex), **one** address
  formatter, **one** SOL/USD formatter, **one** ownership/role resolver, **one** tier
  math (shared with Task 01/05). Route everything through them.
- Identical loading/empty/error/quiet treatments across surfaces.
- The same agent shows the same identity, tier, vanity, and reputation everywhere.

## 3. Viewer-role correctness — defense in depth

For **every** feature in 01–08, verify all three roles on the same agent:
- **Owner** sees full controls; **visitor** sees read-only + Tip + Pay + Fork;
  **logged-out** sees read-only + connect/sign-in prompts.
- No owner-only datum (custody specifics, limits, strategies, private amounts, key
  recovery) is ever rendered, fetched, or inferable for a non-owner — check the
  **network tab**, not just the DOM.
- Confirm every owner-only **server route** re-authorizes ownership and that a forged
  client `is_owner` grants nothing. Spot-check by calling a write route as a non-owner.
- A non-owner can never grind/assign a vanity or run a strategy on an agent they don't
  own — the only path to customize is **Fork** (which mints a fresh wallet). Verify
  the fork → own → vanity/strategy loop works end to end.

## 4. Real-data audit — zero tolerance for fakes

Grep the program's changes for `setTimeout(` fake progress, sample/placeholder arrays,
hardcoded balances/PnL, `TODO`, stubs, `not implemented`, commented-out code, and any
**non-$THREE** token reference (treat a stray mint like a leaked secret). Every number
on screen must trace to a real API/RPC/DB read. Fix every instance.

## 5. Performance & resilience

Worlds with many living avatars stay smooth; feeds/streams don't leak over hours;
heavy 3D/SDK modules are lazy-loaded off the critical path; RPC failures degrade
gracefully everywhere (balance "—", never a broken effect or a fake number);
`prefers-reduced-motion` is honored on every animated surface.

## 6. Ship

- `npm run dev` and exercise the **owner / visitor / logged-out** journeys across the
  surface categories in a real browser; zero console errors/warnings from program code;
  network tab shows real calls. `npm test` passes. (Never run `npm install`.)
- Append a holder-readable `data/changelog.json` entry summarizing the Living Wallet
  program; `npm run build:pages` validates.
- Self-review `git diff` (staged explicit paths only; never `git add -A`); confirm no
  `api/*.js` got clobbered by a bundler (`head -1` check).

## Definition of done

Meets the README DoD, plus: a documented, grep-verified inventory showing the wallet
identity is present on **every** avatar surface; one shared component per concern with
no duplication or orphans; all three viewer roles proven correct in the network tab on
every feature; the fork→own→customize loop verified; a clean real-data audit; smooth,
resilient performance; and the whole thing feels like one product.

## Then: improve, then delete this file

Do a final founder's pass: what one cross-feature connection or polish detail would
make someone screenshot the whole thing? Add it. Update `data/changelog.json`. **Then
delete this prompt file** — and, since this is the last task, remove the now-empty
`prompts/living-wallet/` directory.
</content>

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "prompts/living-wallet/09-integration-polish-qa.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
