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
