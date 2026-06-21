# P61 · Migrate upgrade authority to multisig & define key rotation

> **Workstream:** On-chain & contracts · **Priority:** P1 · **Effort:** M · **Depends on:** none (do before/alongside P60)

## Before you start
1. Read `CLAUDE.md` (rules that override defaults) and `STRUCTURE.md` (on-chain section).
2. three.ws monorepo: EVM contracts via Foundry in `contracts/`; Solana programs via Anchor in `contracts/agent-invocation/` and `contracts/skill-license/`. EVM SDK addresses live in `agent-payments-sdk/src/evm/`. ERC-8004 deploy metadata in `contracts/` + `api/_lib/erc8004-chains.js`.
3. **$THREE is the only coin** — CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`. Never reference any other coin/token.

## Context
Authority over the platform's upgradeable on-chain programs currently sits on **single deployer/hot keys** — a custody risk before scaling.

**Solana programs (BPF, upgradeable — the upgrade authority can replace program bytecode):**
- `skill_license` — program `EdngSwxmDktyrr4phwGEZnCXEoQ27vgnBtowjhKa7Wr8`. `contracts/skill-license/DEPLOYMENT.md` documents three keys: the **program keypair** (`SKILL_LICENSE_PROGRAM_KEYPAIR`), the **deploy/upgrade authority** (`~/.config/solana/skill-license-deployer.json` → `SKILL_LICENSE_DEPLOY_AUTHORITY`), and the **minter** (`SKILL_LICENSE_MINTER_KEY`, the backend wallet authorized for `mint_skill_license`/`revoke_skill_license`). The doc ends with a `solana program set-upgrade-authority` snippet (migration **pending**) and notes the minter is rotatable on-chain via `set_minter` (admin-only) and that production should init the marketplace with a **separate** admin authority so a cold key can rotate the minter.
- `agent_invocation` — program `AgEntJDMi1A7UadCoYcx6Fm3gusNk8SHLCi7vSUa4Zfo` (`contracts/agent-invocation/Anchor.toml` cluster `devnet`, wallet `~/.config/solana/agent-invocation-deployer.json`). Non-trust-bearing (emits events only) but still upgradeable — same upgrade-authority risk.

**EVM ownership (related, same theme):** `AgentPayments` owner (set via `AGENT_PAYMENTS_OWNER`) and the ERC-8004 registry owners are currently the deployer EOA. `specs/SECURITY.md` governance roadmap: "Migrate to a 3-of-5 Safe on Base before opening public registration."

## Problem / opportunity
A single hot key can upgrade `skill_license` bytecode or rotate the minter. Leak or loss = total compromise (or bricking) of the program. There is a documented `set-upgrade-authority` step but no executed migration and no written rotation runbook for the minter/admin/validator secrets. Moving upgrade authority to a multisig/cold key and writing a tested rotation procedure removes the single point of failure that any auditor or integrator will flag first.

## Mission
Migrate the upgrade authority of both Solana programs to a multisig (e.g. Squads) or cold key, document the exact procedure and the cosigner set, and define a concrete rotation runbook for every authority/minter secret (Solana minter via `set_minter`, EVM owner via `transferOwnership`, validator key). Mirror the EVM-side intent by capturing the registry/`AgentPayments` owner → Safe plan.

## Scope
**In scope:** Standing up (or wiring to) a Solana multisig (Squads recommended); transferring `skill_license` + `agent_invocation` upgrade authority to it on devnet first, then mainnet; a `contracts/UPGRADE_AUTHORITY.md` runbook (or additions to each program's `DEPLOYMENT.md`); a `KEY_ROTATION.md` covering minter (`set_minter`), EVM owner (`transferOwnership`), validator key (`scripts/erc8004/provision-validator-key.mjs`), and program upgrade authority; recording new authority addresses in the deploy docs.

**Out of scope:** Changing program logic (no `lib.rs` edits — `skill_license` already exposes `set_minter`/admin-authority separation; use it). Executing the EVM 3-of-5 Safe migration (document the plan + commands; the Safe ceremony is its own task). Deploying new programs.

## Implementation guide
1. **Inventory current authorities (read-only first).**
   ```bash
   solana program show EdngSwxmDktyrr4phwGEZnCXEoQ27vgnBtowjhKa7Wr8 --url mainnet-beta
   solana program show AgEntJDMi1A7UadCoYcx6Fm3gusNk8SHLCi7vSUa4Zfo  --url devnet
   ```
   Record the current `Upgrade Authority` for each, and the current `marketplace.minter` / admin `authority` for `skill_license` (read the `Marketplace` account). Confirm against `DEPLOYMENT.md`.
2. **Stand up the multisig.** Use Squads (the standard Solana multisig). Create the vault with the intended cosigner set (recommend ≥ 2-of-3 to start, ≥ 3-of-5 to match the EVM roadmap). The Squads **vault PDA** becomes the new upgrade authority. Record the multisig address + members (roles, not key material) in the runbook.
3. **Migrate upgrade authority on devnet first.**
   ```bash
   solana program set-upgrade-authority \
     <PROGRAM_ID> \
     --new-upgrade-authority <SQUADS_VAULT_PDA> \
     --url devnet
   ```
   Then verify, redeploy a no-op upgrade *through the multisig* to prove the new authority signs, and only then repeat on mainnet for `skill_license` (and devnet→mainnet as appropriate for `agent_invocation`). The set-upgrade-authority transfer must be signed by the **current** authority — coordinate so that key is available for the one-time transfer, then retired.
4. **Separate the `skill_license` admin from the minter (production hardening).** Per `DEPLOYMENT.md`, production should initialize the marketplace with a distinct cold **admin authority** so the minter can be rotated by a key that is never on a server. If the marketplace was bootstrapped with `admin == minter`, document the remediation (the admin signs `set_minter` to point at the backend minter; admin itself moves to cold custody). Use `buildInitializeMarketplaceIx({ authority, minter })` / `set_minter` from `api/_lib/skill-license-onchain.js`.
5. **Write the rotation runbook (`KEY_ROTATION.md`).** One section per secret, each with trigger (scheduled / suspected compromise), exact command, verification, and who-can-execute:
   - **Solana minter** (`SKILL_LICENSE_MINTER_KEY`): generate new keypair → admin signs `set_minter(new_minter)` → update the Vercel secret → re-run `scripts/skill-license-smoke.mjs` to confirm minting works with the new key. (No redeploy needed; on-chain instruction exists.)
   - **Program upgrade authority**: `set-upgrade-authority` from the multisig to a new authority (only if cosigner set changes / compromise).
   - **EVM `AgentPayments` owner**: `transferOwnership(<newOwner>)` (OpenZeppelin `Ownable`) → verify `owner()` → record in `DEPLOYMENTS.md`.
   - **EVM registry owners**: same `transferOwnership` toward the 3-of-5 Safe per `specs/SECURITY.md` roadmap (document commands + the per-chain list; mark execution as the follow-up task).
   - **Validator key** (`VALIDATOR_PRIVATE_KEY`): rotate via `scripts/erc8004/provision-validator-key.mjs`, `addValidator(new)` / `removeValidator(old)` per chain; align with `specs/SECURITY.md` V4.
6. **Record new authorities.** Update `contracts/skill-license/DEPLOYMENT.md` and `contracts/agent-invocation` docs with the multisig as the new upgrade authority (and the admin/minter split), and add/point to the new runbook from `contracts/DEPLOYMENTS.md`. Keep all key material out of the repo — names and roles only.
7. **Changelog?** Custody migration is security infra users care about. Append a holder-readable `data/changelog.json` entry (tags: `security`, `infra`) — e.g. "On-chain program upgrade authority moved to a multisig; key-rotation procedures published" — then `npm run build:pages`. (If you judge it purely internal, skip per CLAUDE.md; security custody generally qualifies.)

## Definition of done
- [ ] Contract tests pass (`forge test` / `anchor test`); changes documented.
- [ ] Deployed addresses recorded + bytecode-verified where applicable; SDK address files updated.
- [ ] User-visible/holder-relevant → `data/changelog.json` entry + `npm run build:pages`.
- [ ] `git diff` self-reviewed.

## Verification
- `solana program show <PROGRAM_ID>` reports the **multisig vault** as `Upgrade Authority` for both programs (devnet proven, mainnet for `skill_license`).
- A test upgrade (no-op) executes only after multisig threshold approval; an upgrade attempt signed by the old deployer key fails.
- `skill_license` minter rotation rehearsed end-to-end on devnet via `scripts/skill-license-smoke.mjs` (re-runnable, exits non-zero on failure) — admin signs `set_minter`, new minter mints successfully.
- EVM: `cast call <AgentPayments> "owner()(address)"` matches the documented owner; `transferOwnership` commands in the runbook are copy-paste correct (dry-run with `cast call`/`estimate`).
- `KEY_ROTATION.md` has an executable, verified path for every secret; no secret value appears in the repo (`git diff` review).

## Guardrails
- No mocks. Real testnet first, then mainnet. Never paste a real third-party mint/creator/holder address; use $THREE CA or a synthetic placeholder.
- Never commit private keys/secrets. Stage explicit paths; re-check `git status`. Push only when asked, to BOTH remotes.
- Treat upgrade authority and minter keys as secrets; document rotation. The one-time `set-upgrade-authority` transfer needs the current authority key present — use it for the transfer, then retire it; never leave it as a live fallback.
