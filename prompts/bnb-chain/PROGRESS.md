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
