# 08 — Encrypted-GLB envelope + vault manifest spec

Read `prompts/bnb-chain/00-CONTEXT.md` first, then `/workspaces/three.ws/CLAUDE.md`.
**Prereqs: none.** Pure crypto + spec work; runs fully standalone.

## Why
The vault stores 3D models (GLB) so that even though bytes live on a public-ish Storage
Provider, only a paying/authorized buyer can decrypt them. We need a portable encryption
envelope + a manifest format, decided ONCE and specced, so the upload (09), contract (10),
and unlock (11) prompts all agree. Keeping this backend-agnostic hedges the Greenfield
platform-risk from 00-CONTEXT.

## Build
1. `api/_lib/bnb/vault-crypto.js` — real crypto, no hand-rolled primitives (CLAUDE.md: never
   reinvent crypto). Use Node `crypto` (AES-256-GCM) + an established lib for key wrapping if
   needed. Export:
   - `encryptGlb(glbBytes) → { ciphertext, contentKey, iv, authTag, sha256OfPlaintext }` —
     AES-256-GCM with a random per-object content key.
   - `wrapKey(contentKey, recipientPubKey)` / `unwrapKey(wrapped, recipientPrivKey)` — so the
     content key can be delivered to an authorized buyer without exposing it publicly (ECIES
     over secp256k1 to match EVM keys — use a vetted lib, e.g. `eciesjs`, if present/addable).
   - `decryptGlb({ ciphertext, contentKey, iv, authTag }) → glbBytes`, verifying the auth tag
     and the plaintext sha256.
2. `specs/vault-manifest.md` — the wire contract: the JSON manifest stored alongside each
   vault object `{ version, glbObjectRef:{bucket,object}, encryption:{alg:'AES-256-GCM',iv,authTag}, sha256, priceAtomic, sellerAddress, contract:{address,chainId}, createdAt }`, the
   key-delivery flow, and the exact byte layout of the envelope. This is a contract other
   code depends on — precise, versioned.

## States
Tampered ciphertext / wrong key → GCM auth-tag failure surfaces as a typed decrypt error,
never silent garbage. Wrong-size key → reject before use.

## Tests (`tests/bnb-vault-crypto.test.js`)
- Round-trip: `encryptGlb` → `decryptGlb` returns identical bytes; sha256 matches.
- Tamper one ciphertext byte → decrypt throws typed auth error.
- `wrapKey`/`unwrapKey` round-trips with a secp256k1 keypair; wrong key fails.
- Use a tiny synthetic GLB fixture (a few bytes is fine).

## Definition of done
Inherit 00-CONTEXT DoD. Additionally:
- [ ] Paste a real round-trip proof (encrypt→upload-agnostic→decrypt of a real small GLB) in PROGRESS with the sha256 matching.
- [ ] `specs/vault-manifest.md` complete and referenced by name from prompts 09/10/11 expectations.
- [ ] Dependency check: if you add `eciesjs` (or similar), pin `^` semver, justify in commit msg (CLAUDE.md open-source-first + pinning rule).
