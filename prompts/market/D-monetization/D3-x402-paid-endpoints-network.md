# D3 — The x402 Paid-Endpoint Network & Discovery Indexing

You are a senior engineer + product thinker building **three.ws**. Read `CLAUDE.md`,
`STRUCTURE.md`, and `prompts/production-campaign/00b-the-bar.md` first. **Prerequisites:**
`D1-three-holder-value-system.md` — quotes apply D1's holder discount at price time.

## Why this matters for $1B

x402 is how three.ws gets paid by **other agents** — machine-to-machine USDC settlement with
no signup, no invoice, no human. A network of paid endpoints that are *discoverable* is a
distribution-and-revenue flywheel: an agent in CDP Bazaar finds our endpoint, pays, settles,
and we're indexed as a provider others build on. The platform that other products pay to call
is the one that compounds. But discoverability is brittle — a single newline in a Solana
`payTo` once delisted all 43 of our resources. Every paid endpoint must quote a real price,
settle real USDC, and pass the indexers' own validation, continuously verified. This is
revenue and network effect in one rail.

## Current state (read before you write)

- `api/x402/` — ~28 paid endpoints (`forge.js`, `skill-call.js`, `crypto-intel.js`,
  `vanity.js`, `mint-to-mesh.js`, `tutor.js`, `fact-check.js`, `pay-by-name.js`,
  `my-receipts.js`, …). `api/x402-checkout.js` is the checkout/settlement core.
- `public/x402.js`, `x402-pay-core.js`, `x402-paywall.js`, `x402-discover.js` — the client
  paywall + discovery UI. `public/.well-known`/`api/wk.js` build the catalog.
- **Discovery (from repo memory — read `x402-discovery-indexing.md`):** the catalog is
  published at `/.well-known/x402.json` (built in `api/wk.js`) + `/openapi.json`. Indexers:
  **CDP Bazaar** (catalogs only after a payment SETTLES through the CDP facilitator — EVM/Base,
  not Solana; needs `discoverable:true`; bazaar `info` must validate against its `schema`),
  **x402scan** (Base + Solana; prefers static `/openapi.json`), **402index**
  (`client.register(url)`, all chains, domain-verification = instant).
- **Verifier:** `node scripts/verify-x402-discovery.mjs` (ajv) fetches the live catalog and
  runs the indexers' checks — info-vs-schema, required `accept` fields, `payTo` whitespace,
  Base/Solana coverage, `serviceName` ≤32 ASCII, tags ≤5, `output.example` presence.
- Related scripts already exist: `x402-register-discovery.mjs`, `verify-x402-endpoints.mjs`,
  `x402-paid-sweep.mjs`, `trigger-bazaar.sh`.
- **The gaps (memory's still-open list):** active registration to x402scan + 402index (we're
  passive crawl only); `/openapi.json` covers ~50% of endpoints; most resources lack
  `output.example`; the Solana-first vs CDP-EVM-settlement cataloging tension is unresolved.

## Your mission

### 1. Audit every `api/x402/` endpoint against the paid-endpoint contract
For each endpoint confirm it: (a) returns a real `402 Payment Required` with an `accept` quote
(price in USDC atomics, `payTo`, chain) when unpaid; (b) verifies and **settles** the payment
before doing work; (c) returns a receipt the buyer can reconcile. Fix any endpoint that quotes
but doesn't settle, or settles but doesn't receipt. Apply D1's holder discount to the quoted
price for signed-in holders (a holder pays less to call our paid endpoints — make the discount
real in the `accept` amount, traceable in the receipt).

### 2. Make the catalog pass every indexer's validation, continuously
Bring `/.well-known/x402.json` (via `api/wk.js`) and `/openapi.json` to **100%** coverage of
the live paid endpoints. Every resource: `discoverable:true`, bazaar `info` validating against
its declared `schema`, `payTo` with **zero whitespace/newlines** (the delisting trap),
`serviceName` ≤32 ASCII, ≤5 tags, a real `output.example`, GET=query-params /
POST=`bodyType:"json"`. Run `node scripts/verify-x402-discovery.mjs` until it is fully green —
treat every check it makes as acceptance criteria, not advice.

### 3. Close the `/openapi.json` and `output.example` gaps
Generate the missing half of `/openapi.json` from the same source of truth that builds
`x402.json` (don't maintain two catalogs by hand — derive both). Backfill a realistic, schema-
valid `output.example` on every resource so x402scan and the bazaar render and validate the
endpoint. Examples use only `$THREE` or clearly-synthetic placeholders — **never** a real
non-`$THREE` mint, creator, or holder address.

### 4. Active registration, not just passive crawl
Make `scripts/x402-register-discovery.mjs` a real, idempotent registration to **x402scan**
(`x402scan.com/resources/register`) and **402index** (`client.register(url)`, no auth, domain
verification). It must be safe to re-run (no duplicate listings), report what it registered,
and confirm the listing landed. CDP Bazaar is settlement-triggered — ensure a real settlement
fires through the CDP facilitator so Bazaar catalogs us (the `trigger-bazaar.sh` / paid-sweep
path), and document which endpoints are EVM/Base-settling for that purpose.

### 5. Resolve the Solana-first vs CDP-EVM-settlement tension honestly
Solana is the platform default (repo memory), but CDP Bazaar catalogs on EVM/Base settlement.
Decide per endpoint: expose a Base `accept` option where Bazaar cataloging matters, keep Solana
as the default rail elsewhere, and make the catalog declare both chains where an endpoint
settles on both. The user/agent always sees an honest, settleable quote on whichever chain
they pay. Don't hide the dual-rail — surface it in the paywall (`public/x402-paywall.js`).

### 6. Wire discovery into the product, not just the indexers
The endpoints we publish should also be discoverable **inside** three.ws: surface the paid-
endpoint catalog on a `/x402` or services page (extend `public/x402-discover.js`) so a human or
agent on the platform can browse, see the price, and pay — and so a newly added endpoint shows
up everywhere at once (00-README's "wire surfaces together"). Add a CI/cron guard that runs the
verifier after any catalog change so a regression can't silently delist us again.

## Definition of done

Clears 00b-the-bar.md's monetization bar (x402 paid endpoints "actually charge, actually
settle, actually reconcile") and the trust bar (idempotent settlement, no funds lost, honest
quotes). Inherits the global definition of done in `00-README-orchestration.md`. Specifically:
`verify-x402-discovery.mjs` is fully green; `/.well-known/x402.json` and `/openapi.json` cover
100% of paid endpoints with valid `output.example`s; every endpoint quotes→settles→receipts;
active registration to x402scan + 402index is idempotent and confirmed; the catalog is browsable
in-product; a real paid call (Solana and Base where dual-rail) verified end-to-end.

## Operating rules (override defaults)

No mocks/fake data/placeholders/TODOs/stubs. **`$THREE` is the ONLY coin** — never name,
hardcode, or recommend any other token; `output.example`s use `$THREE` or synthetic
placeholders only (runtime user-launch mints are the sole mechanical exception per CLAUDE.md).
Design tokens only. Stage explicit paths only (never `git add -A`). Own the x402 lane
(`api/x402/*`, `api/wk.js`, the catalog, the verifier + registration scripts); extend
`api/x402-checkout.js` and `public/x402*.js` and consume D1's tier helper — don't rewrite the
settlement core.

## When finished

Self-review (CLAUDE.md's five checks). Ship one improvement (e.g. the in-product services
catalog page, or the CI verifier guard). Append a `data/changelog.json` entry (holder-readable,
tag `feature` or `infra`) if user-visible. Then delete this prompt file
(`prompts/production-campaign/D-monetization/D3-x402-paid-endpoints-network.md`) and report
what you shipped + the verifier's final state + the seam for the next agent (which endpoints
settle on which chains, and the catalog source-of-truth shape).
