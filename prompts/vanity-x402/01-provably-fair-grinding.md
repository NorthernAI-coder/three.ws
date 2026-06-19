# Task 01 — Provably-fair, trustless vanity grinding

> Read [00-README-orchestration.md](./00-README-orchestration.md) first — it holds
> the foundation map, house rules, and closeout protocol you must follow.

## The wedge (why this is gamechanging)

Every vanity-address service on earth asks you to **trust the operator**: trust
that they generated your key with real randomness, that they didn't keep a copy,
that they didn't grind 10,000 candidates and hand you the one whose key they
secretly logged. There is no proof. You just hope.

**We make it provable.** A buyer of a three.ws vanity wallet can verify, after the
fact and with open-source tooling, that:

1. the key was generated **fresh** from real entropy the server committed to
   *before* it knew the buyer's pattern (no precomputed rainbow table of keys);
2. the secret was delivered **only** to the buyer (sealed to their X25519 key — the
   server provably discarded the ephemeral secret);
3. the address actually satisfies the pattern and the grind difficulty was honest.

No competitor offers this. "Trustless vanity" is a category we can own.

## What to build

A verifiable grinding protocol layered onto [api/x402/vanity.js](../../api/x402/vanity.js)
(extend it or add a sibling `api/x402/vanity-verifiable.js`; keep the existing
endpoint working). Plus a standalone **verifier** (CLI + a `/vanity/verify` web
page) and a `verify()` export in the SDK.

### Protocol (commit–reveal + sealed delivery + signed receipt)

- **Server identity key.** A long-lived ed25519 signing key for the grinder service
  (store the secret with [secret-box.js](../../api/_lib/secret-box.js); publish the
  public key at a stable URL, e.g. `/.well-known/three-vanity.json`, and pin it in
  the SDK). This signs receipts.
- **Per-request entropy commitment.** Before grinding, draw a random 32-byte
  `serverSeed`, compute `commitment = SHA-256(serverSeed)`, and bind it into the
  response/receipt. Mix `serverSeed` with the buyer-supplied `clientSeed` (and the
  request nonce) into the CSPRNG that seeds each candidate keypair — so neither
  party alone controls the output, and the server committed before grinding.
- **Sealed delivery.** Require (or strongly default to) `sealTo` so the secret is
  ECIES-sealed to the buyer (reuse [sealed-envelope.js](../../src/solana/vanity/sealed-envelope.js)).
  The receipt records the sealed envelope's `epk`/recipient so the buyer can prove
  *this* envelope was for *their* key.
- **Signed receipt.** The endpoint returns a `receipt` object the service signs:
  `{ commitment, clientSeed, requestNonce, pattern, address, difficulty, attempts,
  durationMs, sealedRecipient, sealedEpk, ts }` plus `serverSeed` (revealed) and the
  service signature. The buyer keeps it.
- **Verifier.** Given the receipt + the opened secret, independently confirm:
  `SHA-256(serverSeed) === commitment`; the address derives from the revealed secret;
  the address matches the pattern; the seed-mixing reproduces a candidate stream
  consistent with the claim; the signature verifies against the pinned service key.

Make the seed-mixing + candidate derivation **deterministic and documented** so the
verifier is exact, not approximate. Write it down in a short `PROTOCOL.md`.

### Surfaces to wire (100%, real)

- Endpoint(s) returning the receipt; reuse x402 verify/settle + idempotency.
- SDK: `verifyVanityReceipt(receipt, openedSecret)` and a thin client that requests
  → opens the seal → verifies, all in one call. Ship in [solana-agent-sdk/](../../solana-agent-sdk).
- CLI verifier under `scripts/` (e.g. `scripts/verify-vanity-receipt.mjs`) that takes
  a receipt JSON and prints a green/red audit.
- A `/vanity/verify` web page: paste a receipt (+ optionally the sealed secret and
  your X25519 private key, processed **entirely client-side**) → see each check pass
  with a clear explanation. Designed loading/empty/error/success states. A "what does
  this prove?" explainer. Link it from the vanity wallet UI.
- `/.well-known/three-vanity.json` publishing the service public key + protocol
  version + scheme ids.

## Hard requirements

- Real ed25519 signing/verification via `@noble/curves`; real SHA-256 via
  `@noble/hashes`/WebCrypto. No hand-rolled crypto. Pin every step with vectors.
- The buyer's X25519 private key and the opened secret must **never** leave the
  browser on the verify page — verification is local. Say so in the UI.
- The service signing secret is custodial: encrypt at rest, never log, never return.
- Honest difficulty: the receipt's `difficulty`/`expectedAttempts` must match the
  real probability model in [validation.js](../../src/solana/vanity/validation.js).
- Backwards compatible: the plain `/api/x402/vanity` keeps working unchanged.

## Definition of done

- [ ] Protocol implemented end-to-end: commit → seeded grind → sealed delivery →
      signed receipt → independent verification, all on real crypto.
- [ ] Endpoint pays via x402 (verify-grind-settle order preserved), idempotent.
- [ ] SDK `verify()` + one-call client; CLI verifier; `/vanity/verify` page (every
      state designed, fully client-side verification, reachable from the UI).
- [ ] `/.well-known/three-vanity.json` live; service key pinned in SDK + verifier.
- [ ] `PROTOCOL.md` documents the scheme precisely enough to reimplement.
- [ ] Tests with fixed vectors: commitment, seed-mix determinism, signature,
      address↔secret, pattern match, and a **negative** test (tampered receipt /
      wrong serverSeed / mismatched address all FAIL verification).
- [ ] Changelog entry (plain language: "prove we never kept your key"); `npm run
      build:pages` clean.
- [ ] No fake data; real on-chain address checks; no console errors; `git diff`
      self-reviewed.

## Closeout

Run the DoD + self-review. Then the **improvement pass**: can you also let the buyer
verify *non-custody* on-chain (e.g. anchor the commitment in a transaction memo or an
attestation so the proof is timestamped and public)? Can the verify page generate a
shareable "verified trustless" badge/OG card? Add what raises the bar. Summarize,
then **delete this file** (`prompts/vanity-x402/01-provably-fair-grinding.md`).
