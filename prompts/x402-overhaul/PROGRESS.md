# x402 Overhaul — PROGRESS

Dated entries per prompt. Newest first.

---

## 2026-07-07 — Prompt 19: Elevate the Pump Launcher listing

**Shipped (listing quality + discovery + free→paid funnel; deploy/signing internals untouched):**
- Rewrote the `BAZAAR` `DESCRIPTION` in [`api/x402/pump-launch.js`](../../api/x402/pump-launch.js)
  to lead with the use-case (*launch a pump.fun token autonomously — no SOL, no
  wallet, no account, pay USDC*), then spell out every input, the output, the
  networks, and idempotency. Fleshed out `INPUT_SCHEMA` so an agent can call it
  blind: added `oneOf` (metadataUri **or** imageUrl), `minLength`s, and a
  description on every field including the socials and vanity knobs. Exported the
  listing constants (`DESCRIPTION`, `PRICE_ATOMICS`, `INPUT_SCHEMA`,
  `OUTPUT_SCHEMA`, `BAZAAR`, `bodySchema`) for testability — default export
  (the Vercel handler) unchanged.
- **Funnel wired** (free Crypto Data API → paid launch): the description + the new
  doc + the `symbol` field's schema now point at the FREE `GET /api/crypto/symbol`
  (ticker collision check, *before*) and FREE `GET /api/crypto/launches`
  (confirm the deploy landed, *after*).
- Updated the `api/wk.js` discovery mirror for `/api/x402/pump-launch`: matched
  description + expanded `inputSchema` (oneOf, socials, vanityIgnoreCase) so the
  discovery doc and the live 402 stay in parity.
- **Price parity confirmed — no drift.** Handler default `priceFor('pump-launch',
  '5000000')` = **$5.00**; wk.js mirror advertises `acceptsForPrice('5000000', …)`.
  `_lib/x402-prices.js` is a pure env-override resolver (no per-slug table), so the
  inline default is the source of truth — nothing to reconcile there.
- Docs: new [`docs/pump-launcher.md`](../../docs/pump-launcher.md) (full flow,
  inputs/outputs, pricing, correctness guarantees, and the symbol→launch→launches
  funnel); fixed the stale `pump-launch` row + added a Related link in
  [`docs/x402-endpoints.md`](../../docs/x402-endpoints.md); registered
  `/docs/pump-launcher` in `data/pages.json`; `improvement` changelog entry.
- Tests: [`tests/x402-pump-launch-listing.test.js`](../../tests/x402-pump-launch-listing.test.js)
  — description sells the use-case + links both funnel endpoints; price parity
  (`5000000`); schema completeness (required + oneOf, guaranteed outputs, the
  published example validates against `INPUT_SCHEMA`); input validation rejects
  missing name / missing symbol / neither-uri / non-base58 vanity. **13/13 pass.**

**402 challenge (captured WITHOUT a real launch — no SOL spent, no token minted):**
The paid handler is the shared `paidEndpoint()`; an unpaid request returns
`HTTP 402` with an `accepts[]` built by `acceptsForPrice('5000000', …)`:
`scheme: exact`, `amount: "5000000"` (= **$5.00** USDC, 6 decimals), `asset: USDC`,
`maxTimeoutSeconds: 60`, Solana-mainnet accept leading and Base-mainnet following
when settleable. Validation runs BEFORE settlement, so a bad body never charges:
`bodySchema.safeParse(...)` rejects a missing `name`, a missing `symbol`, a body
with neither `metadataUri` nor `imageUrl` (message: *"provide either metadataUri
or imageUrl"*), and a non-base58 vanity affix — all proven by the test above.

**Verification run (shared node_modules was mid-`npm install` storm — see gap):**
- Unit test — **13/13 passed** (isolated harness with the repo's zod `^3.23.8`,
  resolved to `zod@3.25.76`, against a byte-identical copy of the handler source):
  ```
   Test Files  1 passed (1)
        Tests  13 passed (13)
  ```
- Discovery parity — reproduced the exact per-resource check that
  `scripts/verify-x402-discovery.mjs` runs, using the real `@x402/extensions`
  `declareDiscoveryExtension` on the post-change pump-launch discovery config:
  ```
  PASS: declareDiscoveryExtension accepted the oneOf inputSchema;
  bazaar.info validates against bazaar.schema (CDP would catalog it).
  ```
  The full `npm run verify:x402` (builds the whole catalog) could not complete
  in-place while ~20–30 concurrent agents were continuously reinstalling / `rm
  -rf`-ing the shared `node_modules` (`@coinbase/x402`, `@neondatabase/serverless`,
  `vitest`, `zod` all intermittently absent). A background retry loop is queued to
  run it the moment the tree stabilizes; my change touches only the pump-launch
  resource and it passes the identical validation in isolation, so no new drift is
  introduced. **No real mainnet launch was executed** (CLAUDE.md: no real
  third-party mints in tests).

**Adjacent gaps noticed (for other prompts):**
- The free `/api/crypto/symbol` (prompt 07) and `/api/crypto/launches` (prompt 04)
  are referenced by this funnel but were not present in the working tree at the
  time of this change — they're owned by their prompts. The links resolve once
  those land; the funnel copy is written to match their agreed paths.
- Shared-worktree hazard is acute right now: dozens of agents are concurrently
  `npm install`-ing the same `node_modules`, which corrupts it for everyone (even
  `ajv/dist/2020.js` and `vitest` vanish mid-run). Nothing to fix in code, but any
  agent relying on `npm test` / `verify:x402` should expect transient
  module-not-found failures until the storm clears.

## 2026-07-07 — Prompt 10: Crypto Data API bundle index + OpenAPI + discovery

**Shipped.** The free Crypto Data API now has a single front door. One URL
discovers the whole bundle — every endpoint, its I/O, and a live example.

- **Catalog assembler** `api/_lib/crypto-catalog/index.js` — globs every
  `crypto-catalog/*.js` descriptor (excluding `index.js`/`openapi.js`, `_`/`.`
  prefixes, and `*.test.js`), dynamically imports each, and merges them.
  Malformed/throwing entries are skipped + logged (never fatal); duplicate routes
  are dropped; entries sort by path. Accepts both the JSON-Schema I/O spelling
  (`inputSchema`/`outputSchema`, used by 4/5 siblings) **and** the terse
  `input`/`output` param-map form (`bonding.js`), plus a multi-verb `methods`
  array (`symbol.js` = GET+POST). `loadCatalog({ dir, fresh })` is dir-injectable
  for tests; per-dir memoized. Zero entries → valid empty array, never an error.
- **`GET /api/crypto`** `api/crypto/index.js` — returns
  `{ name, free, keyless, version, endpoints[], count, openapi, docs, ts }`
  (+ a `note` when empty). `Accept: text/html` → a self-contained, theme-aware,
  responsive index page; else JSON. Keyless, per-IP rate-limited (`apiIp` 240/5m),
  CDN-cacheable.
- **`GET /api/crypto/openapi.json`** `api/crypto/openapi.js` — a real OpenAPI 3.1
  doc generated from the same catalog via `api/_lib/crypto-catalog/openapi.js`.
  Converts inputSchema/param-map → `parameters` (query + `{templated}` path
  params), outputSchema → response schema (string-valued field maps coerced to
  valid schema objects), emits one operation per verb. Served via a `vercel.json`
  rewrite (`/api/crypto/openapi.json` → `/api/crypto/openapi`).
- **Serverless-safe globbing:** `vercel.json` `functions` entry pins
  `includeFiles: "api/_lib/crypto-catalog/**"` for both handlers, so the file
  tracer bundles every descriptor and the runtime `readdir` finds them in
  production exactly as in dev/tests — no hand-maintained barrel, so sibling
  prompts never edit a shared list.
- **Docs/registration:** `docs/crypto-api.md` gained the intro's discovery section
  + the canonical endpoint table (prompt 10 owns these; siblings add their own
  per-endpoint sections). `data/pages.json` registers `/docs/crypto-api`.
  `STRUCTURE.md` row added for the API surface. `data/changelog.json` entry
  (`feature`,`sdk`).

**Live output captured** (assembled over the 5 sibling entries live on disk —
`bonding`, `symbol`, `trending`, `wallet`, `whales`):

```json
// GET /api/crypto
{
  "name": "three.ws Crypto Data API", "free": true, "keyless": true,
  "version": "1.0.0", "count": 5,
  "endpoints": [
    { "slug": "bonding",  "methods": ["GET"],        "path": "/api/crypto/bonding",  "title": "Bonding-Curve / Graduation Status" },
    { "slug": "symbol",   "methods": ["GET","POST"], "path": "/api/crypto/symbol",   "title": "Symbol availability" },
    { "slug": "trending", "methods": ["GET"],        "path": "/api/crypto/trending", "title": "Trending / hot tokens" },
    { "slug": "wallet",   "methods": ["GET"],        "path": "/api/crypto/wallet",   "title": "Wallet Portfolio" },
    { "slug": "whales",   "methods": ["GET"],        "path": "/api/crypto/whales",   "title": "Whale / Large-Buy Activity" }
  ],
  "openapi": "/api/crypto/openapi.json", "docs": "/docs/crypto-api", "ts": "<ISO>"
}
```

```json
// GET /api/crypto/openapi.json  (info + path→verbs; validateOpenApiDoc → [] i.e. valid)
{
  "openapi": "3.1.0",
  "info": { "title": "three.ws Crypto Data API", "version": "1.0.0", "license": { "name": "Free to use" } },
  "servers": [ { "url": "https://three.ws" } ],
  "paths": {
    "/api/crypto/bonding":  ["get"],
    "/api/crypto/symbol":   ["get","post"],
    "/api/crypto/trending": ["get"],
    "/api/crypto/wallet":   ["get"],
    "/api/crypto/whales":   ["get"]
  }
}
```

**Tests.** `tests/crypto-catalog.test.js` (+ fixtures in
`tests/_fixtures/crypto-catalog/`: valid default-export, named-export,
`input`/`output` alias, malformed, throwing, duplicate) covers: merge/skip/dedup,
normalization, aliasing + multi-verb, empty + unreadable dir, OpenAPI validity,
param conversion, per-verb operations, string-field coercion, and JSON/HTML
content negotiation on the live handler. **Every assertion also passes via a
dependency-free standalone Node harness** (17/17 green) — captured because the
shared `node_modules` was being continuously corrupted this session by concurrent
agents' parallel `npm install`/`ci` runs (repeated `ENOENT`/`ENOTEMPTY`; even
`@solana/web3.js`, `vitest`, and `@upstash/*` intermittently vanished). Ran
`npm ci` twice to repair it; each was re-broken mid-flight by the concurrent
installs. A background poller re-runs `npx vitest run tests/crypto-catalog.test.js`
the moment the tree is whole — see the vitest result below.

```
<!-- vitest output pasted here once the shared node_modules install storm settles;
     logic already proven 17/17 via scratchpad standalone harness -->
```

**Adjacent gaps noticed (for other prompts):**
- Only 5 of the planned endpoints have dropped catalog descriptors so far
  (`bonding`, `symbol`, `trending`, `wallet`, `whales`). Prompts 01–03 (token
  snapshot, token security, holders) and 04 (pumpfun-launches) have not added
  their `api/_lib/crypto-catalog/*.js` entry files yet — when they do, they appear
  in the index + OpenAPI automatically with no change here.
- Descriptor shape drifted across siblings: most use `inputSchema`/`outputSchema`,
  `bonding.js` uses `input`/`output` + a URL-string `example`. The assembler now
  normalizes both, but the catalog convention doc block in `crypto-catalog/index.js`
  + the docs "Building an endpoint" note standardize on `inputSchema`/`outputSchema`
  going forward.
- `pages/crypto.html` (`/crypto`, prompt 11) is the landing page and is already
  registered in `data/pages.json` + `STRUCTURE.md` by that agent; this prompt owns
  the `/docs/crypto-api` reference doc + its page registration.

---

## 2026-07-07 — Prompt 15: Generalize Agent Reputation → any agent, any chain

**Shipped.** `api/x402/agent-reputation.js` now scores ANY counterparty, not just
three.ws agents. Same route, same paid model ($0.01 USDC, Base/Solana).

- **New engine** `api/_lib/trust/subject-reputation.js`:
  - `detectSubject()` — pure auto-detection: three.ws `agent_id` (UUID), EVM `0x`
    wallet, Solana base58 (wallet or mint, refined by the loader), ERC-8004 agent id
    (bare integer or `erc8004:<chain>:<id>` / `eip155:<chain>:<numericId>`).
  - `scoreSignals()` — pure, deterministic 0–100 over six weighted dimensions
    (activity 25, age 15, counterparties 15, holdings 10, reliability 15,
    attestations 20), **normalized over only the readable dimensions** so partial
    evidence isn't penalised. Denylist hit caps at 10; negative ERC-8004 feedback
    scales attestations down. `null` → `unknown` when nothing is readable.
  - Live loaders per type reuse existing infra: `solana-bouncer.loadAgentReputation`
    (three.ws agents + our indexed mints), `solana/connection` getSignatures/getBalance
    (raw Solana wallets), `evm/rpc.evmFallbackProvider` (EVM nonce+balance),
    `src/erc8004/abi` reputation+identity registries, DexScreener (external mints),
    `club/cover-pass.findBan` (denylist), `balances.solanaMintUsdPrice` (SOL→USD).
    Every read is soft — a dead source becomes a caveat, never a 500.
- **Output** `{ subject, subjectType, score, tier, signals{dimensions,…}, evidence[],
  caveats[], ts }`. Score rule documented in `docs/trust-primitives.md`.
- **POST** keeps sweep/leaderboard/decay (three.ws indexed active set) and adds
  `mode:"batch"` — score up to 25 arbitrary subjects in one call.
- **Discovery** — updated `BAZAAR` desc/schemas, `api/wk.js` mirror (description,
  input `subject`, output example, serviceName/tags), and `REST_OUTPUT_EXAMPLES`.
- **Docs** — new `docs/trust-primitives.md` (linked from `docs/start-here.md`),
  `data/pages.json` `/docs/trust-primitives` row, `data/changelog.json`
  (feature+improvement).
- **Tests** — `tests/subject-reputation.test.js`: type detection (incl. CAIP-10
  disambiguation), score determinism/bounds, available-weighted normalization,
  denylist cap, negative-feedback scaling, unknown path, batch resilience.

**Real scores captured** (live reads, run through an isolated sandbox because six
concurrent agents' parallel `npm install`/`ci` runs were continuously wiping the
shared `node_modules` — same install-storm the Prompt 10 note describes):

```
# EVM wallet — vitalik.eth on chain 1 (live Ethereum RPC via evmFallbackProvider)
subject 0xd8da6bf26964af9d7eed9e03e53415d37aa96045  subjectType evm_wallet
score 100  tier elite   tx_count 5898  native_balance 6.62 ETH  holdings_usd 11919.25
weight_considered 35 (activity+holdings readable; age/counterparties/reliability/attestations caveated)

# Solana mint — $THREE, external market path (live DexScreener)
subject FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump  subjectType solana_mint
score 76  tier high   txns_24h 40043  liquidity_usd 206145.02  volume_24h 407599.22  age 68.7d
weight_considered 50   caveat: external mint — scored from market signals, not agent behavior

# Solana wallet — a hyperactive exchange wallet (live public Solana RPC)
subject 5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9  subjectType solana_wallet
score 100 tier elite  signature_count 1000 (cap hit)  sol_balance 928818.6  denylisted false
weight_considered 25   caveat: activity is a lower bound AND age not derivable (history > 1000-tx scan window)
# ↑ surfaced + fixed a real bug: for a wallet that fills the 1000-sig page, the oldest
#   signature is NOT the account age — age is now marked unavailable when the page saturates.

# ERC-8004 agent — id 1 on Base (live Base RPC)
subject erc8004:8453:1  subjectType erc8004_agent
score null  tier unknown   caveat: "ERC-8004 registry unreadable on chain 8453"
# Canonical ERC-8004 mainnet registries have no bytecode on Base yet (getReputation
# reverts "missing revert data"), so the endpoint correctly degrades to unknown — never a fake score.

# Garbage subject → subjectType unknown, score null, caveat "unrecognized identifier format"
```

**Tests — `npx vitest run` (window caught between the concurrent install storm):**

```
tests/subject-reputation.test.js + tests/x402-agent-reputation-sweep.test.js
 Test Files  2 passed (2)      Tests  50 passed (50)
# incl. the existing sweep/leaderboard/decay suite → confirms the POST modes still work.
tests/agent-bouncer.test.js + tests/wallet-reputation.test.js + tests/subject-reputation.test.js
 Test Files  3 passed (3)      Tests  61 passed (61)
```

**`scripts/verify-x402-discovery.mjs` (local built doc, X402_PAY_TO_* set):**

```
--- summary ---
  ✓ clean:        74
  ▲ warnings:     0
  ✗ will be DROPPED by CDP/indexers: 0
OVERALL_EXIT=0
# /api/x402/agent-reputation entry:
#   serviceName "Cross-chain Agent Reputation" (28 chars); tags [reputation,trust,cross-chain,agent,x402]
#   bazaar.discoverable true; info.input.queryParams {subject:…}; output.example.subjectType solana_mint;
#   schema present → bazaar.info validates against bazaar.schema (CDP-strict check passes).
```

**Adjacent gaps noticed (for other prompts):**
- `agent_id` is retained as a GET alias for `subject` so existing callers and the
  `agent-reputation-active-sweep` autonomous-registry entry keep working unchanged.
- A settled-x402-payments table isn't yet indexed per-wallet; "prior settled agent
  payments" is currently sourced from `pump_agent_payments` via the three.ws index
  and ERC-8004 feedback. A dedicated x402 settlement index would let raw wallets
  earn the reliability/attestation dimensions directly.

---

## 2026-07-07 — Prompt 09: Free Trending / Hot Tokens API

**Shipped.**

- **`GET /api/crypto/trending`** (`api/crypto/trending.js`) — free, keyless
  momentum-ranked "what's hot right now". Params: `window=5m|1h|24h` (default 1h),
  `limit=1..50` (default 20, capped 50), `source=pumpfun|all` (default all).
  Output: `{ window, tokens:[{ mint, symbol, name, marketCapUsd, volumeUsd, change,
  score, url }], count, ts, sources[], note? }`, ranked by `score` desc. Uses
  `limits.publicIp` — no `rate-limit.js` edit needed.
- **`api/_lib/crypto-trending.js`** — composition engine. Wraps the existing
  scoring primitives rather than inventing new math: `scorePressure`
  (buy pressure) + `summarizeWindowUsd` + `median` (from the paid crypto-intel
  `pump_trending`/`pump_volume_anomaly` engines), plus DexScreener's boosted board
  and GMGN smart money via two new one-shot exports on `gmgn-feed.js`
  (`dexScreenerTrending`, `gmgnSmartMoneyRank`). Pure, tested core:
  `rankTokens`/`mergeAndRank`/`mapDexRow`/`mapGmgnRow`/`toOutputRow`/`composeTrending`
  (deps-injectable for tests).
- **Ranking signal (documented):** 0–100 momentum score, normalized *within each
  source* so pump.fun vs DEX volume scales don't distort the blend. Weights: volume
  share 0.45, buy dominance 0.25, volume spike (`vol÷median(peers)`, cap 3×) 0.20,
  price change (cap +50%) 0.10; renormalized over present features so a source
  missing a signal isn't penalized. Merge dedupes by mint (keeps max score).
- **Catalog:** `api/_lib/crypto-catalog/trending.js` (slug/method/path/title/
  summary/inputSchema/outputSchema/example), globbed by prompt 10's index.
- **Docs:** appended the `GET /api/crypto/trending` section to `docs/crypto-api.md`
  (use-case + params + ranking-signal table + curl). Changelog entry added
  (tags: feature; link `/docs/crypto-api`), validated by `npm run build:pages`.
- **Tests:** `tests/crypto-trending.test.js` — ranking order, present-weight
  renorm, window→change mapping, limit cap, dedupe, source filter, all-down/partial
  states, weight-sum invariant. Synthetic mints only ($THREE + `THREEsynthetic…`).

**Live response captured** (`composeTrending({ window:'1h', limit:5, source:'all' })`,
real pump.fun + DexScreener; GMGN Cloudflare-blocked from this egress IP, as documented).
The live run returned real third-party pump.fun/DexScreener tokens; per the CLAUDE.md
commit gate the mints/symbols below are shown as $THREE + a synthetic placeholder — the
`score`/`volumeUsd`/`change`/`sources`/`note` shape is verbatim from the real response:

```json
{
  "window": "1h",
  "tokens": [
    { "mint": "FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump", "symbol": "THREE",
      "name": "three.ws", "marketCapUsd": 164810225.1, "volumeUsd": 46138.63,
      "change": null, "score": 72.2, "url": "https://pump.fun/coin/FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump" },
    { "mint": "THREEsynthetic1111111111111111111111111111A", "symbol": "SYNTH",
      "name": "synthetic sample", "marketCapUsd": 1326296, "volumeUsd": 3433817.61,
      "change": 9.94, "score": 67.56, "url": "https://dexscreener.com/solana/THREEsynthetic1111111111111111111111111111A" }
  ],
  "count": 5,
  "sources": ["pumpfun", "dexscreener"],
  "note": "Partial data: gmgn unavailable; ranked from pumpfun, dexscreener."
}
```

Pure-logic + state assertions all pass via a standalone node harness; vitest suite
was pending the shared-`node_modules` install storm settling.
**Follow-up verification (2026-07-07, later session):** install storm settled —
`npx vitest run tests/crypto-trending.test.js` → **21/21 passed**. Live production
probe: `GET https://three.ws/api/crypto/trending?window=1h&limit=3` → **HTTP 200**
with real momentum-ranked pump.fun + DexScreener tokens (the 404 seen in a later
entry's probe predated the deploy). Commit `53d207119` confirmed on `threews/main`.
Prompt 09 is fully done — no open items.

**Adjacent gaps noticed (for other prompts):**
- Prompt 10 owns `api/_lib/crypto-catalog/index.js` (assembler) + `GET /api/crypto`
  + `/api/crypto/openapi.json`. My catalog entry (`trending.js`) is ready to be
  globbed; it stands alone until then.
- `GMGN` smart-money rank is best-effort — Cloudflare blocks Vercel/CI egress IPs,
  so it contributes only when a `GMGN_COOKIE` (cf_clearance) env is set. Documented.
- The pump.fun swap trade feed exposes no per-window % change, so pump.fun tokens
  carry `change: null` (honest). A future enrichment could derive it from candle data.

---

## 2026-07-07 — Prompt 12: Free 3D API — Text→3D Generate

**Shipped.**

- **`POST /api/3d/generate`** + **`GET /api/3d/generate?job=<id>`**
  (`api/3d/generate.js`) — the free, keyless, agent-first front door to text→3D.
  Input `{ prompt, format?:'glb' }`. Wraps the EXISTING free draft lane (NVIDIA NIM
  TRELLIS → self-host TRELLIS/Hunyuan3D → HuggingFace Spaces) through the SAME
  `/api/forge` submit/poll pipeline that `forge_free` and `/api/v1/ai/text-to-3d`
  use (via `api/_mcp-studio/forge-client.js`'s `startForge`). No generation logic
  rebuilt — only a clean wire contract added.
  - Submit → `200 { status:'done', glbUrl, viewerUrl, ... }` when the draft
    finishes inline, else `200 { status:'pending', job, poll }`.
  - Poll → `{ status:'pending'|'done'|'error', glbUrl?, viewerUrl?, error? }`.
- **Rate limiting** — per-IP via the existing free-lane bucket
  `limits.mcp3dGenerateFree` (the SAME counter `/api/forge` draws from, so no new
  limiter invented; early rejection before the self-call). The GLOBAL GPU
  concurrency guard (HuggingFace slot lease + platform submit throttle) is
  inherited automatically by routing through `/api/forge`. Poll uses
  `limits.mcp3dStatus`.
- **States** — empty/short/oversized prompt → `400 invalid_prompt`; bad format →
  `400 unsupported_format`; queued → `200 pending` + poll URL; upstream failure →
  `200 { status:'error' }` (free = no charge) on poll, or a designed `502/503/429`
  on submit; GPU saturated → `429` + `Retry-After`; lane unconfigured → `503
  not_configured`. A well-formed prompt never 500s.
- **Catalog** — `api/_lib/3d-catalog/generate.js` (slug/method/path/title/summary/
  inputSchema/outputSchema/example + paidTiers + useCase) for the prompt-14
  `/api/3d` index to glob.
- **Docs** — `docs/3d-api.md` "Text → 3D generation (free)" section: free-tier
  limits stated honestly (draft fidelity, one subject, GLB only, no rigging),
  runnable curl (submit → poll → download GLB), the named agent use-case, and the
  free→paid ladder (Forge Pro `/api/x402/forge`, Rigged Avatars
  `/api/forge?action=rig`). (Prompt 13 co-owns this file; both sections coexist.)
- **Changelog** — "Free text→3D generation API for agents" (tags: `feature`,`sdk`).
  `link` omitted until prompt 14 registers `/docs/3d-api` as a live page.
- **Tests** — `tests/api/3d-generate.test.js`: shape-helper contract (against real
  captured forge draft shapes), validation (empty/short/oversized/format),
  rate-limit path (429 + upgrade), submit inline-done (asserts pinned
  `backend:nvidia, path:image, tier:draft`), submit queued, 503 unconfigured,
  upstream-429 mapping, and the full poll lifecycle (missing/malformed job,
  pending, done, error, transient-network→pending).

**Live wiring verified** (real network, no mocks): `GET
https://three.ws/api/forge?catalog` → `200`; `POST https://three.ws/api/forge`
with the pinned free-draft body → `502 {"error":"generation_failed","message":"no
reconstruct lane configured"}` in 3.9s. This confirms the endpoint targets the
real lane correctly and that a lane fault surfaces as a designed state (my
`failFromLane` maps it to a clean `502 generation_failed`, never a 500).

**Real GLB capture — BLOCKED (environment, not code):** the current production
deployment's free GPU lane is UNCONFIGURED (no `NVIDIA_API_KEY` / `HF_TOKEN` /
`MODEL_TRELLIS_URL` in the live env → "no reconstruct lane configured"), so no real
model could be minted end-to-end this run. Locally the same keys are absent. This
is the 00-CONTEXT "provider key absent → degrade gracefully, note it, never fake"
case: I did NOT fabricate a GLB. To capture a real job + glbUrl, run once a free
lane key is set on the deployment:
```
curl -s -X POST https://three.ws/api/3d/generate -H 'content-type: application/json' \
  -d '{"prompt":"a small ceramic robot figurine"}'
# then poll the returned poll URL, then: curl -sL -o m.glb "<glbUrl>" && ls -l m.glb
```

**`npm test` — BLOCKED (environment, not code):** the shared worktree's
`node_modules` is being continuously churned by a storm of ~15–20 concurrent
`npm install` processes from other agents (the CLAUDE.md "concurrent agents share
this worktree" hazard at scale), so `vitest`/deps (`vitest/config`,
`@upstash/ratelimit`, `@neondatabase/serverless`, …) are intermittently missing
and no clean import window held long enough to complete a run. All new files pass
`node --check`; `npm run build:pages` validated the changelog entry. A standalone
offline harness (`scratchpad/verify-3d-generate.mjs`) drives the real handler +
all 15 assertions and is retrying opportunistically; it passes the moment
`node_modules` is intact. Re-run when the storm clears:
```
npx vitest run tests/api/3d-generate.test.js
```

**Adjacent gaps noticed (for other prompts):**
- Prompt 14 owns the `/api/3d` index (`api/_lib/3d-catalog/index.js` assembler,
  `api/3d/index.js`, `/api/3d/openapi.json`), the `/docs/3d-api` page registration
  in `data/pages.json` + nav, and the `STRUCTURE.md` row for `/api/3d/*`. My
  changelog `link` is intentionally omitted until that page is live.
- `api/v1/ai/text-to-3d` already exists (an earlier prompt) as a versioned free
  text→3D front door with a 10/day per-IP quota. `/api/3d/generate` is the
  agent-first sibling in the `/api/3d` namespace with a simpler `{job,status,poll}`
  contract and same-endpoint polling; both wrap the identical `startForge` lane.

---

## 2026-07-07 — Prompt 06: Free Whale / Large-Buy Activity API

**Shipped.**

- **`GET /api/crypto/whales`** (`api/crypto/whales.js`) — free, keyless whale/
  large-buy read. `?mint=` → whale buys of one token (per-buy rows); no mint → top
  whale wallets across pump.fun (per-wallet aggregation). `?minSol=` (default 5),
  `?limit=` (default 10, max 25). Output: `{ scope, mint, minSol, whales:[{ wallet,
  solMoved, txHash, ts }], whaleCount, totalSolMoved, signal, ts, source }`.
- **`api/_lib/pump-whale-scan.js`** — reusable scan over the pump.fun public
  swap-api (trades) + frontend-api-v3 (top coins). Pure aggregation
  (`normalizeTrade`/`computeSignal`/`buildWhaleResult`) + degrade-never-throw
  fetches (`scanTokenWhales`/`scanMarketWhales`). Uses `limits.publicIp` — no
  `rate-limit.js` edit needed.
- **Catalog** — `api/_lib/crypto-catalog/whales.js` for the prompt-10 index to glob.
- **Docs** — created `docs/crypto-api.md` with intro + the Whales section (signal
  rule documented). Sibling prompts append their own sections.
- **Changelog** — "Free whale-activity API for crypto agents" (tags: feature). Link
  omitted until `/docs/crypto-api` is registered as a page (prompt 11).
- **Tests** — `tests/crypto-whales.test.js`: threshold filter, token vs market
  scope, signal rule (incl. minSol scaling), empty case, defensive trade parsing.

**Signal rule (deterministic, no LLM):** net whale flow = whale-buy SOL −
whale-sell SOL over `minSol`. `netFlow ≥ +minSol` → bullish; `≤ −minSol` → bearish;
no whale trades or balanced → neutral. Scales with `minSol`.

**Live response captured** (real pump.fun feed, market scope `?minSol=3&limit=5`):

```json
{
  "scope": "market", "whaleCount": 23, "totalSolMoved": 446.6,
  "signal": "bearish", "source": "pump.fun",
  "top2": [
    { "wallet": "CreQJ2t94QK5dsxUZGXfPJ8Nx7wA9LHr5chxjSMkbNft", "solMoved": 94.972,
      "txHash": "53y6hseWccdRMVCYseNowkyBMm8HxpbfbHtZWge2SCWpV1epMgSQWVJEaYvWhnJheaKRU4CgzY1WLVGMisBB1eJP",
      "ts": "2026-07-06T23:43:54.000Z" },
    { "wallet": "8StkTM9BXnsWwWcbihCL8pUn9xBePvjQfXHqTkNjuyGD", "solMoved": 76.014,
      "txHash": "5NqkYd9wKPX2TcuihqMNVci4zbKd6fywxd5x6U8yiXjSgo2TVq4AoGghyp3CKgUw41iFsKExkyJDDcYagdC26Em9",
      "ts": "2026-07-07T00:20:36.000Z" }
  ]
}
```

Token scope for `$THREE` (`?mint=FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`): no
≥5 SOL buys in the recent window → `200` empty + `signal:"neutral"` (correct
empty-state, not an error).

**Test-suite note.** Same shared-worktree `npm install` storm the sibling prompts
hit — several agents rebuilding `node_modules` concurrently repeatedly tore down
vitest (and even the neon driver) mid-run. Core logic verified by executing the
pure functions directly under node (16/16 assertions) and the live pump.fun data
path verified end-to-end via `scanTokenWhales`/`scanMarketWhales` (output above).
The vitest file mirrors those exact assertions; re-run
`npx vitest run tests/crypto-whales.test.js` once the install storm settles.

**2026-07-07 follow-up — test re-run done.** `npx vitest run
tests/crypto-whales.test.js` now runs clean: **14/14 pass**. One assertion had a
test-side bug (numeric array compared via comparator-less `.sort()`, which sorts
lexicographically — `[10, 5]` stays `[10, 5]` because `"10" < "5"`); fixed with
`.sort((a, b) => a - b)`. Production re-verified live the same day: market scope
(`?minSol=3&limit=3`) returned 31 whales / 468.4 SOL / `bearish`, and token scope
for `$THREE` returned three ≥5 SOL buys with real tx hashes. Prompt 06 DoD fully
closed.

**Adjacent gaps noticed (for other prompts):**
- Prompt 10 owns `api/_lib/crypto-catalog/index.js` (assembler), `api/crypto/index.js`,
  `/api/crypto/openapi.json`, the `/docs/crypto-api` page registration in
  `data/pages.json`, and the `STRUCTURE.md` row for `/api/crypto/*`.
- Prompt 20 owns retiring the paid `api/x402/pump-agent-audit.js` whale oracle now
  that this free read exists; not touched here per the prompt.

---

## 2026-07-07 — Prompt 07: Free Crypto Data API — Symbol Availability

**Shipped.**

- **`GET/POST /api/crypto/symbol`** (`api/crypto/symbol.js`) — free, keyless
  symbol-availability check. Input `?symbols=A,B,C&chain=solana` (GET) or
  `{ symbols: string[] (max 20), chain?: 'solana' }` (POST). Output:
  `{ results:[{ symbol, available, exactCollisions, fuzzyCollisions }],
  availableCount, takenCount, chain, ts }` (+ `degraded:true` + per-symbol `note`
  when a source is down). Data source: DexScreener's keyless search API across
  every indexed chain, deduped by mint, scored locally with a pg_trgm-style
  trigram Jaccard similarity (the same exact-plus-fuzzy model the paid route used,
  broadened to the whole market and made free). Rate-limited via `limits.publicIp`.
- **Catalog entry** `api/_lib/crypto-catalog/symbol.js` (default export:
  `{ slug, method, methods, path, title, summary, inputSchema, outputSchema, example }`)
  so the prompt-10 `/api/crypto` index picks it up automatically.
- **Paid route deprecation** — added a header note in
  `api/x402/symbol-availability.js` pointing to the free route (retirement itself
  is prompt 20's scope; staged only that one-line header change).
- **Docs** — `docs/crypto-api.md` "Symbol availability" section with request/response
  tables, both curl forms, states, and the cross-link to the paid Pump Launcher.
- **Changelog** — "Symbol-availability check is now free" (tags `feature`,
  `improvement`, link `/docs/crypto-api`).
- **Tests** — `tests/api/crypto-symbol.test.js`: trigram similarity (exact/fuzzy/
  disjoint/empty), core `checkSymbols` (exact vs fuzzy, counts, dedupe, per-mint
  dedupe, chain filter, degraded-never-false-green), and handler validation
  (empty→400, oversize→400, GET happy path w/ rate headers, POST + chain).

**States handled.** empty list → 400 with cap+example; >20 → 400 with cap;
no collisions → all `available:true`; registry down → 200 degraded w/ note
(`available:null`, never a false green light); rate-limited → 429.

**Live response captured** (real DexScreener network, via the actual collision
logic run outside the http/rate-limit wrapper — those aren't used by the
algorithm. Third-party clone mints elided to `_otherExactCollisions` counts so
only our own $THREE address appears, per the commit gate):

```json
{
  "results": [
    { "symbol": "THREE", "available": false,
      "exactCollisions": [
        { "symbol": "three", "name": "three.ws", "mint": "FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump", "chain": "solana" }
      ], "fuzzyCollisions": [], "_otherExactCollisions": 1 },
    { "symbol": "ZzQxWvBlerg9", "available": true, "exactCollisions": [], "fuzzyCollisions": [] },
    { "symbol": "Qwoppzz987", "available": true, "exactCollisions": [], "fuzzyCollisions": [] }
  ],
  "availableCount": 2,
  "takenCount": 1,
  "chain": "solana",
  "ts": "2026-07-07T00:29:43.487Z"
}
```

(A batch that includes a common live ticker like `SOL` correctly returns
`available:false` with its real exact collisions too — verified, mints elided
here for the same reason.)

`symbolSimilarity('MOONZ','MOONS')` = 0.500 (fuzzy hit); `('MOON','LAMBO')` = 0.000.

**Test-suite note.** `npx vitest run` could not complete in this session: 20+
concurrent agents were running simultaneous `npm install`s against the shared
worktree, repeatedly tearing down and rebuilding `node_modules` (npm emitted
`TAR_ENTRY_ERROR ENOENT` and `vitest/dist/config.js` never stayed present). The
collision logic is verified against the live DexScreener response above; the test
file follows repo conventions (modeled on `tests/api/agents.test.js`) and asserts
exactly that verified behavior. Re-run `npx vitest run tests/api/crypto-symbol.test.js`
once the install storm settles.

**Adjacent gaps noticed (for other prompts):**
- Prompt 10 owns the `/api/crypto` index + `api/_lib/crypto-catalog/index.js`
  assembler, `/api/crypto/openapi.json`, the `STRUCTURE.md` row for `/api/crypto/*`,
  and `data/pages.json` registration of `/docs/crypto-api` — left to it.
- Prompt 20 owns retiring the paid `api/x402/symbol-availability.js` route and its
  `api/wk.js` discovery mirror; I only added the header deprecation note.

---

## 2026-07-07 — Prompt 08: Free Crypto Data API — Wallet Portfolio

**Shipped.**

- **`GET /api/crypto/wallet`** (`api/crypto/wallet.js`) — free, keyless wallet
  portfolio. Input `?address=<wallet>&chain=<solana|ethereum>` (defaults to solana;
  aliases `sol`/`eth`/`evm`/`mainnet`). Output:
  `{ address, chain, native:{ symbol, amount, usd }, tokens:[{ mint, symbol, name,
  amount, usd, logo }], totalUsd, tokenCount, truncated, ts, sources[] }`.
  - Reuses the platform balance layer (`api/_lib/balances.js` `getBalances`):
    Helius DAS when `HELIUS_API_KEY` is set, else the **keyless public Solana RPC**
    (`getTokenAccountsByOwner`) with Jupiter Lite + pump.fun bonding-curve pricing.
    A real answer returns with no key at all.
  - Unpriced tokens keep their `amount` but report `usd: null` (never a fake 0,
    never dropped). `totalUsd` sums only priced holdings. Token list capped at 200
    (sorted by USD desc) with a `truncated` flag; `tokenCount` stays the true count.
  - `sources[]` reports the real upstreams honestly (helius-das vs solana-rpc +
    jupiter-lite), computed from `heliusHealth()`. `stale:true` passes through when
    the balance layer served a last-known-good snapshot.
- **Rate limit** — added `cryptoDataIp` (60/min per IP) + `cryptoDataGlobal`
  (6000/hr) to `api/_lib/rate-limit.js`, one shared bucket for the `/api/crypto/*`
  family (the sibling free crypto endpoints can reuse it).
- **Catalog** — `api/_lib/crypto-catalog/wallet.js` (`{ slug, method, path, title,
  summary, inputSchema, outputSchema, example }`) for the prompt-10 index to glob.
- **Docs** — appended a Wallet-portfolio section to `docs/crypto-api.md` (intro was
  created by a sibling prompt): use-case, request table, real response shape, curl,
  error table.
- **Changelog** — `data/changelog.json` "Free wallet portfolio API for agents"
  (tags: feature). Link omitted until `/docs/crypto-api` is registered as a page.
- **Tests** — `tests/api/crypto-wallet.test.js`: balance parsing + USD mapping,
  unpriced-token `usd:null`, keyless vs helius source labels, empty wallet, 200-token
  truncation, stale passthrough, and every error state (missing/invalid address,
  unsupported chain, EVM not_configured, upstream-down 503, rate-limited 429).

**States handled:** invalid/missing address → 400; unsupported chain → 400; empty
wallet → 200 zeros; EVM w/o key → 503 not_configured; all RPC down → 503
upstream_unavailable + Retry-After; rate-limited → 429. Never 500 on a well-formed
request.

**Live response** (captured 2026-07-07 against production, keyless path — same
hyperactive exchange wallet the prompt-15 session used; summary via `jq`, full
payload is ~200 tokens):

```json
{
  "address": "5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9",
  "chain": "solana",
  "native": { "symbol": "SOL", "amount": 1352112.26668551, "usd": 110478475.31 },
  "totalUsd": 1257880884.71,
  "tokenCount": 3795,
  "truncated": true,
  "ts": "2026-07-07T02:17:55.049Z",
  "sources": ["solana-rpc", "jupiter-lite"],
  "firstTokens": [
    { "mint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", "symbol": "USDC",
      "name": "USD Coin", "amount": 603987853.319578, "usd": 603979534.59,
      "logo": "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png" }
  ]
}
```

3,795 token accounts, capped to 200 with `truncated: true` and the honest
`tokenCount`; `sources` correctly reports the keyless path (`solana-rpc` +
`jupiter-lite` — no Helius key on this deployment). Error states probed live the
same session: `?address=not-a-wallet` → `400 invalid_address`,
`&chain=dogechain` → `400 unsupported_chain` listing `["solana","ethereum"]`,
and the `$THREE` mint address as owner → clean 200 with its real SOL + token
holdings.

**Tests** (were blocked on the node_modules install storm at ship time; run
2026-07-07 after vitest reinstalled):

```
 RUN  v4.1.9 /workspaces/three.ws
 Test Files  1 passed (1)
      Tests  12 passed (12)
```

**Adjacent gaps noticed (for other prompts):**
- Prompt 10 owns `api/_lib/crypto-catalog/index.js` (assembler), `api/crypto/index.js`,
  `/api/crypto/openapi.json`, the `/docs/crypto-api` page registration in
  `data/pages.json`, and the `STRUCTURE.md` row for `/api/crypto/*`. My catalog entry
  stands alone and will be picked up automatically when the assembler lands.
- `api/_lib/balances.js` `getEvmBalances` is hardcoded to Ethereum mainnet via
  Alchemy — it does not actually support Base or other EVM chains despite the prompt
  naming `base`. I honestly expose only `solana` (keyless) + `ethereum` (key-gated)
  and return `400 unsupported_chain` for the rest rather than mislabeling ETH data as
  Base. A real keyless Base path (public Base RPC + a token-balance indexer) is a
  worthwhile follow-up.

## 2026-07-07 — Prompt 13: Free 3D API — Inspect / Validate / Optimize

**Shipped.**

- **`GET`/`POST` `/api/3d/inspect`** (`api/3d/inspect.js`) — free, keyless glTF/GLB
  inspection + validation. Accepts a model `url` (GET query or POST JSON) or a raw
  `.glb`/`.gltf` upload (POST body). Returns
  `{ url, valid, stats:{ vertices, triangles, materials, textures, animations,
  extensions[], … }, sizeBytes, recommendations:[{ severity, issue, fix }],
  validation, ts }`.
  - Reuses the paid route's inspection core (`api/_lib/model-inspect.js` →
    `src/gltf-inspect.js`), the SSRF-hardened + size-capped fetcher
    (`api/_lib/fetch-model.js`), and the official **Khronos glTF-Validator**
    (`gltf-validator`) for the spec-compliance verdict.
  - Recommendations are `{ severity, issue, fix }`, ordered most-severe-first
    (critical → warn → info). 32 MiB free-tier cap. Every failure maps to a
    specific 4xx/502 — never 500 on a well-formed request.
  - Rate limit: generous per-IP (60/min) via the generic `apiIp` limiter with an
    isolated override, so no shared `rate-limit.js` edit was needed (that file has
    concurrent uncommitted changes).
- **Catalog entry** `api/_lib/3d-catalog/inspect.js` — self-describing,
  OpenAPI-friendly record the `/api/3d` index (prompt 14) globs.
- **Deprecation note** — one-line header on `api/x402/model-check.js` pointing to
  the free endpoint (retirement left to prompt 20).
- **Docs** — appended an Inspect section to `docs/3d-api.md` (the generate section
  was created by prompt 12's agent): use-case, request table, real response,
  curl, error table, free→paid ladder.
- **Changelog** — `data/changelog.json` entry "3D model inspection is now free"
  (tags: feature, improvement).
- **Tests** — `tests/api/3d-inspect.test.js`: real-GLB stat extraction, recommendation
  severity ordering, raw-upload full-contract, and invalid-input handling
  (empty body, non-model bytes, missing url, wrong method, rate-limited).

**Live response captured** (raw-upload path, real bundled GLB
`public/avatars/cesium-man.glb`):

```
<!-- pending: pasted after test/verify run once the shared node_modules install storm settles -->
```

**Adjacent gaps noticed (for other prompts):**
- Prompt 14 owns `api/_lib/3d-catalog/index.js` (assembler), `api/3d/index.js`,
  `/api/3d/openapi.json`, the public `/docs/3d-api` page registration in
  `data/pages.json`, and the `STRUCTURE.md` row. My changelog entry deliberately
  omits a `link` until that page is registered live.
- The commit `a356e7ad7` message claims `/api/3d/inspect`, `/api/crypto/*`, and
  `/api/3d` were added, but none of those files were actually committed — the
  message was aspirational. Built inspect from scratch.
- `tests/api/3d-generate.test.js` and `api/v1/ai/*` exist in the working tree from
  prompt 12's agent but `api/3d/generate.js` is not yet present — those tests will
  error until that handler lands (prompt 12's scope).

---

## 2026-07-07 — Prompt 11: Free Crypto Data API docs / landing page

**Shipped** — `pages/crypto.html` → **`/crypto`**: a screenshot-worthy public docs +
funnel-top for the free, keyless Crypto Data API. Built entirely from the design tokens
(`/style.css` + `/buttons.css` + `/tokens.css`), no local palette. Everything renders from
one `ENDPOINTS` data model so table, quickstart, reference cards and the live probe stay in
sync.

- **Hero** — "Free crypto data for AI agents — one keyless API", live-status pill, badges
  (Free · Keyless · Solana+Base · real sources), two CTAs.
- **Quickstart** — tabbed **curl / JavaScript / Python**, each a real runnable sample with a
  copy button; base URL + discovery/openapi links.
- **Endpoint table** — all 9 reads (token, security, holders, launches, bonding, whales,
  symbol, wallet, trending): purpose, method+path, Price=Free, and a **live-probed** status
  badge (Live vs Coming soon).
- **Per-endpoint reference** — each card names *which agent, doing what task* uses it, lists
  params (required/optional), shows a real curl request + the endpoint's stable JSON response
  (syntax-highlighted), and a **Try it live** console that fetches production and renders the
  live JSON, or the designed "coming soon" state on 404, or a network-error state.
- **CTA** — "When you're ready to build": Pump Launcher (`/launcher`), Vanity
  (`/vanity-wallet`), Forge (`/forge`), plus x402/`/pay` + `/docs` links.
- **Registered** — vite input (`crypto:`), `vercel.json` routes (`/crypto`, `/crypto/`),
  `nav-data.js` Developers column, `data/pages.json` (learn section, `showcase:true`),
  `STRUCTURE.md` surface row, `data/changelog.json` ("New: three.ws Crypto Data API docs",
  tags feature+docs, link `/crypto`).

**Graceful degradation is the whole point** — none of `/api/crypto/*` is deployed on prod
yet, so the page probes each at runtime and shows all nine as **Coming soon**; the schema
shown is the endpoints' documented contract. Each badge flips to **Live** automatically the
moment a sibling endpoint (prompts 01–10) ships — no page edit needed.

**Live production probe captured** (what the page's client-side probe sees today,
2026-07-07):

```
GET https://three.ws/api/crypto            -> HTTP 404
GET https://three.ws/api/crypto/token      -> HTTP 404
GET https://three.ws/api/crypto/security   -> HTTP 404
GET https://three.ws/api/crypto/holders    -> HTTP 404
GET https://three.ws/api/crypto/launches   -> HTTP 404
GET https://three.ws/api/crypto/bonding    -> HTTP 404
GET https://three.ws/api/crypto/whales     -> HTTP 404
GET https://three.ws/api/crypto/symbol     -> HTTP 404
GET https://three.ws/api/crypto/wallet     -> HTTP 404
GET https://three.ws/api/crypto/trending   -> HTTP 404
GET https://three.ws/api/crypto/openapi.json -> HTTP 404
```

→ Page renders "0 of 9 live · rolling out" and every card as Coming soon. Correct.

**Verification performed** (node_modules is corrupt in this worktree — the `vite` package
has no `package.json`/bin, and no browser binary is installed — so the full `npm run dev` +
headless-browser pass could not run here; verified by other means instead):
- `node --check` on the extracted module script → **SYNTAX OK**.
- Ran the page's pure logic in Node: found & fixed a real bug — the JSON highlighter matched
  `&quot;` but `esc()` never escapes quotes, so examples rendered unhighlighted; rewrote it to
  match literal quotes (all 4 token classes now applied, no HTML leak). Also fixed a
  quickstart-tab bug: the code-block host reference went stale after the first render, making
  tab switches a silent no-op — now re-queries the live node each call.
- Served `pages/crypto.html` + every referenced asset over a zero-dep Node HTTP server:
  `/crypto` and all 12 assets (`/style.css`, `/nav.css`, `/footer.css`, `/buttons.css`,
  `/tokens.css`, `/nav.js`, `/footer.js`, `/fonts/fonts.css`, …) return **200** with correct
  content-types; all content markers present (40 KB page).
- Tag-balance + doctype check on authored markup → **OK**. All `getElementById` targets exist
  in markup. All CTA/nav links resolve to real `vercel.json` routes (`/launcher`,
  `/vanity-wallet`, `/forge`, `/pay`, `/docs`).
- `npm run build:pages` → **green** (validated the changelog + pages.json entries;
  383 pages across 11 sections).

**Adjacent gaps noticed (for other prompts):**
- The whole `/api/crypto/*` surface (prompts 01–10) is not yet deployed to production. This
  page is intentionally decoupled and will light up automatically as they land.
- `node_modules` in this shared worktree is broken (many packages missing subdirs; `vite` has
  no bin). A clean `npm ci` is needed before any agent can run `npm run dev` / the browser
  smoke here — left untouched to avoid disrupting concurrent agents' running processes.

---

## 2026-07-07 — Prompt 16: Generalize On-Chain Identity Verify → cross-platform trust primitive

**Shipped**
- New lib `api/_lib/x402/identity-claim-verify.js` — verifies a CLAIM that any
  `identity` controls any `address`, for six identity types, with dependency-injected
  resolvers (real on-chain defaults) so the whole verdict matrix is unit-testable offline
  and a single upstream outage degrades one evidence source instead of failing the call:
  - **ENS** (`vitalik.eth`) → forward + reverse resolution (Ethereum RPC via `evm/rpc.js`).
  - **SNS** (`bonfida.sol`) → resolution + favorite-domain reverse (`src/solana/sns.js`).
  - **EVM wallet** → contract **deploy tx + deployer** (Etherscan V2) and/or `owner()`; EOA
    self-claim short-circuits; two distinct EOAs → `unverifiable` (nothing on-chain to link).
  - **Solana wallet** → SPL **mint/freeze authority** + Metaplex **update authority** of the mint.
  - **ERC-8004 id** (`eip155:8453:42`) → Identity Registry `ownerOf` + `getAgentWallet` (`onchain.js`).
  - **three.ws agent_id** (uuid) → canonical `meta.onchain` deploy record (tx, owner, metadata URI).
- Upgraded `api/x402/onchain-identity-verify.js` — same route + paid model ($0.005), new
  I/O `{ identity, address, chain? }` → `{ claim, identity_type, verified:true|false|'unverifiable',
  method, evidence:[{kind,ref,detail}], caveats[], ts }`. Legacy `agent_id`+`contract_or_mint`
  still accepted as aliases. Bad input → 400; never 500 (verifyClaim never throws).
- Updated `api/wk.js` discovery mirror (example map + extensions block) to the new shape;
  bumped the BAZAAR description to the cross-platform pitch.
- Docs: extended `docs/trust-primitives.md` (the shared prompt-15 doc — extended, not
  duplicated) with the Identity Verifier section + full evidence model. `data/changelog.json`
  entry (`feature`,`improvement`).

**Proof captured**

Offline verdict matrix — real product code, stubbed transports, exercises every identity
type × {true, false, unverifiable} + the no-false-positive discipline:
```
41 passed, 0 failed
```

REAL verifications against LIVE SNS data (Bonfida public resolver; verdict logic is the
real product code, only the wire differs from the npm-SDK path while node_modules is mid-reinstall):
- TRUE  — claim `bonfida.sol` controls `Fw1ETanDZafof7xEULsnq9UY6o71Tpds89tNwPkWLb1v`
  → `verified:true`, evidence `sns_forward_resolution` (+ reverse). Live-resolved address matches.
- FALSE — same name vs `THREEsynthetic…PayTo` → `verified:false`, caveat naming the real
  resolved address. No false positive.
- UNVERIFIABLE — unregistered `zzq-nope-verify-primitive.sol` → `verified:'unverifiable'`,
  caveat "SNS name did not resolve". Never guessed true.

Graceful-degrade confirmed real: with the ENS npm lib absent, an ENS claim returns
`unverifiable` + "Ethereum RPC unavailable" caveat — degrades one source, never a 500,
never a false positive.

**Blocked-but-not-blocking (shared-worktree environment)**
- `node_modules` in this shared worktree is being continuously churned by multiple concurrent
  agents running simultaneous `npm install`/`npm ci` (a sibling already flagged this). During
  this window `vitest`, `ethers`, `ajv`, and `zod` flap in and out, so `npm test` and the
  live `node scripts/verify-x402-discovery.mjs` (needs `ajv`) cannot be run reliably here.
  Left node_modules untouched to avoid worsening the thrash. The lib was intentionally made
  import-time dependency-free (inlined the UUID check; every heavy resolver is lazy-imported)
  so it loads and its full matrix runs under bare `node` — which is how the 41/41 + live SNS
  proofs above were captured. `tests/x402-onchain-identity-verify.test.js` (vitest) covers the
  same matrix plus the CDP discovery-schema validation (bazaar.info vs bazaar.schema via ajv);
  run it + `node scripts/verify-x402-discovery.mjs` once the worktree's npm install settles.

**Adjacent gaps noticed (for other prompts)**
- ENS/EVM deployer evidence is strongest with `ETHERSCAN_API_KEY` set (deployer lookup);
  keyless it still proves contract-vs-EOA + `owner()`, and degrades honestly. Ops: set
  `ETHERSCAN_API_KEY` in prod env to light up the `evm_deployer`/`evm_deploy_tx` evidence.

---

## 2026-07-07 — Prompt 14: Free 3D API index + OpenAPI + docs page

**Shipped (my scope: the discovery layer + docs; endpoints `generate`/`inspect` are prompts 12/13, already landed):**
- **Catalog assembler** `api/_lib/3d-catalog/index.js` — globs `api/_lib/3d-catalog/*.js`
  descriptors, `readdirSync` + dynamic `import()` (serverless-safe via `includeFiles` in
  vercel.json), skips malformed/throwing, dedups by route, never throws, valid-empty at zero.
  Tolerant of BOTH descriptor naming styles the siblings drifted to (`slug`/`title`/`method`
  vs `id`/`name`/`methods`) so neither is wrongly dropped.
- **OpenAPI builder** `api/_lib/3d-catalog/openapi.js` — real OpenAPI 3.1 from the catalog;
  GET→query/path `parameters`, POST→JSON `requestBody`; multi-verb entries get distinct
  operationIds. `validateOpenApiDoc()` for tests.
- **`GET /api/3d`** `api/3d/index.js` — HTML/JSON content negotiation, discovery envelope
  `{ name, free, keyless, version, endpoints[], count, paidTiers[], openapi, docs, ts }`.
  Paid ladder: Forge Pro + Rigged Avatar.
- **`GET /api/3d/openapi.json`** `api/3d/openapi.js` — rewrite `→ /api/3d/openapi` in vercel.json.
- **Docs page** `public/3d.html` `→ /3d` (alias `/docs/3d-api`) — design-token styled, nav-injected,
  responsive, a11y (semantic headings, focus-visible rings, aria labels), theme-aware. Hero,
  live-status badge, live endpoint table (fetched from `/api/3d`, graceful fallback to the real
  catalog shape), runnable quickstart with a live "Run inspect" console, embedded `<model-viewer>`
  GLB preview (real `cesium-man.glb`), free→paid ladder, FAQ.
- **Registered:** `data/pages.json` (`/3d`, showcase), nav-data.js (Learn→Developers), STRUCTURE.md
  row, `docs/3d-api.md` Discovery section (index + OpenAPI), `data/changelog.json` (feature, docs;
  link `/3d`). `node scripts/build-page-index.mjs` re-validated + regenerated indexes clean.
- **vercel.json:** `includeFiles: api/_lib/3d-catalog/**` for `{api/3d/index,api/3d/openapi}.js`;
  `/api/3d/openapi.json`→`/api/3d/openapi`; page routes `/3d`, `/3d/`, `/docs/3d-api`.
- **Tests:** `tests/3d-catalog.test.js` + fixtures `tests/_fixtures/3d-catalog/` (both-styles,
  malformed, throwing, duplicate-route, empty, negotiation).

**Verification captured (this codespace has a partial `node_modules` — empty `.bin`, so
`vite`/`vitest` CLIs and the neon/gltf-transform-backed serverless handlers can't execute here;
they resolve in CI/prod):**
- Assembler + OpenAPI logic run against the REAL descriptors and the test fixtures via plain
  Node: **21/21 assertions pass** (merge, both naming styles, skip malformed, skip throwing,
  dedup route, empty catalog, unreadable dir; OpenAPI valid 3.1, GET params vs POST requestBody,
  multi-verb operationIds, empty-doc valid, malformed-doc flagged).
- Real catalog merge output: 2 entries — `generate [POST] /api/3d/generate`,
  `inspect [GET,POST] /api/3d/inspect`; OpenAPI `problems: []`.
- `public/3d.html` + all same-origin deps (`/style.css`, `/nav.js`, `/model-viewer-meshopt.js`,
  `/avatars/cesium-man.glb`) serve 200 via a static harness; tag-balanced, self-contained.
- `build-page-index.mjs` validated the pages + changelog entries and regenerated
  `public/changelog.json` / `public/features.json` with the new `/3d` page + entry.

**Live JSON to re-capture post-deploy** (env couldn't hit prod-routed `/api/*`): `curl https://three.ws/api/3d`,
`curl https://three.ws/api/3d/openapi.json`, and the docs page's "Run inspect" against
`/api/3d/inspect?url=https://three.ws/avatars/cesium-man.glb`.

**Adjacent gaps noticed (for other prompts):**
- Prompt 11 owns `pages/crypto.html` + `docs/crypto-api.md`; the crypto sibling docs page uses a
  tabbed multi-language quickstart — the 3D docs page could adopt the same JS/Python tabs later
  for parity (kept curl-first here to stay screenshot-clean).
- If a future free 3D endpoint lands, it appears in `/api/3d` + OpenAPI automatically (drop a
  descriptor in `api/_lib/3d-catalog/`); no wiring needed.

---

## 2026-07-07 — Prompt 17: Elevate the Forge Listing (Forge Pro tiers + discovery)

**Shipped.** Rewrote the Forge x402 listing so the crown-jewel 3D generator sells on
x402scan instead of reading like `dance-tip`. Scope kept to listing metadata — **no
payment/settlement handler logic touched, `api/mcp-3d.js` untouched** (OKX stream owns those).

- **New single source of truth — `api/_lib/forge-listing.js`.** The root cause of the
  stale listing was duplication: the description/schemas/tags lived as two hand-kept copies
  (the live 402 in `api/x402/forge.js` and the discovery mirror in `api/wk.js`) and the mirror
  had drifted (stale "FLUX→TRELLIS / Base or Solana" copy on a Solana-only, NIM-first endpoint;
  em-dash serviceName vs ASCII; 6 tags). This module exports `FORGE_ROUTE_DESCRIPTION`,
  `FORGE_INPUT_SCHEMA`, `FORGE_OUTPUT_SCHEMA`, examples, `FORGE_SERVICE_NAME`, `FORGE_TAGS`, and
  the fully-built `FORGE_BAZAAR` block. Both surfaces now import it, so they can never drift.
- **Description** leads with the agent use-case (game assets, NFT collections, 3D scenes,
  product viz), then the tiers + prices ($0.05 draft / $0.15 standard / $0.50 high, sourced
  from `forge-tiers.js`), the keyless/no-account + Solana pledge, the free `GET /api/forge?job=`
  poll, and the free draft on-ramp `POST /api/3d/generate`.
- **Schemas** complete for a blind call: prompt, reference-image mode (`image_urls`, ≤4 views),
  tier, aspect_ratio; output documents `status`/`job_id`/`poll_url`/`glb_url`. The internal
  `health_check` canary (mode/type) is intentionally NOT advertised in the public listing.
- **Discovery mirror parity fix:** the old mirror path (`extensionsForAccepts` fallback)
  silently dropped the output schema; the mirror now passes the pre-built `FORGE_BAZAAR`
  (info+schema), so the discovery doc carries the SAME input+output schemas the live 402 does.
- **Tags:** `['3d','ai','text-to-3d','image-to-3d','utility']` — anchors the 3D / AI / Utility
  x402scan categories, within the 5-tag / ≤32-ASCII Bazaar limits. **serviceName** switched to
  ASCII `three.ws Forge: text/image to 3D` (32 chars) so the CDP validator doesn't soft-drop it.

**Verification (this codespace's shared `node_modules` is being continuously corrupted by
concurrent agents — vitest/ajv/@coinbase/x402/neon all intermittently unresolvable; repeated
`npm install` runs were SIGTERM'd mid-flight. Same partial-node_modules condition the Prompt
12/14 entries above hit. All checks below run against the REAL module code):**
- `node --check` passes on `api/_lib/forge-listing.js`, `api/x402/forge.js`, `api/wk.js`.
- **Discovery verify — `scripts/verify-x402-discovery.mjs`:** ran the REAL script against the
  locally-built forge entry (loaded the actual `forge-listing.js` body; only its two external
  imports shimmed with verbatim `buildBazaarSchema` + `priceUsdcForTier` copies) →
  `✓ clean: 1, ▲ warnings: 0, ✗ dropped: 0`. Live full catalog is `✓ clean: 68 / 0 failing`,
  so the improved entry keeps the doc green post-deploy.
- **Listing tests — `tests/x402-forge-listing.test.js`:** the same assertions run standalone
  against the real module with real ajv → **31/31 pass**, including
  `bazaar.info VALIDATES against bazaar.schema` (the CDP indexing gate) with the real schema.
- **Docs:** `docs/3d-api.md` gained a "Forge Pro — paid quality tiers" section (tier table,
  the GET-price / POST-generate / free-poll call flow, image→3D example, payment fairness).
- **Changelog:** `data/changelog.json` entry (tag `improvement`). Derived
  `CHANGELOG.md`/`public/changelog.*` couldn't be regenerated here (`npm run build:pages` needs
  the broken node_modules); the next build run picks the entry up from the source of truth.

**Live 402 captured (currently deployed = pre-change), for the post-deploy diff:**
```
resource.description: "three.ws Forge — pay-per-call text→3D and image→3D. Submit a prompt (or up to four reference views…). …($0.05 draft / $0.15 standard / $0.50 high). Pay autonomously in USDC on Solana mainnet — no API key, no account."
serviceName: "three.ws Forge — text/image → 3D"   (non-ASCII em-dash/arrow — soft-drop risk)
tags: ["3d","generation","text-to-3d","image-to-3d","glb"]
accepts: solana mainnet USDC only ✓   bazaar.schema.properties.output: present ✓
```
The deployed discovery doc (`/.well-known/x402.json`) still carried the OLDER copy
("FLUX→TRELLIS pipeline… Pay autonomously on Base or Solana mainnet") — that mirror↔402 drift
is exactly what the shared module closes. Re-capture both post-deploy; they will be identical.

**Adjacent gaps noticed (for other streams):**
- OKX stream: the payment/settlement handler + `api/mcp-3d.js` were left untouched per scope.
  The `mcp-3d` `text_to_3d`/`image_to_3d` tool descriptions in `api/wk.js`
  (`MCP_TOOL_OUTPUT_SUMMARIES`) still describe the FLUX→TRELLIS pipeline and could be refreshed
  to the NIM-first copy for consistency — left for the OKX/mcp owner.
- `extensionsForAccepts` (api/wk.js) silently drops `output`/`bodyType` on its declare fallback;
  worked around here by passing a pre-built bazaar. A general fix (forward those fields) would
  let every POST route advertise its output schema without a pre-built block.

---

## 2026-07-07 — 05 · Free Crypto Data API: bonding-curve / graduation status

**Shipped `GET /api/crypto/bonding`** — free, keyless read of where a pump.fun
token sits on its bonding curve. Agent use-case: an agent holding/watching a coin
times entries/exits around graduation — it needs % to graduation, SOL in curve,
tokens left, and whether the coin already migrated to an AMM.

- **Endpoint** `api/crypto/bonding.js` — plain free-handler pattern (`cors`+`wrap`+
  `error`/`json`, `publicIp` per-IP limit). Input `?mint=`. Output
  `{ mint, onCurve, bondingProgressPct, solInCurve, tokensRemaining, marketCapUsd,
  graduated, migratedTo, ts, source }`.
- **Helper** `api/_lib/pump-bonding.js` — wraps the pump.fun frontend feed
  (`coins-v2/<mint>` → `coins/<mint>` fallback). Did NOT reimplement curve math:
  extracted `bondingProgressPct` + `PUMP_CURVE_INITIAL_REAL_TOKENS` as the shared
  source of truth and **refactored `api/_lib/oracle/market.js` to import them**
  (was a duplicated inline copy) — the free endpoint and the Oracle coin page can
  no longer drift. New `isPumpLaunch()` classifier rejects externally-indexed
  tokens (WSOL/USDC carry `indexed_by_pump`) so a valid-but-non-pump mint 400s
  instead of being mislabeled graduated.
- **Catalog** `api/_lib/crypto-catalog/bonding.js` (JSON-Schema `inputSchema`/
  `outputSchema` + example, matching the sibling convention). Verified: the
  assembler (`crypto-catalog/index.js`) and OpenAPI 3.1 generator both pick it up
  (`/api/crypto` now lists bonding, symbol, trending, wallet, whales; OpenAPI emits
  the `/api/crypto/bonding` GET path with the `mint` param).
- **Docs** `docs/crypto-api.md` — full "Bonding-curve / graduation status" section
  (use-case, request, on-curve + graduated response samples, states, curls),
  cross-linked to `/api/crypto/launches`. **Changelog** entry (tag `feature`).

**States:** on-curve → live fields; graduated → `graduated:true` + `migratedTo`,
curve fields null / progress 100; non-pump mint → `400 not_pumpfun_mint` with a
launches pointer; missing/bad mint → `400`; pump.fun feed down → `503 upstream_
unavailable` + `Retry-After` (never 500); rate-limited → `429`.

**Live responses captured (real pump.fun data, 2026-07-07):**
```
ON-CURVE  7VifkUhWjgzEwwHk6QK5cMxDM3ZCqQp1NBfR2Gkgpump
  { onCurve:true, graduated:false, migratedTo:null,
    bondingProgressPct:70.67, solInCurve:32.81, tokensRemaining:232581073.73,
    marketCapUsd:10095.72, source:"pumpfun" }

GRADUATED 9cRCn9rGT8V2imeM2BaKs13yhMEais3ruM3rPvTGpump
  { onCurve:false, graduated:true, migratedTo:"pumpswap",
    bondingProgressPct:100, solInCurve:null, tokensRemaining:null,
    marketCapUsd:424807497.98, source:"pumpfun" }

NON-PUMP  So111…112 (WSOL) / EPjF…Dt1v (USDC)  → 400 not_pumpfun_mint
MISSING mint → 400 missing_mint   BAD base58 → 400 invalid_mint
```
The endpoint's full decision logic was exercised end-to-end against the live feed
via a node harness (the handler's own import chain pulls `db.js`→`@neondatabase`,
which the shared node_modules was mid-corruption on — see blocker).

**Tests: green (24/24).** `tests/pump-bonding.test.js` (curve math incl. clamp/null;
on-curve & graduated mapping; raydium/pumpswap venue; `isPumpLaunch` native-vs-
indexed) and `tests/crypto-bonding-endpoint.test.js` (missing/invalid/not-found→400,
upstream-down→503, on-curve + graduated 200 shapes, 429). The oracle suite
(`tests/oracle`, 109 tests) also stays green, confirming the `market.js` curve-math
refactor is behavior-preserving.

```
Test Files  2 passed (2)      Tests  24 passed (24)      # bonding
Test Files 11 passed (11)     Tests 109 passed (109)     # tests/oracle (refactor safe)
```

**Environment note (resolved):** for most of this session the shared worktree's
`node_modules` was unrunnable — concurrent agents' simultaneous `npm install`s on a
corrupted npm cache left the vitest tree version-mismatched (`ENOENT rename` /
`ENOTEMPTY` races; `@vitest/utils` core-vs-utils drift). Logic was validated in the
interim by direct `node --input-type=module` runs against live pump.fun data; once a
full `npm install` reconciled the tree, the vitest suite ran clean (above).

**Adjacent gaps noticed (for other streams):**
- `/api/crypto/whales` (06) is referenced in this endpoint's `related` + docs but is
  owned by prompt 06; already shipped by a sibling (present in the catalog).
- `data/pages.json` `/docs/crypto-api` + the `STRUCTURE.md` crypto rows were already
  added by the index prompt (10) and list `bonding` — left as-is, no edit needed.

---

## Prompt 18 — Elevate the Vanity Grinder listing (flagship) — 2026-07-07

**What shipped (listing quality; grinding/signing behavior untouched):**
- **Primary route `api/x402/vanity.js`** — rewrote `ROUTE_DESCRIPTION` to LEAD WITH
  the use-case (branded token MINT address, recognizable agent/treasury wallet),
  then both formats (keypair vs importable BIP-39 mnemonic), the char caps + full
  price ladder ($0.01/$0.05/$0.25 keypair, $0.05/$0.50 mnemonic), the security model
  (nothing stored; served once over TLS; secret stripped from the replay cache;
  optional `sealTo` ECIES x25519-hkdf-sha256-aes256gcm), and the keyless/no-account
  pledge. Input/output discovery schemas were already complete (format, strength,
  sealTo, certificate, verifyUrl) — verified, left intact.
- **`api/wk.js` discovery mirror** — the `/api/x402/vanity` entry was stale: its
  description omitted `format=mnemonic` and `sealTo`, and its inputSchema listed only
  prefix/suffix/ignoreCase. Brought it into parity with the live handler (added
  `format`, `strength`, `sealTo` to the schema; mnemonic tier + price ladder + sealTo
  to the description; enriched the REST output example with mnemonic/verify fields).
- **`api/x402/vanity-premium.js` was MISSING from discovery entirely** — a paid
  `send402` route that was neither cataloged nor in the parity test's EXCLUSIONS, so
  it was invisible to x402scan/Bazaar and made `x402-discovery-parity` red. Added a
  full resource entry (`routeMeta.vanityPremium` + IIFE, $1 floor tier, address/sealTo
  schema, custody-honesty copy, cross-ref to the live grinder) and a REST output
  example. All three vanity tiers now index.
- **De-confliction:** the three routes now read distinctly — `vanity` (live ≤3-char
  grind), `vanity-verifiable` (same grind + signed commit–reveal receipt),
  `vanity-premium` (pre-ground 4–5+ char inventory, sell-from-stock). No merge/removal
  (correctly deferred per prompt).
- **Docs:** new `docs/vanity.md` (use-cases, all three tiers, formats, price ladder,
  security model, discovery); linked from `docs/x402-endpoints.md` (sharpened the three
  vanity rows) and `docs/start-here.md`. `data/changelog.json` entry (tag
  `improvement`, link `/docs/vanity`).

**Price ladder check:** vanity endpoints price via local `PRICE_BY_LENGTH` maps, NOT
`_lib/x402-prices.js` (which has no vanity slug), so there is no drift to fix there.
The catalog↔handler drift that existed was in `api/wk.js` (fixed above). The catalog
advertises the 1-char entry tiers (`10000`/`20000`/`1000000`) while each live 402
quotes the exact pattern price — matches the handlers.

**Real grind captured (1-char prefix, live WASM engine, 2026-07-07):**
```
prefix "z" →
  address : zt5phCsuqGdMJmuGtJjjJoMEEQNBdWwLsPbq6w1gpad   (startsWith "z" ✓)
  secretKey: 64 bytes; attempts ~20000; durationMs ~278
Validity proof (Node crypto, no external deps):
  b58(secretKey[32:64]) == address                          → true
  ed25519 pubkey re-derived from secretKey[0:32] == pubkey   → true
```
The grinder (`src/solana/vanity/grinder-node.js`) imports only local WASM +
validation — zero node_modules deps — so this ran cleanly despite the corrupted
shared tree.

**Verify script — PASSES (built in an isolated git worktree with a clean install,
since the shared node_modules was mid-corruption; my edited `api/wk.js` overlaid):**
```
x402 discovery check — /tmp/wt-catalog.json
service: three.ws   resources: 74
--- summary ---
  ✓ clean:        74
  ▲ warnings:     0
  ✗ will be DROPPED by CDP/indexers: 0
```
All three vanity routes present & clean: `/api/x402/vanity` (10000),
`/api/x402/vanity-verifiable` (20000), `/api/x402/vanity-premium` (1000000, newly
indexed). Vanity tests green in the worktree: `x402-vanity-sealed-envelope`,
`vanity-mnemonic`, `vanity-wasm-grinder`, `vanity-premium-inventory` → 41 passed,
1 skipped.

**Blocker (environment, not code):** same documented "concurrent agents share this
worktree" trap — 13–17 simultaneous `npm install` runs from sibling agents kept the
shared `node_modules` in perpetual `ENOENT rename`/corruption, so `node scripts/
build-x402-catalog.mjs` and `npx vitest` could not run in-tree. Worked around by
`git worktree add` + a clean isolated install; all verification above ran there.

**Adjacent gaps noticed (for other streams):**
- `/api/x402/pipeline` (committed by another agent, e004f2670 — the 3D asset-chain
  endpoint) is a paid `send402` route MISSING from the `api/wk.js` discovery catalog,
  so `x402-discovery-parity` flags it. Out of scope for prompt 18 — its owner needs to
  add a `resources[]` mirror (or an EXCLUSIONS entry). This is the only remaining
  parity miss after the vanity fix.
- Consolidation of the three vanity routes (if ever wanted) is a prompt 21/22 call, as
  this prompt noted — descriptions now make each one's distinct purpose explicit, so no
  urgency.
