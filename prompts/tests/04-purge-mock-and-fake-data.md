# 04 — Purge all mock, sample & fake data

**Phase 1. Serial** after [03](03-harden-error-boundaries.md).

## Where you are

`/workspaces/three.ws` — three.ws, 3D AI-agent platform. Read
[CLAUDE.md](../../CLAUDE.md). Rules in play: **No mocks. No fake data. No
fallback sample arrays shipped to production. Real fetch only. Use real APIs,
real endpoints, real data.** The only coin is **$THREE** — and **no third-party
or real mainnet mints in fixtures**; use `$THREE` (CA
`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`) or a clearly-synthetic
placeholder like `THREEsynthetic1111…`.

## Objective

Remove every hardcoded sample array, mock object, and fake-data fallback from
production code paths. Where a UI currently falls back to canned data when a
fetch fails, replace that with a real loading + empty + error state driven by
the real API.

## Why it matters

Fake data is a lie to the user and to yourself. It hides broken integrations,
inflates how finished the product looks, and eventually ships to someone who
makes a decision based on numbers that were never real. A $1B platform shows
real state — including "nothing here yet" — never invented state.

## Instructions

1. **Find candidates:**
   ```bash
   grep -rIn "const sample\|sampleAgents\|sampleData\|mockData\|fakeData\|dummyData\|placeholderData\|DEMO_\|FALLBACK_DATA\|= \[ *{ *id:" --include=*.js src/ public/ api/ | grep -v node_modules
   grep -rIn "// fallback\|// sample\|// demo data\|// mock" --include=*.js src/ public/ | grep -v node_modules
   ```
   Cross-check against `gap-inventory.json` `mockData`.
2. **For each hit, classify:**
   - **Production fallback** (sample array rendered when fetch fails/empty) →
     **delete it.** Replace with: real fetch → designed loading state → designed
     empty state ("nothing here yet, do X") → designed error state. No canned
     rows.
   - **Test fixture / Storybook / example** under `tests/`, `examples/`,
     `*.test.js` → allowed to stay, but scrub any real third-party mint/coin/
     address and replace with `$THREE` CA or a synthetic placeholder.
   - **Seed data** for a real feature (e.g. onboarding defaults) → keep only if
     it is genuinely the product's real default, not a stand-in for a missing
     fetch.
3. **Wire the real source.** If a component used fake data because no endpoint
   existed, the endpoint is the missing work — build it (real API in `api/`,
   real query) and connect it. Do not leave the component dataless.
4. **Empty states are mandatory.** Every list/grid/feed that loses its fake
   fallback must gain a real empty state. Coordinate with
   [18 — state design](18-state-design-sweep.md).
5. **Verify in the browser** (`npm run dev`): each touched surface shows real
   data on success, a real empty state with zero items, and a real error state
   when the API is down (kill the network in devtools to test).

## Definition of done

- [ ] No sample/mock/fake-data array is reachable in any production render path.
- [ ] Every delisted fallback is replaced by real fetch + loading + empty +
      error states, verified in the browser.
- [ ] No real third-party coin/mint/address remains in any fixture; only `$THREE`
      CA or synthetic placeholders.
- [ ] Any endpoint that was missing is now built with real data and wired in.
- [ ] `npm test` passes; `gap-inventory.json` `mockData` updated.
- [ ] Changelog: `improvement` entry if users now see real data where canned
      data used to appear.
