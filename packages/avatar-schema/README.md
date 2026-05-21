# @three-ws/avatar-schema

JSON Schema and validator for **three.ws on-chain avatar manifests** — the
canonical, hash-anchored format any cross-chain client can use to resolve and
verify an avatar.

This is the on-chain equivalent of Ready Player Me's
[content-validation-schemas](https://github.com/readyplayerme/content-validation-schemas):
a tiny, dependency-light spec package that lets any third-party viewer,
indexer, or marketplace integrate with three.ws avatars without pulling in the
full runtime.

## Install

```bash
npm i @three-ws/avatar-schema
```

## Use

```js
import { validate, assertValid } from '@three-ws/avatar-schema';

const manifest = await (await fetch('https://three.ws/avatars/nicholas.eth.json')).json();

const result = validate(manifest);
if (!result.valid) {
  console.error(result.errors);
}

// Or throw on first failure:
assertValid(manifest);
```

The raw JSON Schema is exported separately so you can bind it to any other
validator (Python `jsonschema`, Go `gojsonschema`, etc.):

```js
import schema from '@three-ws/avatar-schema/schema';
```

Or by absolute URL: <https://three.ws/schema/avatar.v1.json>.

## What's in a manifest

An on-chain avatar manifest binds a 3D mesh (and optional animations and
accessories) to an owner identity on a specific chain. Every binary asset is
referenced by content-addressed URI plus SHA-256, so clients can verify they
fetched the exact bytes the manifest signer attested to.

| Field | Required | Purpose |
|---|---|---|
| `schemaVersion` | yes | Always `1` for this version of the schema |
| `id` | yes | CAIP-10 account id or `*.eth` / `*.ws` / `*.sol` name |
| `name` | yes | Human-readable name |
| `mesh` | yes | URI + SHA-256 + format (`glb`/`gltf`/`vrm`) |
| `skeleton` | yes | One of `avaturn`/`mixamo`/`rpm`/`vrm-humanoid`/`custom` |
| `animations` | no | Pointer to an animation-manifest URI + SHA-256 |
| `accessories` | no | Array of slotted accessories (hat, glasses, etc.) |
| `traits` | no | NFT-style flat key/value attributes |
| `owner` | yes | `{ chain, address }` — current on-chain holder |
| `creator` | no | Original creator (omit if same as owner) |
| `createdAt` | yes | ISO 8601 UTC timestamp |
| `signature` | no | EIP-712 / ed25519 / secp256k1 signature over the manifest |

See [examples/basic.json](examples/basic.json) for a fully-populated example.

## Why this exists

Ready Player Me operates a single avatar service. There is no need for an
open, verifiable manifest format because RPM is the source of truth.

three.ws is decentralized: avatars are owned by wallets on multiple chains and
rendered by viewers the avatar owner doesn't control. A common schema lets:

- **Viewers** validate an avatar before rendering it, instead of trusting any
  URL they're handed.
- **Indexers** rebuild a global view of all three.ws avatars by scanning
  on-chain registrations and pulling manifests.
- **Marketplaces** verify ownership and accessory composition without
  bespoke per-vendor logic.
- **Cross-chain bridges** carry the same identity across EVM, Solana, and
  beyond using CAIP-2 / CAIP-10 ids.

## Versioning

The schema uses an integer `schemaVersion`. Breaking changes get a new file
(`avatar.v2.json`), a new const, and a new published major version of this
package. Old versions remain valid forever.

## Test

```bash
npm test
```

Tests use Node's built-in `node:test`. No extra runner required.

## License

Apache-2.0 — see [LICENSE](LICENSE).
