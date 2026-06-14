# Task: Wire ValidationRegistry Attestation Into Registration

## Context

ValidationRegistry stores hashes of off-chain proofs (glTF validation, schema
checks) signed by an allow-listed validator. The contract, the recorder
(`src/erc8004/validation-recorder.js`), and the panel UI exist, but nothing
**automatically validates an agent's GLB and records an on-chain attestation when
the agent is registered**. The validator allow-list is also maintained by hand.
Result: `supportedTrust: ["validation"]` is advertised in the 3D Agent Card but no
agent actually carries a validation attestation. Depends on task 01 (mainnet
ValidationRegistry must exist).

## Goal

When an agent is registered (or bound) on-chain, its GLB is automatically run through
glTF validation and a signed attestation is recorded on-chain, surfaced as a
"validated" badge on the profile.

## Files to Read First

- `src/erc8004/validation-recorder.js` — `reportPassed()`, `hashReport()`,
  `recordValidation()`; throws if ValidationRegistry not deployed (fixed by task 01)
- `contracts/src/ValidationRegistry.sol` — `recordValidation()`, `getLatestByKind()`,
  validator allowlist, `kind` strings ("glb-schema", "a2a-card")
- `src/erc8004/agent-registry.js` — registration flow to hook into (post-`setAgentURI`)
- `api/_lib/onchain.js` — server resolver (add a "read latest validation" path)
- `api/model-check.js` / `api/x402/model-check.js` — existing glTF validation endpoint
  (reuse it — do NOT write a second validator)

## What to Build / Do

1. **Provision the platform validator key.** A dedicated Solana/EVM key that signs
   attestations; allow-list it on each ValidationRegistry chain (coordinate with task
   01 step 6). Store via env, never commit.

2. **After a successful registration/bind**, kick a best-effort validation:
   - Run the agent's GLB through the existing glTF validator (`api/model-check`).
   - Build the report, `hashReport()` it, pin the full report to IPFS/R2.
   - Call `recordValidation(agentId, passed, proofHash, proofURI, kind:"glb-schema")`
     signed by the platform validator key.

3. **Add a server read path** in `api/_lib/onchain.js` (or a small `api/v1/agents`
   addition) that returns the latest validation for an agent via `getLatestByKind`,
   so the frontend doesn't need a wallet to display the badge.

4. **Render a "Validated" badge** on the agent profile when a passing attestation
   exists (with link to the proof report + the on-chain record). Designed states:
   validated, validation-failed (show what failed), not-yet-validated, pending.

5. **Make validation re-runnable** — re-validating after a GLB update records a fresh
   attestation; the badge reflects the latest.

## Constraints

- Reuse the existing glTF validator endpoint — one source of truth for "is this GLB valid."
- Validation is best-effort and async: a validation failure must NOT block or revert
  the registration itself (the agent is still registered; it's just unvalidated).
- Per spec: a passing validation report does NOT override the sha256 byte-check — both
  matter; surface them independently.
- Only allow-listed keys can record; handle the "not allow-listed on this chain" case
  with a clear ops error, not a silent skip.

## Success Criteria

- Registering/binding an agent results in an on-chain validation attestation within
  a short window (verify via `getLatestByKind`).
- The agent profile shows a "Validated" badge backed by a real on-chain record + a
  resolvable proof report.
- A failing GLB records a failing attestation and shows the failure reason — the
  agent is still registered.
- No second glTF validator was introduced.
- Changelog entry (tag: feature/security).
