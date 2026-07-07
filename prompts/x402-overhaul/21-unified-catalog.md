# 21 — Unified Service Catalog (one source of truth, two storefronts)

Read `prompts/x402-overhaul/00-CONTEXT.md` first, then `/workspaces/three.ws/CLAUDE.md`.
Independent work order — completes fully on its own. Reads the CURRENT state of endpoints; it
does not require any other prompt to have run.

## Why
x402scan (Base) and OKX.AI (X Layer) are two storefronts over the SAME backend. Right now the
listing metadata is scattered across each endpoint's `BAZAAR` export, the `api/wk.js` discovery
mirrors, and (separately) the OKX catalog. Drift is inevitable and quality suffers. Build ONE
canonical catalog that every storefront reads.

## Build — `api/_lib/service-catalog/`
- A canonical catalog module `api/_lib/service-catalog/index.js` that assembles one array of
  service descriptors from the real endpoints: slug, title, category, agent use-case,
  input/output schema, price (per network), free|paid, endpoint URL, tags, status
  (live|deprecated). Source it from the existing `BAZAAR` exports + the new
  `crypto-catalog`/`3d-catalog` entries (import them; don't duplicate their content).
- Expose helpers: `getCatalog()`, `getByStorefront('x402scan'|'okx')`, `toBazaarDiscovery()`,
  `toOkxCatalog()`. Each storefront renders from these, so a description is written once.
- Refactor `api/wk.js` x402 discovery to derive from `toBazaarDiscovery()` where feasible
  (keep `scripts/verify-x402-discovery.mjs` green — the live 402 must still match).
- **Coordination with the OKX stream:** the OKX work builds `api/_lib/okx-catalog.js`. Do NOT
  edit that file if it exists; instead make `toOkxCatalog()` produce exactly the shape it
  expects and leave a one-line note in PROGRESS.md so the OKX stream can point its module at
  ours. If it doesn't exist yet, ship `toOkxCatalog()` ready for it to consume.

## Correctness
`node scripts/verify-x402-discovery.mjs` green (parity preserved). `npm test` green. Prove no
description drift: a test asserting every live paid route's `BAZAAR` description equals the
catalog's for that slug.

## Tests
Catalog assembly from real endpoints; storefront projections produce valid shapes; discovery
parity; no-drift assertion.

## Definition of done
Inherit 00-CONTEXT DoD + gates. Plus:
- [ ] One canonical catalog live; both storefront projections tested; verify script + `npm test`
      green (paste output).
- [ ] `specs/` entry documenting the catalog contract (it's a load-bearing wire format both
      storefronts depend on) — `specs/service-catalog.md`.
- [ ] `STRUCTURE.md` row; PROGRESS.md note to the OKX stream about `toOkxCatalog()`.
- [ ] `data/changelog.json` (tags: `infra`) — "Unified service catalog powering all agent
      storefronts".
