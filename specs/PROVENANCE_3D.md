# Verifiable 3D Provenance — signed content credentials for AI-generated 3D

**Version `threews.provenance.3d.v1`** · Open specification · License: CC0 / public domain

> Pure core: `api/_lib/provenance-3d.js`. Free verify: `GET /api/provenance` and the `verify_provenance` MCP tool. Paid anchor: `anchor_provenance` MCP tool. Guide: [`docs/provenance.md`](https://github.com/nirholas/three.ws/blob/main/docs/provenance.md).

## The problem

As AI-generated 3D floods the web, **authenticity** becomes the scarce thing. A content credential answers: who created this model, from what prompt, by which model, when, and its full lineage — and proves the bytes weren't altered since. This is C2PA-style provenance for 3D: anti-deepfake by construction. Verification is public and free; the credential hash is anchored on Solana so anyone can confirm it independently.

The **verify path carries zero payment, wallet, or coin surface**, so it drops into crypto-free app stores. Only the **anchor** (the on-chain write) is a paid/Claude-track action.

## The credential

A credential is a JSON object over the GLB's content hash. Fields are fixed so the signed bytes are stable:

```jsonc
{
  "version": "threews.provenance.3d.v1",  // required
  "glbSha256": "<64-hex sha256 of the GLB bytes>", // required — the content hash
  "createdAt": "2026-07-08T00:00:00.000Z", // required — ISO-8601
  "assetId": "…",     // optional — platform asset id
  "creator": "…",     // optional — account or wallet
  "prompt": "…",      // optional — the generating prompt
  "model": "TRELLIS", // optional — the generation model
  "provider": "nvidia", // optional — the generation provider
  "lineage": ["<hash-or-id>", …] // optional — parent chain (ties to Spatial MCP lineage / prompt 09)
}
```

### Envelope (stored + verified)

The credential is stored and transmitted inside a signed envelope:

```jsonc
{
  "credential":    { … the object above … },
  "signature":     "<base58 ed25519 signature over the canonical credential>",
  "issuer":        "<base58 ed25519 public key of the three.ws issuer>",
  "credentialHash":"<sha256 hex of the canonical credential>",  // the anchored value
  "anchor": { "signature": "<solana tx sig>", "cluster": "devnet" }  // present once anchored
}
```

### Canonicalization

The signed bytes are the credential serialized with **recursively sorted keys** (`canonicalize` in the pure core), so signing and verifying produce identical bytes regardless of key order. The signature is ed25519 over those bytes; `credentialHash` is the sha256 of those bytes.

## Anchoring (paid, Claude/web3 track)

`anchor_provenance(glb_url, …)`:
1. Fetches the GLB (SSRF-guarded) and computes `glbSha256`.
2. Builds the credential and signs it with the three.ws issuer key (`ATTEST_AGENT_SECRET_KEY`, ed25519).
3. Writes `credentialHash` into a **Solana SPL Memo** transaction (`{ k, h, glb }`) signed by the issuer — the on-chain anchor.
4. Stores the full envelope in R2 at `provenance/<glbSha256>.json`.
5. Returns the anchor tx + `explorerUrl`.

Real hashing, real signature, real on-chain write. A missing issuer key or unfunded issuer wallet returns a coded error — never a fabricated transaction.

## Verifying (free, both tracks)

`verify_provenance(glb_url | hash)` and `GET /api/provenance?src=<glbUrl>`:
1. Recompute the GLB content hash (or accept a known hash).
2. Load the stored envelope for that hash.
3. **Verdict** (`decideVerdict` in the pure core):
   - `verified` — the signature verifies against the issuer **and** the served bytes match the signed `glbSha256`.
   - `tampered` — a credential exists but the signature fails **or** the bytes don't match the signed hash.
   - `unknown` — no credential is on record.
4. If anchored, best-effort confirm the tx on-chain (a down RPC never turns `verified` into an error) and include the anchor + explorer link.

The response exposes only the documented public fields — no session/job ids, no wallet-of-caller, no payment fields.

## Verify badge

The three.ws viewer (`/viewer?src=…`) calls `GET /api/provenance` and shows a designed badge: **✓ Verified · three.ws** (links to the anchor), **⚠ Tampered**, or **Unverified**.

## Conformance & tamper model

- Changing **one byte** of the GLB changes `glbSha256` → `tampered`.
- Changing **any credential field** after signing breaks the signature → `tampered`.
- A credential signed by a key other than the advertised issuer → `tampered` (signature fails against the issuer).

These are unit-tested in `tests/provenance-3d.test.js`.

## Versioning

`version` is the contract. Additive fields ship a new version string; verifiers select behavior by it. CC0 — reimplement and extend freely.
