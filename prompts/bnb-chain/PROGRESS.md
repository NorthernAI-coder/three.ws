# BNB Chain Campaign — Progress Log

Append-only. Each completing agent adds a dated entry: prompt #, what shipped, real proof
(tx hashes, block numbers, JSON responses), gaps noticed for other prompts.

---

## 2026-07-07 — Campaign created

Research basis: 101-agent deep-research run + bnb-chain org repo dig (verified facts and
refuted claims recorded in `00-CONTEXT.md`). Owner approved all three tracks. No prompt
executed yet.

---

## 2026-07-08 — Prompt 01: BNB chain constants + RPC failover lib — SHIPPED, verified live

**Outcome: `api/_lib/bnb/chains.js` done and proven.** Built by a concurrent agent sharing
this worktree; independently re-verified line-by-line against `00-CONTEXT.md` and the spec
rather than trusted as-is (untracked, not yet committed).

- `BNB_CHAINS.bscMainnet.greenfieldHubs` — all six hub addresses (crossChain, tokenHub,
  bucketHub, objectHub, groupHub, multiMessage) match `00-CONTEXT.md` verbatim.
  `bscMainnet.id=56` (5 public RPCs), `bscTestnet.id=97` (4 public RPCs, default network).
- `getPublicClient(network, opts)` — viem `fallback()` transport (deterministic order,
  `rank:false`), 5s per-RPC timeout, cached per network. Accepts numeric ids and string
  aliases (`'bsc'`/`'mainnet'`/`'testnet'`) beyond the spec's literal names — ergonomic
  superset, not a deviation.
- `probeBlockTime(network, sampleBlocks=200)` — `{network, avgBlockTimeMs, latestBlock,
  sampleBlocks, target, measuredAt}`; throws typed `BnbRpcError{tried:[...]}` on total
  failure. `isEvmAddress`/`assertBscAddress` reuse viem's `isAddress`/`getAddress`.
- **Tests:** `tests/bnb-chains.test.js` — 12 passed + 1 skipped (BNB_LIVE_RPC-gated) by
  default; with `BNB_LIVE_RPC=1` → **13/13 passed**, live smoke test asserted
  `avgBlockTimeMs < 700ms` for real.

**Live proof the 0.45s block-time claim holds today** (real public RPC, not mocked):
```json
{ "network": "bscMainnet", "avgBlockTimeMs": 450, "latestBlock": 108693266,
  "sampleBlocks": 200, "target": 450, "measuredAt": "2026-07-08T00:39:03.963Z" }
```

**Status: DONE.** Every other BNB prompt can now import this lib. Not yet committed —
still untracked in the shared worktree pending an explicit commit pass.

---

## 2026-07-08 — Prompt 08: Encrypted-GLB envelope + vault manifest spec — SHIPPED

**Outcome: `api/_lib/bnb/vault-crypto.js` + `specs/vault-manifest.md` done and proven.**
Standalone (Prereqs: none), no file overlap with prompts 01/02.

- `encryptGlb`/`decryptGlb` — AES-256-GCM via Node's built-in `crypto` (OpenSSL-backed),
  random 32-byte content key + 12-byte IV per object, 16-byte GCM auth tag, plaintext
  sha256 computed and verifiable via `decryptGlb(env, {expectedSha256})`.
- `wrapKey`/`unwrapKey` — ECIES over secp256k1 (ephemeral ECDH → HKDF-SHA256 → AES-256-GCM),
  built directly on `@noble/curves` + `@noble/hashes` — **already-installed, already-pinned
  workspace dependencies** (`package.json`: `@noble/curves ^2.2.0`, `@noble/hashes ^1.8.0`).
  Deliberately did **not** add `eciesjs`: it depends on the same two `@noble/*` packages
  internally (confirmed via `npm view eciesjs` — `@noble/curves ^1.9.7`, `@noble/hashes
  ^1.8.0`), and its curves major (1.x) conflicts with our installed 2.x, so adding it would
  install a second, older copy of the exact library already in the tree — the opposite of
  CLAUDE.md's "check existing workspace dependencies first / never add a duplicate" rule.
  `package.json` is also mid-edit by other concurrent agents right now (`git status` showed
  it modified before I started), so avoiding any `npm install` sidesteps that shared-file
  hazard entirely. No hand-rolled crypto primitives — only the standard ECIES
  *composition* (ECDH + HKDF + AEAD) is original code, same construction `eciesjs`/
  `eth-crypto` use.
- Typed `VaultCryptoError{code}` for every failure path (`bad_input`, `bad_length`,
  `bad_public_key`, `bad_ecdh_input`, `auth_failed`, `sha256_mismatch`) — tampered
  ciphertext/tag or wrong unwrap key always throws, never returns garbage plaintext.
- `specs/vault-manifest.md` — full wire contract: manifest JSON schema
  (`version/glbObjectRef/encryption/sha256/priceAtomic/sellerAddress/contract/createdAt`),
  byte layout (ciphertext stored as a header-free blob, manifest as a sibling JSON file),
  key-delivery flow (seller encrypts+uploads → buyer pays on-chain (prompt 10) → unlock
  service (prompt 11) wraps the content key to the buyer's pubkey → buyer unwraps+decrypts),
  typed error → HTTP status mapping, and a portability note confirming nothing here imports
  a Greenfield SDK or assumes its async settlement model (hedges the platform-risk in
  00-CONTEXT).
- **Tests:** `tests/bnb-vault-crypto.test.js` — 14/14 passed. Round trip against a tiny but
  structurally valid synthetic GLB fixture (real glTF binary magic + minimal JSON chunk,
  built inline in the test, no external fixture file needed). Covers: byte-identical
  round trip + sha256 match, empty-input rejection, ciphertext-byte tamper → typed
  `auth_failed`, auth-tag tamper → typed error, wrong-size key/IV rejected pre-cipher,
  `expectedSha256` mismatch caught post-GCM-success, ECIES round trip with a real
  secp256k1 keypair, uncompressed (65-byte) pubkey accepted, wrap non-determinism
  (different ephemeral key/ciphertext every call), wrong-private-key unwrap → typed
  `auth_failed`, malformed pubkey rejected, and a full encrypt→wrap→hex-wire→unwrap→decrypt
  pipeline simulation.

  Command: `npx vitest run tests/bnb-vault-crypto.test.js` → `Test Files 1 passed (1)`,
  `Tests 14 passed (14)`.

**Real round-trip proof** (88-byte synthetic GLB — glTF binary header + minimal JSON chunk):
- Plaintext sha256: `3973610786a91c775bae59677a8020251bd31bebd284fa897ca97a8a24e20e71`
- `encryptGlb` → `contentKey` (32B), `iv` (12B), `authTag` (16B), 88-byte ciphertext;
  `sha256OfPlaintext` matches the value above exactly.
- Fresh secp256k1 buyer keypair generated via `generateVaultKeypair()`.
- `wrapKey(contentKey, buyer.publicKey)` → 33-byte compressed `ephemeralPublicKey` +
  wrapped-key ciphertext/iv/authTag.
- `unwrapKey(wrapped, buyer.privateKey)` → recovered content key byte-equal to the
  original (`true`).
- `decryptGlb({...}, {expectedSha256})` → plaintext byte-equal to the original 88-byte
  GLB (`true`); post-decrypt sha256 re-check passes (`true`).

**Status: DONE.** No blockers. `specs/vault-manifest.md` is ready for prompts 09
(upload), 10 (contract), and 11 (unlock) to build against as-is.

---

## 2026-07-08 — Prompt 02: MegaFuel gasless-send client — SHIPPED, committed `c61c96452`

**Outcome: `api/_lib/bnb/megafuel.js` + `tests/bnb-megafuel.test.js` done and proven.**
Prereq `api/_lib/bnb/chains.js` (prompt 01) confirmed committed at `92bab1faf` before this
prompt started — the "not yet committed" note in the prompt-01 entry above is stale. A
concurrent agent had already built both megafuel files UNTRACKED in this worktree —
reviewed line-by-line against `02-megafuel-client.md` rather than trusted as-is, and it was
mostly correct: `isSponsorable`/`sendGasless` contracts, mandatory self-pay fallback
(decline / MegaFuel error / failed sponsored submit all resolve to self-pay), the
no-private-key-in-module invariant, and `.env.example`'s `NODEREAL_MEGAFUEL_KEY=` entry all
matched spec as-built.

**One real bug found and fixed:** `megafuelEndpoint()` appended `NODEREAL_MEGAFUEL_KEY` as
a URL path segment onto `bsc-megafuel(-testnet).nodereal.io` when the key was set — this
does not match NodeReal's actual API. Cross-checked live against
`docs.nodereal.io/reference/pm-issponsorable`, `.../eth-sendrawtransaction-megafuel`, and
`.../pm-createpolicy`: `pm_isSponsorable` / `eth_sendRawTransaction` run **unauthenticated**
at the plain base URL always; the `{apikey}` path segment only exists on the *separate*
policy-management gateway (`open-platform-ap.nodereal.io/{apikey}/megafuel(-testnet)`,
`pm_createPolicy`/`pm_updatePolicy` — a one-time sponsor setup step, out of this prompt's
scope). Sponsorship is resolved server-side purely by matching the tx's `from` address
against an already-provisioned policy. Fixed `megafuelEndpoint()` to always return the base
URL, rewrote the `.env.example` comment to explain the key's real scope, and updated the
test that had asserted the old (wrong) key-appending behavior.

- **Tests:** `tests/bnb-megafuel.test.js` — **13/13 passed**, all with injected mocks
  (`megafuelRpc`/`publicClient`/`walletClient`) plus a synthetic per-run throwaway account
  (`generatePrivateKey()`), never a real key. Covers: `isSponsorable` true/false/error-as-
  decline; `sendGasless` sponsored path; self-pay fallback on decline, on MegaFuel throwing,
  and on a sponsored-send failure after an accepted probe; self-pay-also-fails → typed
  `MegaFuelError`; malformed `tx.to` / bad signer rejected before any network call; source
  grep asserting no private-key/mnemonic/raw-key literal in the module.

**Live proof #1 — real `pm_isSponsorable` probe against the public BSC testnet MegaFuel
endpoint** (raw JSON reply, unmocked, `to`/`from` = burn address so a decline is expected
and is itself valid proof the wire format is accepted):
```json
{"jsonrpc":"2.0","id":1,"result":{"sponsorable":false}}
```
Through our own `isSponsorable()`: `{"sponsorable":false,"sponsorInfo":null,"reason":"not sponsorable"}`.

**Live proof #2 — full `sendGasless()` self-pay path, real EVM execution.** No NodeReal
sponsor policy exists for our sender (or any unregistered sender — proof #1 shows that), so
a real *sponsored* send isn't obtainable without the owner provisioning a policy at
dashboard.nodereal.io. Per 00-CONTEXT's decision-default table ("If every faucet fails:
finish ALL code + tests against a local `anvil --chain-id 97` fork") — the public BSC
testnet faucet (`bnbchain.org/en/testnet-faucet`) requires an interactive reCAPTCHA with no
programmatic path, so a real broadcast tx hash on the public testnet wasn't obtainable
either. Installed Foundry (`foundryup`, not previously present in this environment), forked
live BSC testnet state with `anvil --chain-id 97 --fork-url <public testnet RPC>`, funded a
synthetic throwaway account (`0x6b4fFe6F3381Af8fdA5e5c0fe35Df6C261789820`, generated
on-the-spot, private key discarded after the run) via `anvil_setBalance`, then ran the real
`sendGasless()` export (not a reimplementation) against that fork — real probe to the live
MegaFuel testnet endpoint + a real self-pay send through viem's `walletClient` against
forked BSC-testnet EVM state:
```json
{"hash":"0xd5ca4bce0f7ecd78f3f8afe5bb3553f3599c4c359d7cfbe98af6eebe42f2e905","mode":"self-pay","reason":"not sponsorable"}
```
Receipt: `status: success, gasUsed: 21000, effectiveGasPrice: 1000000000` (1 gwei — a real
gas charge, proving this is genuinely the self-pay path, not sponsored). Sender balance
went from 1.0 → 0.998979 tBNB, exactly 21000 gas × 1 gwei + the 0.001 tBNB transfer value.

**Gap for the owner / prompt 03+:** a real sponsored (`mode:'sponsored'`, `gasPrice 0`,
on-chain) send cannot be proven until a NodeReal MegaFuel sponsor policy is created for our
sender/contract at dashboard.nodereal.io (needs `NODEREAL_MEGAFUEL_KEY` + `pm_createPolicy`
against `open-platform-ap.nodereal.io/{key}/megafuel-testnet` — not implemented in this
module by design, out of scope per the spec). Until then every real send transparently
self-pays, which is the mandated behavior, not a broken state. A funded
`BNB_TESTNET_DEPLOYER_KEY` for a **real broadcast** (vs. the anvil-fork proof above) is
still needed for prompt 03 (registration) and 15 (world-moves) to post an actual public
BscScan-visible tx; the faucet's reCAPTCHA remains the blocker — same gap prompt 01 will
hit if it wants a real broadcast rather than a read-only RPC probe.

**Status: DONE.** `isSponsorable`/`sendGasless` are ready for prompt 03/15 to import.

---

## 2026-07-08 — Prompt 20: BABT verification spike — VERDICT: REAL, SHIPPED

**Truth-before-code gate: PASSED.** BABT (Binance Account Bound Token) is real, live on
BSC mainnet AND testnet, and third-party-queryable today via a single free `eth_call`.
Full research writeup with sources: `docs/bnb-babt-findings.md`.

**Contract identity — real `eth_getCode` + `name()` probes, not taken on faith:**
- Mainnet `0x2B09d47D550061f995A3b5C6F0Fd58005215D7c8` — bytecode present (3622 bytes),
  `name()` = `"Binance Account Bound Token"`, `totalSupply()` = 1,164,243 (matches
  BscScan's 1.16M+ holder count). Verified contract, 1.4M+ transactions.
- Testnet `0x984E6a7b9cb73cB7884c9ca9b1Ee625546F9D0E3` — also has real bytecode,
  `name()` = same string, `totalSupply()` = 1,252. **A real testnet deployment exists**
  (contrary to 00-CONTEXT's working assumption) — real mints, but developer test
  accounts, not KYC'd Binance users, so it's useful for integration testing only.
- Both addresses sourced from Binance's own docs (`developers.binance.com/docs/babt/apis-spec`),
  never invented.

**Real holder proof — found by scanning live `Transfer` (mint) logs on the mainnet
contract, then reading the resulting address back through the real interface:**
```
mint found in blocks 108689374–108694374 → holder 0x04d1c36842430a169d132ada68006e6bb9e3808b
balanceOf(holder) = 1
tokenIdOf(holder) = 1316815
balanceOf(0x…dEaD burn address) = 0   (sanity check)
```
Interface: BEP-721-extending soulbound token — `balanceOf(address)`, `tokenIdOf(address)`,
`ownerOf(uint256)`, `totalSupply()`, all free public `view` reads, no API key/Binance
relationship needed to *read*. Non-transferable; Binance can revoke + re-mint to a new
wallet (rotates `tokenId` — don't treat it as a stable identity anchor, per Binance's own
integration warning).

**Shipped** (gate passed → build half executed):
- `api/_lib/bnb/babt.js` — `hasBabt(address, network?, opts?)`, mainnet-default,
  typed `BabtCheckError` on a real read failure, tokenIdOf failure never downgrades a
  confirmed `balanceOf>0` holder to a false negative.
- `GET /api/bnb/babt-check?address=&network=` — free, rate-limited (`limits.publicIp`),
  400 on bad input/unknown network, 502 `contract_unreachable` on RPC failure, honest
  `note` field distinguishing the real mainnet KYC signal from the testnet
  developer-only caveat.
- `tests/bnb-babt.test.js` (10 tests, +1 live-RPC-gated) — lib-level, mocked client for
  determinism, live test re-proving the exact holder above against the real contract
  (`BNB_LIVE_RPC=1` → 10/10 passed, confirms `holdsBabt:true`, `tokenId` populated).
- `tests/bnb-babt-check-endpoint.test.js` (13 tests) — endpoint validation, success,
  upstream-failure, and rate-limit paths, mocked `hasBabt`/`limits` (kept in its own
  file — `vi.mock` hoisting would otherwise shadow the real `hasBabt` the lib suite
  exercises directly).
- `docs/bnb-babt-findings.md` — full verdict, live probe output, interface, limitations
  (KYC-not-permanent-identity, mainnet-primary, single-issuer trust), and an honest
  comparison vs. Gitcoin Passport / World ID / Coinbase attestations.
- `00-CONTEXT.md` refuted-list line updated to reflect the settled verdict.

**Gap for future prompts:** no gap — the read path needs nothing further (no key, no
funded wallet, no policy). If a future prompt wants to *gate* a three.ws feature (mint,
allowlist, etc.) on `hasBabt`, `api/_lib/bnb/babt.js` is ready to import directly.

**Status: DONE.** Open question closed; `hasBabt`/`/api/bnb/babt-check` ready to import.

## 2026-07-08 — Prompts 04 + 05 + 06: MPP payments (accept + pay + docs) — SHIPPED

**Outcome: three.ws is x402↔MPP bilingual.** `@bnb-chain/mpp`'s b402 layer is x402 v2
(same `X-PAYMENT`/`X-PAYMENT-RESPONSE` headers + EIP-3009 credential our Base path already
signs), so "speaking MPP" = advertising a BNB-network (`eip155:56`/`97`) accept entry and
routing BNB-network payments through the b402 facilitator, leaving the Solana/Base x402 path
untouched. `@bnb-chain/mpp@0.2.0` was already in `node_modules`; used its `/b402` primitives
rather than hand-rolling the wire format.

- **04 — server (`api/_lib/bnb/mpp-server.js`):** `mppRequirements`/`mppChallenge` emit a
  spec-shaped BNB 402 (extra fields preferred from a live `/supported` kind); `mppVerify`
  decodes → full-shape-gates (`isEip3009PaymentPayload`) → pins every buyer-echoed field to
  ours (network/asset/payTo/amount/scheme) → `recoverEip3009Payer` (must equal
  `authorization.from`) → Redis `SET NX PX` replay guard (process-local fallback);
  `mppSettle` calls the b402 facilitator `/settle`. Split verify/settle so the endpoint runs
  verify (free) → work → settle, never charging on a data-outage 503. Wired ADDITIVELY into
  the `three-intel` pilot: `looksLikeMppPayment(req)` routes BNB payments to b402; every
  Solana/Base/unpaid request falls through to the untouched `paidEndpoint` x402 handler.
- **05 — buyer (`api/_lib/bnb/mpp-buyer.js`):** `mppFetch(url, opts, { account, maxSpend })`
  runs the 402→sign(EIP-3009)→retry loop with a HARD pre-signature spend cap (over-quote →
  `over_budget`, ZERO payment sent), bounded retries (no infinite loop), synthetic-account
  tested. Re-exported from `api/_lib/x402-buyer-fetch.js` so agents that already import the
  x402 buyer get MPP from the same surface.
- **06 — docs:** `docs/bnb-payments.md` (linked from start-here) + `specs/x402-mpp-bridge.md`
  (the credential-mapping / header-precedence / replay contract). Every code sample runnable.

**Tests (all green):** `tests/bnb-mpp-server.test.js` (15 — REAL signatures via
`buildEip3009Payment`, so `recoverEip3009Payer` runs the true path; replay + pin + settle),
`tests/bnb-mpp-buyer.test.js` (9 — happy path, cap enforcement with call-count assertion,
unsupported/missing credential, bounded retry). Existing `tests/api/three-intel.test.js`
still 11/11 — additive wiring did not touch the x402 path. Full BNB suite 110 passed.

**Proof — real EIP-3009 credential round-trip (unit, no faucet needed):** a synthetic account
signs a real `TransferWithAuthorization`; `mppVerify` recovers the exact signer and pins the
offer; a second presentation of the same nonce → `replay` (HTTP 409). `mppSettle` with an
injected facilitator client returns a b402 `X-PAYMENT-RESPONSE`.

**Gap for the owner:** real on-chain settlement needs b402 MERCHANT CREDENTIALS
(`B402_BASE_URL`/`B402_CLIENT_ID`/`B402_ACCESS_TOKEN`/`B402_PRIVATE_KEY`, RSA "Tesla"
signing — provision at the Binance OnchainPay merchant console). Without them the adapter
verifies off-chain and returns `mpp_not_configured` (503) for settle — never a fabricated
receipt. `X402_PAY_TO_BSC` must also be set to advertise MPP. All code + tests are complete;
this is a credential-provisioning step, not a code gap.

**Status: DONE (code + tests + docs).** Blocked only on external b402 merchant onboarding.

---

## 2026-07-08 — Prompt 19: `/bnb` hub page — SHIPPED

**Outcome: the campaign's front door is live.** Built as prompt 01 said to run it — early,
with honest coming-soon states — since only prompt 01 was confirmed shipped when this prompt
started (prompts 02/04/05/06/08/20 above landed concurrently mid-build; the auto-light-up
logic below picked several of them up for free by the time I finished — see proof).

- `pages/bnb.html` + `src/bnb.js` (`→ /bnb`) — hero, a live block-time proof strip, and three
  feature cards (gasless onboarding, on-chain-gated vault, real-time on-chain world). Every
  claim traces to 00-CONTEXT's verified list; explicitly never claims 20k TPS or 250ms
  finality (BEP-670 called out as not-live). CLAUDE.md UI bar: skeleton/loading, retry-able
  error, responsive at 320/768/1440, `prefers-reduced-motion` respected, hover/active/focus
  states on every interactive element, `aria-live` status regions.
- `api/bnb/block-time.js` — free GET endpoint wrapping prompt 01's `probeBlockTime`
  (bscMainnet default, 10s cache, rate-limited via `limits.publicIp`). No hardcoded "0.45s" —
  measured fresh on every cache miss.
- `src/bnb-hub-helpers.js` — pure formatters (`formatBlockTime`, `formatBlockNumber`,
  `deltaFromTarget`) + track-liveness gating (`trackLiveness`, `combineTrackStates`), unit
  tested in `tests/bnb-hub-helpers.test.js` (17/17 passed, no mocks needed — pure functions).
- **Auto-light-up mechanism (real checks, not flags):** each card issues a `HEAD` probe (4s
  timeout) against its track's canonical route/API on the running deployment. `404` or a
  network error → "coming soon" (fails closed); any other status (including `405` from a
  POST-only endpoint probed with `HEAD`) → "live". Card targets: gasless →
  `/api/bnb/register-agent` (prompt 03, not yet shipped) with a secondary docs link gated on
  `/docs/bnb-payments.md` (prompt 06 — **shipped concurrently, so this secondary link is now
  live**); vault → `/vault` (prompt 12, not yet shipped); on-chain world → `/bnb-latency`
  (prompt 17, not yet shipped).
- Docs/wiring: `data/pages.json` (`/bnb` registered), `STRUCTURE.md` row, `data/changelog.json`
  (tag `feature`), `public/nav-data.js` (Discover → Start here, next to Labs), Vite build
  input + dev-server rewrite, `vercel.json` clean-URL route (`/bnb/?` → `/bnb.html`).

**Live proof — block-time widget, real RPC, unmocked** (invoked the actual exported handler
with mock req/res, not a reimplementation):
```json
{"network":"bscMainnet","avgBlockTimeMs":450,"latestBlock":108695844,"sampleBlocks":200,"target":450,"measuredAt":"2026-07-08T00:58:24.182Z"}
```
Response headers confirmed: `200`, `cache-control: public, max-age=5, s-maxage=10,
stale-while-revalidate=30`, CORS `*`. A second direct `probeBlockTime` call moments later
returned `latestBlock: 108695821` — block number advancing in real time across separate
processes, i.e. genuinely live chain state, not a cached fixture.

**Manual verification:** `npm run dev`, `curl` against the Vite dev server — `/bnb` returns
200 and contains `#bnb-grid`/`#bnb-proof-card`/the `src/bnb.js` module tag; `HEAD /vault`,
`HEAD /bnb-latency`, `HEAD /api/bnb/register-agent` all correctly 404 (not yet built, so the
gating renders coming-soon); `HEAD /docs/bnb-payments.md` correctly 200 (prompt 06 landed
concurrently). `npm run build:pages` validated `data/pages.json`/`data/changelog.json`
cleanly (`2/7 files updated`, no errors). Did not drive a real Chromium session (none
available in this environment) — verification is curl + direct-handler-invocation against
real RPC/HTTP, not a headless-browser screenshot; no console-error check was possible for
that reason. `npx vitest run tests/bnb-hub-helpers.test.js` → 17/17 passed.

**Shared-worktree note:** every file this prompt touched was independently confirmed
committed with byte-identical content to what was authored here — but bundled into three
*other* agents' commits (`7e185b58d`, `cf190dfd3`, `f6dbb8ac3`) via their own broad `git add`
sweeps, not a commit run by this prompt. Flagging per the "known traps" section rather than
rewriting history: content is safe and correct, only the commit *messages* don't mention this
work.

**Gap for prompts 03/06(UI)/12/16/17:** none from this side — the hub's gating logic needs no
changes as those tracks ship; a `HEAD` 200/405 on the routes named above is the entire
contract. Prompt 03 should note that the gasless-registration card's primary CTA points to
`/create-agent` (existing ERC-8004 identity surface) — wire the "Register on BNB (gasless)"
affordance there, not a new route, or update `TRACKS[0].primary.href` in `src/bnb.js` if it
lands somewhere else.

**Status: DONE.**

## 2026-07-08 — Prompt 07: Greenfield read client — SHIPPED, verified live

**Outcome: `api/_lib/bnb/greenfield.js` + `tests/bnb-greenfield-read.test.js` done.** The
read layer Track B's vault (upload 09, unlock 11) composes: bucket/object metadata,
permission derivation, SP byte download, all read-only against Greenfield testnet.

**Open-source decision:** `@bnb-chain/greenfield-js-sdk` (2.2.2) is a heavy
protobuf/tendermint/cosmos dependency tree; every read we need is a plain HTTPS call. Per
00-CONTEXT's "wrap the minimal REST yourself" default (same bundle-lean rationale as
`erc8004-chains.js`), the module calls the live endpoints directly with `fetch` rather than
bloating the serverless bundle: chain metadata via the Greenfield grpc-gateway REST
(`/greenfield/storage/head_bucket/{b}`, `/head_object/{b}/{o}`), object bytes via the SP
S3-style virtual-hosted gateway.

- **Exports:** `headBucket`, `getObjectMeta`, `getObjectPermissions`, `listObjects`,
  `downloadObject`, `greenfieldNetwork`, `GreenfieldError`, `VISIBILITY`.
- **Permissions:** the public REST gateway does NOT expose `verify_permission`
  (returns grpc code 12 "Not Implemented", confirmed live), so `getObjectPermissions`
  derives read access from on-chain ObjectInfo (`PUBLIC_READ` → anyone; else owner-only) and
  documents that fine-grained policy/group grants resolve via a `downloadObject` auth-probe.
- **States:** not_found (chain codes 1100/1101), forbidden (SP 403 — the vault's LOCKED
  signal, typed not thrown-500), unavailable (SP 5xx → SP failover → typed 503), bad_request
  (malformed name, rejected before any network call), pending (async mirror lag surfaced).

**Tests:** `tests/bnb-greenfield-read.test.js` — **17/17 passed**, all with an injected
`fetchImpl` (offline, deterministic), synthetic bucket/object names only. Covers meta shape,
not_found mapping, owner/public/denied permission derivation, download bytes + forbidden +
not_found + SP-failover + all-SPs-down, and XML/JSON list parsing.

**Live proof (real Greenfield testnet grpc-gateway, through the module):**
- `headBucket('three-ws-synthetic-probe-bucket')` → `GreenfieldError not_found` "codespace
  storage code 1100: No such bucket" — real chain response.
- `getObjectMeta(..., 'model.glb')` → `GreenfieldError not_found` "codespace storage code
  1101: No such object" — real chain response.
  These prove the read wire is live end-to-end. Reading a SPECIFIC public object's metadata /
  proving the forbidden download on a real private object both need an object to exist first,
  which is prompt 09's funded upload (same tBNB-faucet blocker noted in prompts 01/02).

**Status: DONE (code + tests, live-wire proven).** Upload (09) + unlock (11) can import it.

---

## 2026-07-08 — Prompt 10: GreenfieldVault.sol (pay → PermissionHub grant) — SHIPPED, deploy BLOCKED

**Outcome: `contracts/src/GreenfieldVault.sol` + real interface stubs + full Foundry
test suite done and compiling/passing. Live BSC testnet deploy is blocked on a funded
deployer key (same as items 13/18) — everything else is deploy-ready.**

- **Real interfaces, not invented ones.** `contracts/src/greenfield/{IPermissionHub,
  ICrossChain,IGnfdAccessControl,IApplication}.sol` reproduce the exact ABIs from
  `bnb-chain/greenfield-contracts` (`contracts/interface/*.sol` +
  `middle-layer/resource-mirror/storage/{PermissionStorage,CmnStorage}.sol` +
  `storage/PackageQueue.sol`), fetched and verified against `master` on 2026-07-08 —
  every function signature, the `ExtraData`/`FailureHandleStrategy` types, and every
  address are sourced, not guessed. Kept as minimal self-contained interfaces (not the
  full upgradeable implementation tree) so this workspace doesn't need to add
  `@openzeppelin/contracts-upgradeable` as a new dependency.
- **Real addresses, cross-checked two ways.** Mainnet CrossChain/ObjectHub from
  `00-CONTEXT.md`'s bytecode-verified list; PermissionHub mainnet + all four testnet
  hub addresses read live from `bnb-chain/greenfield-contracts`' README "Contract
  Entrypoint" tables (testnet PermissionHub `0x25E1eeDb5CaBf288210B132321FBB2d90b4174ad`,
  CrossChain `0xa5B2c9194131A4E0BFaCbF9E5D6722c873159cb7`, ObjectHub
  `0x1b059D8481dEe299713F18601fB539D066553e39`) — full table in `DEPLOYMENTS.md`.
- **`list`/`buy`/`revoke` exactly as specced, plus what "the vault must control its
  permissions" actually means on-chain:** `list()` requires the seller to have already
  called the real `IGnfdAccessControl.grantRole(ROLE_CREATE, vaultAddress, expiry)` on
  ObjectHub — checked live via `hasRole`, not merely asserted. `buy()` takes an
  off-chain-built GNFD permission payload (`policyData`, opaque bytes — no EVM contract
  encodes GNFD protobuf on-chain, real PermissionHub doesn't either), validates
  `price + live crossChain.getRelayFees()` atomically (no half-execution on
  underpayment or an uncovered relay fee), forwards the real relay fee to
  `PermissionHub.createPolicy`, and emits `Purchased`. Because `createPolicy` is
  genuinely asynchronous (00-CONTEXT: "poll for effect, never assume same-block"), the
  vault implements `IApplication.greenfieldCall` to receive the real minted policy id
  when Greenfield's ack settles, emitting `PolicyGranted`/`PolicyGrantFailed` — the
  "surface pending honestly" pattern the rest of this campaign uses, not a fabricated
  synchronous policyId. `revoke()` is seller-gated, calls the real
  `PermissionHub.deletePolicy`, documented as permanent-grants-by-default with an
  explicit escape hatch (spec left this a documented choice). Multiple buyers can each
  hold an independent grant on the same object (content-access marketplace, not
  ownership transfer); double-buy by the same buyer is idempotent-by-design
  (`AlreadyPurchased`, cleared on revoke/failed-settlement so a retry/resell works).
  Pull-payment `withdraw()` for seller proceeds; `nonReentrant` on every state-changing
  external-payment path.
- **Tests:** `contracts/test/GreenfieldVault.t.sol` (34 tests) +
  `contracts/test/mocks/{MockGreenfield.sol,Reentrant.sol}` — mocked
  PermissionHub/CrossChain/IGnfdAccessControl faithful to the real two-phase syn/ack
  flow (a `settleCreatePolicy(policyId, status)` harness call plays the Greenfield
  relayer). Covers: list requires role grant, only-seller list/delist, relist repricing,
  listed-by-another-seller, buy happy path + settlement, unlisted/empty-data/underpayment/
  missing-relay-fee reverts (atomic, no partial state), excess-payment refund, double-buy
  reverts and clears on failed-settlement/revoke, `greenfieldCall` access control (only
  PermissionHub, only the real channel id, unknown-sale guard), full revoke lifecycle
  (only sale's seller, requires `Granted` status, insufficient-fee revert, excess-fee
  refund), withdraw pull-payment, `quoteRelayFee` view, and two dedicated
  cross-function re-entrancy proofs (a `buy()` refund trying to re-enter `buy()` on a
  separate valid listing; a `withdraw()` payout trying to re-enter `withdraw()`) —
  both assert the nested low-level call fails with OpenZeppelin's
  `ReentrancyGuardReentrantCall` specifically, not just "nothing happened to steal".
- **`contracts/script/DeployGreenfieldVault.s.sol`** — selects real hub addresses by
  `block.chainid` (56/97), env-overridable. Dry-run proof below.

**Real build/test proof:**
```
$ forge build
Compiler run successful!

$ forge test --match-path test/GreenfieldVault.t.sol
Ran 34 tests for test/GreenfieldVault.t.sol:GreenfieldVaultTest
Suite result: ok. 34 passed; 0 failed; 0 skipped

$ forge test   # full contracts/ workspace, nothing else touched
Ran 6 test suites: 94 tests passed, 0 failed, 0 skipped
```

**Deploy: BLOCKED on a funded deployer key (owner-only, same as items 13/18).**
`forge script script/DeployGreenfieldVault.s.sol:DeployGreenfieldVault --rpc-url
https://data-seed-prebsc-1-s1.bnbchain.org:8545 -vvvv` (no `--broadcast`) simulated
successfully end-to-end against the LIVE BSC testnet RPC: constructor executes with the
real testnet PermissionHub/CrossChain/ObjectHub addresses baked in, ~1.16M gas estimated
at 0.1 gwei ≈ 0.000170 BNB. Checked (presence only, no secret values read):
`DEPLOYER_PK`/`BNB_TESTNET_DEPLOYER_KEY` absent from shell env, no root `.env`, no
`contracts/.env`, `cast wallet list` empty. Full dry-run trace + constructor args
recorded in `DEPLOYMENTS.md`'s new GreenfieldVault section.

**Other changes:** added `BSC_TESTNET_RPC_URL`/`BSCSCAN_API_KEY` to
`contracts/.env.example` and `bsc_testnet`/`bsc` entries to `contracts/foundry.toml`
`[rpc_endpoints]`/`[etherscan]` (additive only — did not touch `AgentPayments.sol`,
the ERC-8004 registries, or `api/_lib/bnb/`, per this prompt's file boundaries).

**Gap for prompt 11 (unlock API) / 13 (e2e proof):** the real end-to-end proof (a real
`buy()` tx, a real `createPolicy` ack settling, a real `PolicyGranted` with a real
Greenfield policy id, cross-checked on GreenfieldScan) needs both this contract deployed
AND a real uploaded+listed object (prompt 09, same funding blocker) — same single root
cause blocking 07/08/09/13/14/18 in this campaign.

**Status: DONE (code + tests). Deploy BLOCKED on funded deployer key — owner action
needed.**

---

## 2026-07-08 — Prompt 03: Gas-free ERC-8004 agent registration on BSC — SHIPPED, verified live end-to-end with real mints

**Outcome: `api/_lib/bnb/erc8004-gasless.js`, `api/bnb/register-agent.js`,
`src/erc8004/gasless-register.js`, and the `/deploy` wizard's new gasless panel are done
and proven with REAL BSC testnet mints — not simulations.** Prereqs 01/02 confirmed
committed (`92bab1faf`, `c61c96452`) and imported as-is; `megafuel.js` gained one small
additive export (`submitRawTx`, a low-level "relay bytes I was handed" primitive — see
below for why `sendGasless()` didn't fit this prompt's signing model).

**Architecture decision — why this ISN'T `sendGasless()`:** the spec's phrasing ("server
relays via `sendGasless`") assumes a server-held signer. That's right for prompt 02's
demo/ops account, but wrong here: this endpoint must never see a private key. Real
design: the CLIENT (browser wallet or, for the true "zero-balance wallet" demo, an
in-page ephemeral viem account whose key lives in `sessionStorage` only) signs a
*legacy* `register(agentURI)` transaction entirely itself — with `gasPrice: 0` for a
gasless attempt, or a real `gasPrice` for a self-pay attempt — and POSTs only the raw
signed bytes. The server (`relayGaslessRegistration`) parses them (`viem.parseTransaction`
+ `recoverTransactionAddress`), validates the target is the real Identity Registry, and
either relays the EXACT bytes to MegaFuel's `eth_sendRawTransaction` (gasless branch) or
broadcasts them as-is via the public RPC (self-pay branch) — it never constructs or signs
anything. A `gasPrice: 0` tx that MegaFuel declines is mechanically unbroadcastable on any
normal node (guaranteed underpriced-tx rejection outside the paymaster path), so a decline
returns `{ mode: 'declined', reason, hint }` instead of attempting a doomed send — the
caller re-signs with a real gasPrice and POSTs again to self-pay.

**Two real bugs found and fixed by live testing (would have shipped broken from mocks alone):**
1. **Already-registered guard crashed on the real contract.** The live BSC Testnet
   Identity Registry (`0x8004A818BFB912233c491871b3d84c89A494BD9e`) declares
   `tokenOfOwnerByIndex` in its ABI but **reverts** on every call to it (no
   ERC721Enumerable storage wired) — confirmed live 2026-07-08. The original guard did
   `.catch(() => null)` around the whole already-registered check, which silently treated
   a revert as "not registered" and would have let an already-registered address slip
   into a duplicate mint attempt. Fixed: `balanceOf` alone (which works) now
   short-circuits registration; `tokenOfOwnerByIndex` is best-effort enrichment only —
   `agentId: null` with `alreadyRegistered: true` when it can't be resolved, never a
   silent false negative.
2. **agentId decoded from the wrong topic when both `Transfer` and `Registered` logs are
   present.** Every real mint emits BOTH events in the same receipt, with `Transfer`
   logged first. `Transfer(from, to, tokenId)` puts `tokenId` at `topics[3]`, not
   `topics[1]` (that's `from`, which is `0x0` on a mint) — a naive "first
   Registered-or-Transfer match, read `topics[1]`" decoder silently returned `"0"` as the
   agentId on every real registration. Live testing caught it immediately (a real mint
   returning agentId `"0"` was an obvious tell). Fixed: `Registered`'s `topics[1]` is
   preferred when present; `Transfer` fallback now correctly reads `topics[3]`. Regression
   tests added for both bugs (`tests/bnb-erc8004-gasless.test.js`).

**Tests:** `tests/bnb-erc8004-gasless.test.js` (17 cases) — real legacy-tx signing +
parsing with synthetic per-test viem accounts (never a real key), injected
publicClient/megafuelOpts mocks for sponsored/self-pay/declined/pending/reverted paths,
both regression tests above, input validation (malformed tx, wrong target, non-legacy
type). `tests/bnb-register-agent.test.js` (10 cases) — HTTP boundary only (validation,
status/body shaping, rate limiting via new `limits.bnbRegisterIp`, method/CORS), mirrors
`tests/bnb-babt-check-endpoint.test.js`'s mock-the-lib pattern. `npx vitest run
tests/bnb-erc8004-gasless.test.js tests/bnb-register-agent.test.js tests/bnb-megafuel.test.js`
→ 36/36 passed.

**REAL testnet proof — four independent layers, zero mocks, all cross-verified against
three public RPCs (`data-seed-prebsc-1-s1.bnbchain.org`, `bsc-testnet.drpc.org`,
`bsc-testnet-rpc.publicnode.com`):**

1. **Library-direct** (`relayGaslessRegistration()` called with zero overrides — real
   `getPublicClient('bscTestnet')`, real MegaFuel fetch): fresh account
   `0xfb35130d94D80437eb3350c71e2c62898e9c57E3`, balance **0 wei both before and after**.
   ```json
   {"mode":"sponsored","agentId":"1593",
    "hash":"0x29b2999e1543d7e6d4eba21b41b33718d8e0196e18c1510d39e4cffcfe52bc95",
    "blockNumber":117842997,
    "sponsor":{"sponsorable":true,"sponsorName":"Yolin","sponsorIcon":"Yolin"}}
   ```
   Receipt independently fetched: `status:0x1, effectiveGasPrice:0x0` — genuinely free.
   Same account re-registered a second time → `{"alreadyRegistered":true,"agentId":null}`,
   no second broadcast (proves bug-fix #1 above against real state).
2. **HTTP-layer** (`curl` → real `server/index.mjs` on a local port, the actual
   production Express routing/CORS/rate-limit/JSON-parse stack, not a reimplementation):
   fresh account `0x693E0892C9970055e599fB286FA9116039bCbE00` → `{"mode":"sponsored",
   "agentId":"1594","hash":"0xa51be73cc33f9336e5527fc500cbb651228013f491fe071b336d849dc1be6687"}`,
   independently confirmed `status:0x1, effectiveGasPrice:0x0` on-chain.
3. **Real browser UI** (Playwright driving the actual `/deploy` page: select BSC Testnet,
   fill the wizard, click **⚡ Register gasless (0 tBNB wallet)**): ephemeral wallet
   `0xC101347Ef63059F346026eA338c1dd48C58937BB` generated client-side, log output "Relayed
   via MegaFuel — mode: sponsored. Tx: 0x9d5ba2b1...  Confirmed. Agent ID: 1595."
   Independently confirmed on-chain: `status:0x1, effectiveGasPrice:0x0,
   from:0xc101347ef63059f346026ea338c1dd48c58937bb`.
4. **Self-pay branch** (public testnet faucet still reCAPTCHA-gated — same blocker prompt
   02 documented — so funded via `anvil --chain-id 97 --fork-url
   https://bsc-testnet.drpc.org` + `anvil_setBalance`, same pattern prompt 02 used,
   `relayGaslessRegistration()` run unmodified against the fork): funded 0.1 tBNB, minted
   agentId `"1594"` (fork-local counter), real gas charged
   (`0.1 → 0.099867272 tBNB`), confirming the self-pay branch's decode/broadcast path is
   correct too (this is where bug #2 was originally caught, before being confirmed live).

**MegaFuel sponsor-policy finding — the prompt-02 gap is narrower than recorded:** prompt
02's PROGRESS entry noted "no NodeReal sponsor policy exists for our sender (or any
unregistered sender)" as of 2026-07-08 T00:xx. Re-probed the same live
`pm_isSponsorable` endpoint a few hours later in this session and got
`{"sponsorable":true,"sponsorName":"Yolin","sponsorIcon":"Yolin"}` for multiple freshly
generated, never-before-seen addresses — MegaFuel's BSC testnet policy currently sponsors
arbitrary senders by default (a testnet-only "Yolin" default policy, not one we
provisioned). This is exactly what makes the zero-balance-wallet demo work live right
now; it's a MegaFuel-operator decision that could change without notice (per 00-CONTEXT's
"sponsor policies are whitelisted" caveat), so the self-pay fallback documented above
remains load-bearing, not decorative.

**Docs/changelog:** `docs/erc8004.md` — new "Gasless agent registration on BNB" section
(architecture, curl example with a real captured response, response-shape table, known
limits) linked implicitly via the existing `## Registering an agent` flow.
`data/changelog.json` — holder-readable entry (`feature`, `sdk` tags) linking `/deploy`.

**Status: DONE.** No blockers — the flow works end-to-end today, live, for a genuinely
zero-balance wallet. Only soft gap: this mints with a seed URI (GLB/image URL) only, same
as the standard flow's first transaction; pointing the token at the full agent-card JSON
still needs a follow-up `setAgentURI` call this gasless path doesn't perform (documented
in docs/erc8004.md "Known limits" — an explicit scope cut, not an oversight, to keep the
relay to one signed transaction). Ready for prompt 04 (mpp-server-adapter) to build on.

---

## 2026-07-08 — Prompt 04 (mpp-server-adapter): independently re-verified + real HTTP-layer proof added — DONE, one interop gap flagged for prompt 05

**Starting state:** this prompt's deliverable — `api/_lib/bnb/mpp-server.js`,
`api/_lib/bnb/mpp-buyer.js` (prompt 05), `docs/bnb-payments.md` + `specs/x402-mpp-bridge.md`
(prompt 06), and the additive MPP wiring in `api/x402/three-intel.js` — was already SHIPPED
and PUSHED to `threews/main` by a concurrent agent in this worktree before this session
started (commit `818db3304` landed it; the "Prompts 04 + 05 + 06" PROGRESS entry above
documents it). Re-read every changed file line-by-line against the prompt spec rather than
trusting the entry as-is, then closed the one verification gap the existing entry had: all
its proof was library-direct (unit tests with an injected facilitator client) — no HTTP-layer
proof against the actual running server existed yet, which this campaign's DoD requires
(mirroring prompts 02/03's multi-layer pattern).

**Independent checks run:**
- `node_modules/@bnb-chain/mpp` is a real installed dependency (`^0.2.0` in `package.json`,
  `dist/` present) — not a fabricated import.
- `npx vitest run tests/bnb-mpp-server.test.js tests/bnb-mpp-buyer.test.js
  tests/api/three-intel.test.js` → **35/35 passed**, confirming the existing x402 path on the
  pilot endpoint is untouched (additive-only claim holds).
- `docs/bnb-payments.md` (157 lines) + `specs/x402-mpp-bridge.md` (107 lines) both exist,
  linked from `docs/start-here.md`, no TODO/placeholder/not-implemented strings.
- `data/changelog.json` has both the feature entry and the docs entry, dated 2026-07-08,
  holder-readable, correct tags.

**New real proof — HTTP layer, live process, no mocks (the gap this session closed):**
Ran the actual `server/index.mjs` (the real production Express app — not a reimplementation)
locally on port 8091 with synthetic `X402_PAY_TO_BSC` / `MPP_ASSET_ADDRESS_BSC` env vars, then
drove it with a real EIP-3009 credential signed by a synthetic viem account via
`@bnb-chain/mpp/b402`'s own `buildEip3009Payment`/`encodeXPayment` (the same primitives
prompt 05's buyer uses) — cryptographically real signatures, zero mocks:

1. **First presentation** of a correctly-priced credential → server ran `computeThreeIntel()`
   (proving the live DexScreener business logic executed) then attempted settlement:
   `503 {"error":"mpp_not_configured","message":"MPP credential verified but on-chain
   settlement is unconfigured — set B402_BASE_URL / B402_CLIENT_ID / B402_ACCESS_TOKEN /
   B402_PRIVATE_KEY"}` — verify succeeded, settle correctly fails closed (never a fabricated
   receipt), matching the documented owner-credential blocker exactly.
2. **Replay of the identical credential** → `409 {"error":"replay","message":"this payment
   credential was already used"}` — proves the Redis-or-local-fallback nonce guard is live
   and reserves on verify (not just on successful settle), so a captured credential can't be
   replayed even while settlement is unconfigured.
3. **Tampered offer** (same signer, amount changed to `999999`) → `400
   {"error":"offer_mismatch","message":"payment amount does not match this resource"}` —
   pin-to-requirements runs before signature recovery matters.
4. **No-payment GET** → `X-Accept-Payment-MPP: /api/x402/three-intel` response header present
   regardless of the underlying x402 fallback's own health (confirmed even when the x402
   networks 500'd on unrelated local sandbox config, proving the MPP advertisement is
   architecturally decoupled from the x402 path's own settleability gates).

**Interop gap found for prompt 05 (real, code-verified, not proof-by-absence):** attempted to
self-serve-pay the pilot endpoint with prompt 05's own `mppFetch()` buyer
(`api/_lib/bnb/mpp-buyer.js`) pointed at the running local server. `mppFetch` only attempts
payment when the initial unpaid response is `status === 402` and its JSON body's `accepts[]`
array contains a BNB (`eip155:56`/`97`) entry (`selectRequirement`). Reading
`api/x402/three-intel.js`'s handler confirms the unpaid-request branch calls the untouched
`x402Handler` (`networks: ['solana', 'base']`) and only adds `X-Accept-Payment-MPP` as a
side-channel header — the 402 body's `accepts[]` never contains an MPP/eip3009 BNB entry, only
whatever of solana/base is configured. This matches prompt 04's own spec text ("advertise MPP
support in the endpoint's response headers / discovery metadata" — a header, not a merged
accept), so it is NOT a defect against this prompt's DoD. But it does mean: **our own
`mppFetch()` cannot cold-discover-and-pay our own MPP-enabled endpoints today** — a caller has
to already know the route accepts MPP (e.g. from the header, from `docs/bnb-payments.md`, or
by calling `mppRequirements()`/`mppChallenge()` directly) and can't drive the generic
402-body-parsing auto-discovery path prompt 05 built for third-party MPP servers. Prompt 05
(or a follow-up polish prompt) should either (a) document this as the expected two-step
discovery flow, or (b) have `three-intel.js` merge an MPP accept into the unpaid `accepts[]`
array so first-contact auto-discovery works end-to-end against our own pilot — low effort,
same shape as the existing `buildAccept(NETWORK_BSC_MAINNET, ...)` entry already in
`x402-paid-endpoint.js`, just for the `eip3009`/b402 scheme instead of the `direct` contract
scheme. Did not make this change myself: it touches the shared `x402-paid-endpoint.js` 402-body
construction path used by every paid route, and the prompt's own spec text explicitly chose
the header-only design — changing it is a product decision for whoever owns prompt 05/06's
follow-up, not a silent scope-creep edit here.

**No code changes made this session** — the shipped implementation is correct, tested, and
matches its spec; this entry is independent re-verification plus the missing HTTP-layer proof
layer. `git status` confirms zero working-tree changes from this session (verification only,
via a locally-run server process + scratch scripts deleted after use, never committed).

**Gap for the owner (unchanged from the existing entry):** real on-chain b402 settlement
still needs `B402_BASE_URL`/`B402_CLIENT_ID`/`B402_ACCESS_TOKEN`/`B402_PRIVATE_KEY` (Binance
OnchainPay merchant console). Everything else — challenge, verify, pin, replay-guard,
fail-closed settle — is proven live end-to-end today, at both the library and HTTP layers.

**Status: DONE (re-verified).** No new commit from this entry beyond this PROGRESS append —
the code was already on `threews/main`.

---

## 2026-07-08 — Prompt 17 (latency-proof-page): independently re-verified live, no gaps found — DONE

**Starting state:** `/bnb-latency` was already fully built and committed to `threews/main` by
a concurrent agent before this session started — `api/_lib/bnb/latency-lanes.js`,
`api/bnb/latency.js`, `src/bnb-latency.js` + `src/bnb-latency-helpers.js`,
`pages/bnb-latency.html`, `tests/bnb-latency-helpers.test.js`, the `data/pages.json` /
`STRUCTURE.md` / `data/changelog.json` / `CHANGELOG.md` / `public/changelog.json` /
`public/features.json` / `public/sitemap` entries, and the `/bnb` hub card link — all present
at session start. Audited every artifact line-by-line against this prompt's spec and the
00-CONTEXT DoD rather than trusting it, per CLAUDE.md's "verify via git show" trap warning.

**Audit findings — matches spec exactly, no gaps:**
- `api/_lib/bnb/latency-lanes.js`: reuses `probeBlockTime` (01) for BNB verbatim (no
  duplication), adds `probeEvmLane` (Base/Ethereum, two-real-blocks-apart sampling off
  `erc8004-chains.js`'s already-probed public RPC lists) and `probeSolanaLane`
  (`getRecentPerformanceSamples`, slot cadence, not block — correctly labeled). Every probe
  fails closed to `{ ok:false }`, never throws, so `probeAllLanes()` (`Promise.all`) never
  rejects — one dead chain degrades one lane, not the whole response. Matches "four lanes,
  each ok:false on total failure" DoD line exactly.
- `api/bnb/latency.js`: 4s in-process cache + `stale-while-revalidate=15`, rate-limited via
  `limits.publicIp`, `wrap`/`cors`/`method` from the shared `http.js` pattern — same shape as
  `api/bnb/block-time.js` (prompt 01).
- `src/bnb-latency-helpers.js` (pure, no DOM/fetch): `blockIntervals`, `rollingAverageFromTimestamps`,
  `laneState`, `allLanesDown`, `sparklineBars`, `speedupRatio` — exactly the "feed block
  timestamps → correct rolling average" test surface the prompt asks for.
  `npx vitest run tests/bnb-latency-helpers.test.js` → **20/20 passed** (interval diffing,
  rolling-window averaging incl. clamped/over-large window, lane-state transitions incl. the
  "ok but zero sampled blocks still reconnecting" edge case, flat-series sparkline
  divide-by-zero guard, honest speedup-ratio null-guards).
- `src/bnb-latency.js`: 5s poll, `AbortSignal.timeout(8000)`, pauses polling on
  `visibilitychange` (tab hidden), synthesizes an all-down payload on total fetch failure
  (network/DNS dead, not just one chain) so the render path is identical to a partial outage,
  `prefers-reduced-motion` gates the tick-flash animation, `aria-live="polite"` on the number
  region. No hardcoded "0.45s" anywhere in the file — confirmed by reading every literal.
- `pages/bnb-latency.html`: reduced-motion media queries present at 3 separate animation
  sites (tick flash, spinner, sparkline bar transition); designed page-level error state
  (`#bnbl-page-error` + retry button) distinct from per-lane "reconnecting".

**Real live proof captured this session (not reused from the prior entry — fresh probe):**
Started `npm run dev` (port 3000 was already held by a concurrent agent's server on this
shared worktree — reused it rather than double-spawning; `GET /api/bnb/latency` on that live
process returns the real serverless handler, not a mock):

```
GET http://localhost:3000/api/bnb/latency →
{"lanes":[
  {"id":"bnb","chainId":56,"ok":true,"avgBlockTimeMs":450,"latestBlock":108703614,"sampleBlocks":60,"target":450,"measuredAt":"2026-07-08T01:56:42.383Z"},
  {"id":"base","chainId":8453,"ok":true,"avgBlockTimeMs":2000,"latestBlock":48343227,"sampleBlocks":30,"target":2000,"measuredAt":"2026-07-08T01:56:42.569Z"},
  {"id":"ethereum","chainId":1,"ok":true,"avgBlockTimeMs":12000,"latestBlock":25484701,"sampleBlocks":12,"target":12000,"measuredAt":"2026-07-08T01:56:42.437Z"},
  {"id":"solana","chainId":null,"ok":true,"avgBlockTimeMs":402.68,"latestBlock":431495536,"sampleBlocks":149,"target":400,"measuredAt":"2026-07-08T01:56:42.305Z"}
],"measuredAt":"2026-07-08T01:56:42.569Z"}
```

**BNB Chain live measured average observed: 0.45s** (`avgBlockTimeMs: 450`, sampled 60 real
blocks off the public BSC mainnet RPC, latest block 108,703,614) — matches 00-CONTEXT's
verified fact #3 exactly, live, not fabricated.

Drove the actual rendered page with a real headless Chromium (`playwright`, already a repo
dependency — `node_modules/playwright/index.js`) against `http://localhost:3000/bnb-latency`:
- Headline: `"0.45s avg block time"`, sub-line `"4.4× faster than Base's live average · 26.7×
  faster than Ethereum's live average"` — both ratios computed live from the two real
  measurements above (`2000/450 = 4.44`, `12000/450 = 26.7`), not marketing constants.
- All four lane cards rendered `state: "live"`: BNB 0.45s (60 blocks), Base 2.0s (30 blocks),
  Ethereum 12.0s (12 blocks), Solana 0.41s (148 slots) — each with its real latest block/slot
  number and sample count in the meta line.
- `#bnbl-updated` → `"Updated just now"`.
- Full-page screenshot captured (`/tmp/.../bnb-latency.png`, not committed): headline card,
  four-lane grid with sparkline bars, and the "How we keep this race honest" disclosure block
  (traces every number to `/api/bnb/latency` → `probeBlockTime`, explicitly disclaims
  20,000 TPS / BEP-670's 250ms target) all render correctly in dark theme.
- `pageerror`/`console.error` events captured: only Vite's own HMR WebSocket handshake failing
  through the devcontainer's port-forwarding proxy (`wss://...app.github.dev` 302, unrelated
  dev-tooling noise present on every page in this environment) — zero errors from
  `bnb-latency.js`, `bnb-latency-helpers.js`, or the API response path itself.

**No code changes made this session.** `git status` shows zero diff on any `bnb-latency`-named
file or its dependencies — the implementation was already correct, tested, and live-verified
against real RPCs. The only working-tree noise on unrelated files (OG meta-tag regens on
`pages/bnb.html`/`pages/bnb-latency.html`, various other in-flight concurrent-agent edits) was
left untouched, out of this prompt's blast radius, per the shared-worktree rule.

**Gaps for prompt 18 (world-e2e-demo):**
- No functional gap in this prompt's own scope — DoD fully met, nothing to hand off as a
  blocker.
- Opportunity, not a gap: prompt 18's on-chain-world demo could embed/link this page's proven
  "0.45s, live, real RPC" headline as its own speed-credibility anchor (same pattern the `/bnb`
  hub already uses) rather than re-deriving a fresh claim.
- Environment note for whoever runs prompt 18's own dev-server verification in this worktree:
  port 3000 is frequently already held by a concurrent agent's `npm run dev` — check with
  `curl -s localhost:3000/api/bnb/latency` before assuming you need to start a new one; Vite
  auto-increments to 3001+ if you do spawn a second instance.

**Status: DONE (re-verified, live).** No new commit needed beyond this PROGRESS append — the
page, API, tests, and docs were already correct and on `threews/main`.

---

## 2026-07-08 — Prompt 14 (world-moves-contract): real broadcast proof added — SHIPPED

**Starting state:** `contracts/src/WorldMoves.sol`, `contracts/test/WorldMoves.t.sol`, and
`contracts/script/DeployWorldMoves.s.sol` were already built and committed to `threews/main`
by a concurrent agent (commit `9e5a0c79b`) before this session started, with a
`DEPLOYMENTS.md` entry recording "built, compiled, unit-tested (19/19), NOT deployed —
BLOCKED on a funded deployer key" — the same honest pattern prompt 10 established. Read the
contract and tests line-by-line against `14-world-moves-contract.md` rather than trusting the
entry as-is: `move(worldId,x,y,z,facing)` is event-only (zero SSTORE), reverts (not clamps) on
out-of-bounds coordinates with a documented rationale (clamping would silently desync
client-predicted state), bounds are a signed 24-bit range `[-8_388_608, 8_388_607]`, and
`join`/`leave`/`checkpoint` all match spec. This matched the spec exactly — no code changes
needed.

**What this session added: installed Foundry (`foundryup`, not previously present in this
container — `forge`/`anvil`/`cast` 1.7.1), re-ran the compile/test suite for real, and closed
the "not deployed" gap the same way prompts 02/03 did — a real broadcast against an anvil fork
of live BSC testnet state (00-CONTEXT's mandated workaround when every faucet fails).**

**Compile + test proof (real, this session):**
```
$ forge build            → Compiler run successful! (workspace-wide)
$ forge test --match-path test/WorldMoves.t.sol -vv
Ran 19 tests for test/WorldMoves.t.sol:WorldMovesTest
  move() gas (call 1): 4800   move() gas (call 2): 4806   move() gas (call 3): 4803
  move() gas (warm):       4800    checkpoint() gas (warm): 7586
Suite result: ok. 19 passed; 0 failed; 0 skipped
$ forge test              → 6 suites, 94 tests passed, 0 failed, 0 skipped (full contracts/ workspace)
```
`move()` internal execution gas (~4,800) is comfortably under the 30k budget asserted in
`testGasPerMoveIsFlatAndLow`, flat across repeated calls (no growth from state accumulation —
by design, `move()` never touches storage), and `checkpoint()` (~7,586, one SSTORE) costs
meaningfully more, confirming the event-only/opt-in-storage split does its job.

**Real deploy-readiness re-confirmed against the LIVE public BSC testnet RPC** (dry-run, no
`--broadcast`): `forge script script/DeployWorldMoves.s.sol:DeployWorldMoves --rpc-url
https://data-seed-prebsc-1-s1.bnbchain.org:8545 -vvvv` simulated successfully — constructor
executes, `COORD_MIN`/`COORD_MAX` read back correctly, 566,068 gas estimated at 0.1 gwei ≈
0.0000566068 BNB.

**Public-testnet broadcast: BLOCKED on a funded deployer key** (same root cause as items
10/13/18 — `DEPLOYER_PK`/`BNB_TESTNET_DEPLOYER_KEY` absent from `.env`, `contracts/.env`,
`cast wallet list`, and shell env; checked presence only, no secret values read; the public
tBNB faucet is reCAPTCHA-gated with no programmatic path).

**Real broadcast proof obtained instead — anvil fork of LIVE BSC testnet state** (per
00-CONTEXT's decision table, the same technique prompts 02/03 used): `anvil --chain-id 97
--fork-url https://bsc-testnet.drpc.org` forked real testnet state at block `117848403`; a
fresh throwaway account (`0x5c04D686210421706E842A07e98B51396702e7AE`, key discarded after the
run) funded via `anvil_setBalance`; then the REAL, unmodified `DeployWorldMoves.s.sol` script
ran with `--broadcast` against the fork (same bytecode/script that would hit the public RPC —
only the endpoint differs):

- **Deploy tx:** `0x508db193ef6594c350751063657db3f9f831cb45ce590ea55f2c3759730b0710`, block
  `117848404`, status `success`, contract at `0x71Ddcb9865632Ca3c4325dE0E4a92Cc0065c8aaE`.
- **10 real `move()` transactions fired back-to-back** via `cast send` through the actual
  deployed contract, receipts fetched independently:

  | # | block | timestamp | gasUsed |
  |---|---|---|---|
  | 1 | 117848405 | 1783475882 | 26293 |
  | 2 | 117848406 | 1783475883 | 26293 |
  | 3 | 117848407 | 1783475884 | 26293 |
  | 4 | 117848408 | 1783475884 | 26293 |
  | 5 | 117848409 | 1783475885 | 26293 |
  | 6 | 117848410 | 1783475885 | 26293 |
  | 7 | 117848411 | 1783475885 | 26293 |
  | 8 | 117848412 | 1783475886 | 26305 |
  | 9 | 117848413 | 1783475887 | 26305 |
  | 10 | 117848414 | 1783475888 | 26305 |

  One block minted per tx; one full log decoded (`cast receipt ... logs`) and confirmed
  byte-for-byte against the call args: `Moved(worldId=1, player=0x5c04d686…702e7ae, x=10,
  y=-5, z=3, facing=36, blockNumber=117848405, timestamp=1783475882)`. `gasUsed` here is
  full transaction-level cost (21,000 base + calldata + 3-topic log), consistent with the
  ~4,800 internal-execution gas measured by `forge test` above.

**Honesty note (same discipline as prompt 10's entry):** the anvil block timestamps above are
wall-clock-paced by this session's sequential `cast send` calls, not BSC's real validator
cadence — this proves the `move()` flow, gas cost, and event shape against real forked
BSC-testnet EVM state, but it is NOT a re-measurement of the live 0.45s block time (that fact
is separately and already live-proven by `probeBlockTime()`, prompts 01/19, most recently
reconfirmed `avgBlockTimeMs: 450` on 2026-07-08). Full detail + deploy commands recorded in
`contracts/DEPLOYMENTS.md`'s WorldMoves section.

**Gap for prompt 15 (gasless-move-sender) / 16 (onchain-presence-mode):** both need a REAL
public BscScan-visible `WorldMoves` address to point a live client at — that still needs the
same funded-deployer-key unblock as 10/13/18 (owner action: fund a testnet EOA via
`bnbchain.org/en/testnet-faucet`, set `BNB_TESTNET_DEPLOYER_KEY`, then re-run the exact
`forge script ... --broadcast` command in `DEPLOYMENTS.md` unmodified — same script, same
bytecode, already dry-run-verified against the public RPC). Until then, 15/16 should build and
test against either the anvil-fork pattern above or a mocked contract address, and swap in the
real address the moment it exists — same "code complete, address pending" shape as prompt 10
left for prompt 11. One additional note for 15 specifically: `sendGasless()` in
`api/_lib/bnb/megafuel.js` hard-rejects an empty/undefined `tx.to` (`bad_tx`), so it cannot
gaslessly relay a `move()` call to a not-yet-deployed contract's constructor, but it CAN
gaslessly relay `move()`/`join()`/`leave()`/`checkpoint()` calls once `WorldMoves` has a real
address (`tx.to` = the deployed contract) — no changes needed to `megafuel.js` for 15 to work,
confirmed by reading its `toPaymasterTx`/`sendGasless` signature validation directly.

**Status: DONE (code + tests + real fork-broadcast proof). Public testnet deploy BLOCKED on
funded deployer key — owner action needed, identical unblock step as items 10/13/18.**
