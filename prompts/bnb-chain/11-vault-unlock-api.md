# 11 — Vault API: list, status, unlock

Read `prompts/bnb-chain/00-CONTEXT.md` first, then `/workspaces/three.ws/CLAUDE.md`.
**Prereqs: 09** (upload pipeline + manifests) and **10** (deployed vault contract). Run
whichever is missing first — this prompt wires them together and must not stub either.

## Why
The API layer the vault UI (12) calls: browse listings, check a buyer's access, and — after
an on-chain purchase — deliver the decryption key so the buyer can download + decrypt the GLB.
This is where payment (contract), storage (Greenfield), and crypto (envelope) meet.

## Build — `api/vault/[action].js` (or discrete files under `api/vault/`)
Free plain-handler pattern for reads; the unlock step verifies on-chain state, not a paywall.
- `GET /api/vault/list` — enumerate listed objects from the contract's `Listed`/`Purchased`
  events (index via viem `getLogs` through `chains.js`) joined with manifest metadata
  (name, price, seller, thumbnail if any). Handle 0 listings (empty state data).
- `GET /api/vault/status?objectId=&buyer=` — is this buyer's purchase on-chain? Is the
  Greenfield permission grant settled yet? Return `{ purchased, policySettled, state:
  'unlisted'|'available'|'pending-grant'|'unlocked' }`. The `pending-grant` state (cross-chain
  async from 00-CONTEXT) MUST be represented honestly.
- `POST /api/vault/unlock` — body proves the caller controls `buyer` (a signed message) AND
  the contract shows they purchased + the Greenfield policy is settled. Only then release the
  content key: re-wrap it to the buyer's pubkey (`vault-crypto.wrapKey`) and return
  `{ wrappedKey, glbObjectRef, manifest }`. The buyer downloads ciphertext via 07's
  `downloadObject` (their granted permission authorizes the SP fetch) and decrypts locally.
  NEVER return the raw content key or the plaintext GLB from the server.

## States
Not purchased → 403 with "purchase required" + the buy call info. Purchased but grant still
mirroring → 200 `state:'pending-grant'` + poll hint (not an error). Bad signature → 401.
Object delisted → 410. Every state distinct and honest.

## Tests (`tests/bnb-vault-api.test.js`)
- `list` builds entries from mocked logs + manifests; empty → `[]` with empty-state shape.
- `status` returns `pending-grant` when purchase log present but mocked policy unsettled.
- `unlock` refuses without a valid purchase (403) and without a valid signature (401);
  succeeds only when both hold, returning a wrapped (not raw) key.
- Synthetic addresses/objects.

## Definition of done
Inherit 00-CONTEXT DoD. Additionally:
- [ ] REAL end-to-end slice on testnet: an address that actually bought via prompt 10 calls
      `unlock`, receives the wrapped key, downloads ciphertext from Greenfield, decrypts to a
      valid GLB. Paste each step's real output (tx hash, status JSON, sha256 of decrypted GLB
      matching the manifest). Prove a NON-buyer gets 403.
- [ ] Docs deferred to 13; note any manifest/keystore assumptions in PROGRESS.
