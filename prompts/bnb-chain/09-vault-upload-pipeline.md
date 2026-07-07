# 09 — Vault upload pipeline (encrypt → Greenfield)

Read `prompts/bnb-chain/00-CONTEXT.md` first, then `/workspaces/three.ws/CLAUDE.md`.
**Prereqs: 07** (`greenfield.js` read client) and **08** (`vault-crypto.js` + manifest spec).
Run whichever is missing first.

## Why
A seller lists a 3D model: we encrypt it (08), create/ensure a Greenfield bucket, upload the
ciphertext object via a Storage Provider, write the manifest, and return refs the vault
contract (10) will gate. This is where the "storage you control from a contract" story
becomes real bytes on Greenfield testnet.

## Build
- Extend `api/_lib/bnb/greenfield.js` (or a sibling `greenfield-write.js`) with write helpers
  using `@bnb-chain/greenfield-js-sdk`: `ensureBucket(name)`, `createObject(bucket, name, bytes, { contentType, visibility:'private' })` (uploads via SP; remember from 00-CONTEXT that
  object CREATE from BSC is pending — creation goes through the Greenfield SDK/SP path, not a
  BSC contract, and settles async: poll for the object to become readable).
- `api/bnb/vault-upload.js` — server endpoint. Input: a GLB (multipart or a URL to one of our
  own generated GLBs — reuse `api/forge*.js` outputs), plus `{ priceAtomic, sellerAddress }`.
  Steps: fetch GLB → `encryptGlb` (08) → `ensureBucket` → `createObject(ciphertext)` → build
  the manifest per `specs/vault-manifest.md` → store the manifest (as its own small Greenfield
  object or in our existing DB/KV — pick what the codebase already uses and say which) →
  return `{ manifestRef, glbObjectRef, sha256, status:'stored'|'pending' }`.
- The wrapped content key is NOT uploaded in the clear — it's released only at unlock (11).
  Store the seller-side key material so 11 can re-wrap it to the buyer (or use a
  deterministic re-encryption the contract authorizes — document the exact choice).

## States
Bucket already exists → reuse, don't fail. SP upload interrupted → resumable or clean retry;
never leave a half-object referenced by a manifest. Object still mirroring → return
`status:'pending'` with a poll hint, not a lie that it's ready. Oversized GLB → enforce a
sane max, typed 413.

## Tests (`tests/bnb-vault-upload.test.js`)
- End-to-end with mocked SP: GLB in → manifest out matching the spec, ciphertext object
  referenced, key NOT present in the manifest.
- `ensureBucket` idempotent (second call no-ops).
- `pending` surfaced when the mocked mirror hasn't settled.
- Synthetic GLB + synthetic addresses.

## Definition of done
Inherit 00-CONTEXT DoD. Additionally:
- [ ] REAL testnet proof: upload one encrypted GLB to a Greenfield testnet bucket; paste the
      bucket name, object name, the GreenfieldScan link, and the manifest JSON. Confirm the
      object is NOT publicly decryptable (download ciphertext, show it's not a valid GLB
      without the key).
- [ ] Docs deferred to 13; note the manifest-storage choice you made in PROGRESS.
