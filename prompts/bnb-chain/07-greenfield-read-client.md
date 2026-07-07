# 07 — Greenfield read client (SP + chain reads)

Read `prompts/bnb-chain/00-CONTEXT.md` first, then `/workspaces/three.ws/CLAUDE.md`.
**Prereqs: 01** (`api/_lib/bnb/chains.js`). Run it first if missing.

## Why
Track B (pay-to-unlock 3D vault) needs to read Greenfield: list buckets/objects, fetch object
metadata, check permissions, and download bytes from a Storage Provider. Build the read layer
first, in isolation, against Greenfield testnet — so upload (09) and unlock (11) compose it.

## Build — `api/_lib/bnb/greenfield.js`
- Use `@bnb-chain/greenfield-js-sdk` (open-source-first). Read Greenfield testnet
  chain/SP/RPC endpoints from the SDK docs or `bnb-chain/greenfield-contracts` — never invent.
- Export read-only helpers: `listObjects(bucket)`, `getObjectMeta(bucket, object)`,
  `headBucket(bucket)`, `getObjectPermissions(bucket, object, principal)` (does this account
  or group have read access?), and `downloadObject(bucket, object, { authForPrivate })` which
  streams bytes from an SP. `authForPrivate` carries the signature/permission proof for
  private objects (public objects need none).
- All reads default to Greenfield testnet; parameterize network.

## States
Object doesn't exist → typed not-found. Private object, no permission → typed
`forbidden` (this is the expected "locked" state the vault relies on — surface it cleanly,
don't treat as an error). SP unreachable → try the next SP if the SDK exposes a list, else
typed 503. Async-mirror lag → callers may see `pending`; expose it, don't mask.

## Tests (`tests/bnb-greenfield-read.test.js`)
- `getObjectMeta` shape asserted against a mocked SP response.
- `getObjectPermissions` returns `false` for a principal not in the policy (mocked).
- `downloadObject` on a forbidden private object → typed `forbidden`, not a throw-500.
- No real third-party bucket names in fixtures — synthetic.

## Definition of done
Inherit 00-CONTEXT DoD. Additionally:
- [ ] Real proof: against Greenfield testnet, read a public object's metadata you created (or
      any public testnet object) and paste the real JSON. Prove the `forbidden` path by
      reading a private object without permission and pasting the typed error.
- [ ] Internal lib — JSDoc on each export; docs deferred to prompt 13.
