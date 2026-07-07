# 10 — GreenfieldVault.sol (pay → PermissionHub grant)

Read `prompts/bnb-chain/00-CONTEXT.md` first, then `/workspaces/three.ws/CLAUDE.md`.
**Prereqs: 01** (chain constants for hub addresses). Run it first if missing. Independent of
07–09 at the contract level (they meet at prompt 11).

## Why
The heart of the "only on BNB Chain" claim: a BSC smart contract that, on payment, grants the
buyer a Greenfield **object permission** cross-chain via PermissionHub — on-chain logic gating
decentralized storage. No equivalent on Ethereum/Base/Solana. Build + deploy the contract to
BSC testnet.

## Build — `contracts/GreenfieldVault.sol` (Foundry; see `contracts/README.md`)
- Uses the live Greenfield hub interfaces. Reference `bnb-chain/greenfield-contracts` for the
  `PermissionHub`, `IGnfdAccessControl`, and cross-chain interfaces (add them under
  `contracts/lib/` or interface stubs — real ABIs, not invented). Hub addresses per network:
  mainnet from 00-CONTEXT; testnet from the greenfield-contracts README (read it).
- Functions:
  - `list(bytes32 objectId, uint256 price, address seller)` — seller registers a for-sale
    encrypted object (the one uploaded in 09), the vault must control its permissions.
  - `buy(bytes32 objectId)` payable / or pull-payment in a token — on sufficient payment,
    call `PermissionHub.createPolicy(...)` granting the buyer read permission on that object,
    and record the sale. Handle the PermissionHub cross-chain **relayer fee** (these calls
    require paying the cross-chain fee — read the interface; get it right).
  - `revoke` path for refunds/expiry via `deletePolicy` (design a sane policy: e.g. grants are
    permanent on purchase; if you add expiry, make it explicit).
  - Emit `Listed`, `Purchased(objectId, buyer, policyId)` events the API (11) indexes.
- Follow `contracts/README.md` build/test/deploy conventions; add a deploy script
  `contracts/script/DeployGreenfieldVault.s.sol`.

## States
Underpayment → revert with reason. Buying an unlisted object → revert. Cross-chain fee not
covered → revert clearly (don't half-execute). Double-buy → idempotent or explicit re-grant,
your choice, documented. Re-entrancy → guarded.

## Tests (`contracts/test/GreenfieldVault.t.sol`, `forge test -vv`)
- `list` then `buy` with exact payment emits `Purchased` and calls `createPolicy` (mock the
  hub in-test via a mock PermissionHub).
- Underpayment reverts; unlisted reverts; missing cross-chain fee reverts.
- Re-entrancy attempt blocked.

## Definition of done
Inherit 00-CONTEXT DoD. Additionally:
- [ ] `forge test -vv` green; paste output.
- [ ] REAL deploy to BSC testnet; record address in `contracts/DEPLOYMENTS.md` (bytecode-
      verified style with today's date). Paste the deploy tx hash + BscScan link in PROGRESS.
- [ ] Execute one real `buy` on testnet that triggers a real `PermissionHub.createPolicy`
      cross-chain call; paste the BSC tx hash AND the resulting Greenfield permission change
      (GreenfieldScan) once it settles. This cross-chain grant IS the campaign's signature proof.
- [ ] `data/changelog.json`: entry (tags `feature`, `infra`) — "On-chain gated 3D asset vault on BNB Chain".
