# 13 — Vault end-to-end proof + final docs

Read `prompts/bnb-chain/00-CONTEXT.md` first, then `/workspaces/three.ws/CLAUDE.md`.
**Prereqs: 12** (and transitively 07–11). This prompt proves the whole track works together
and writes the definitive docs. If any prereq is incomplete, finish it first — this prompt
exists to catch exactly that.

## Why
Tracks that ship in pieces drift. One agent runs the entire vault flow on real BSC/Greenfield
testnet, captures immutable proof, and writes the doc + spec that let anyone reproduce it.

## Do — full E2E on testnet (no mocks)
1. Generate a real GLB (reuse our free forge lane — `api/forge*.js` / the `generate-3d-model`
   flow) so the asset is genuinely ours.
2. Upload+encrypt it (09) → Greenfield testnet. Record bucket/object/manifest.
3. List it on the vault contract (10) from a seller wallet.
4. From a SECOND wallet, buy it (12/contract) — use the gasless path if available.
5. Watch the cross-chain PermissionHub grant settle; unlock (11); decrypt; render.
6. Confirm a THIRD wallet (no purchase) is correctly denied.
Capture every tx hash, object ref, and status transition.

## Build — `docs/bnb-vault.md`
Zero-context reader. What the vault is, the exact "only on BNB Chain" mechanism (BSC contract
→ cross-chain PermissionHub grant on Greenfield, per 00-CONTEXT verified facts), the full
architecture (encrypt→store→gate→unlock), a reproducible walkthrough with the real testnet
addresses from the E2E run, and the honest caveats (Greenfield deprioritized; content bytes
off-chain via SPs; grants async). Link from `docs/start-here.md`. Update `specs/vault-manifest.md`
if the E2E surfaced any drift from prompt 08's draft.

## Definition of done
Inherit 00-CONTEXT DoD. Additionally:
- [ ] PROGRESS entry with the COMPLETE captured E2E trail: seller tx, buyer tx (with mode
      sponsored/self-pay), Greenfield object + manifest refs, the PermissionHub policyId, the
      unlock response, the decrypted-GLB sha256 matching the manifest, and the denied-third-
      wallet 403. This is the campaign's Track-B proof-of-life — make it airtight.
- [ ] `docs/bnb-vault.md` complete; every address/hash in it is real and from your run.
- [ ] `data/changelog.json`: entry (tag `feature`) — "Encrypted 3D vault live end-to-end on BNB Chain testnet".
- [ ] If ANY step couldn't complete on real testnet, say exactly which and why — do not paper over it.
