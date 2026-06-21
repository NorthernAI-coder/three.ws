# P60 · External contract audit package

> **Workstream:** On-chain & contracts · **Priority:** P1 · **Effort:** L · **Depends on:** P59 (AgentPayments deployed/recorded)

## Before you start
1. Read `CLAUDE.md` (rules that override defaults) and `STRUCTURE.md` (on-chain section).
2. three.ws monorepo: EVM contracts via Foundry in `contracts/`; Solana programs via Anchor in `contracts/agent-invocation/` and `contracts/skill-license/`. EVM SDK addresses live in `agent-payments-sdk/src/evm/`. ERC-8004 deploy metadata in `contracts/` + `api/_lib/erc8004-chains.js`.
3. **$THREE is the only coin** — CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`. Never reference any other coin/token.

## Context
The platform's on-chain surface has strong in-house tests but **no external audit**. The contracts under audit:

**EVM (Foundry, `contracts/`, solc 0.8.24, optimizer 200):**
- `src/AgentPayments.sol` (406 LOC) — agent-token payment/buyback engine; `ReentrancyGuard` + `Ownable`; owner = global buyback authority; per-agent authority for withdraw/config; router allow-list; invoice replay guard. Tests: `test/AgentPayments.t.sol` (16).
- `src/IdentityRegistry.sol` (292) — ERC-8004 identity NFT. Live on mainnet at `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` (CREATE2). Tests: `test/IdentityRegistry.t.sol` (11).
- `src/ReputationRegistry.sol` (214) — one score per (reviewer, agent). Live at `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63`. Tests (7).
- `src/ValidationRegistry.sol` (163) — validator-attested pass/fail; testnet live `0x8004Cb1BF31DAf7788923b405b754f57acEB4272`, mainnet pending. Tests (7).

**Solana (Anchor, `contracts/`):**
- `agent-invocation/src/lib.rs` (129) — program `AgEntJDMi1A7UadCoYcx6Fm3gusNk8SHLCi7vSUa4Zfo`. Non-trust-bearing: emits `SkillInvoked`; both agent accounts are constrained PDAs (`[AGENT_SEED, authority]`), length-bounds on `skill_name`/`parameters`.
- `skill-license/src/lib.rs` (464) — program `EdngSwxmDktyrr4phwGEZnCXEoQ27vgnBtowjhKa7Wr8`. Singleton `Marketplace` (admin `authority` + rotatable `minter`); `mint_skill_license` locks supply at 1 and removes mint authority (keeps freeze authority for revoke); `set_minter`, `revoke_skill_license` (freeze-based), `burn_skill_license`. Deploy/key model in `skill-license/DEPLOYMENT.md`.

Existing threat material: `specs/SECURITY.md` (vectors V1–V10 with status, several **OPEN** — notably V8 NSFW moderation, V4 validator key expiry) and its governance roadmap (registry owner is still the deployer EOA; migrate to a 3-of-5 Safe before public registration).

## Problem / opportunity
In-house tests prove the happy path and known edge cases, but external capital and serious integrators expect a third-party audit. Auditors lose days reconstructing scope, architecture, invariants, and known risks from raw source. A clean, complete audit package shortens the engagement, lowers cost, and surfaces gaps before the auditor (or an attacker) does.

## Mission
Assemble a hand-off-ready external audit package: scope manifest, architecture overview, invariant catalog, known-risk register, test/coverage report, and threat model — plus a fixes tracker the team and auditor share. Do not change contract logic; this is documentation + measurement.

## Scope
**In scope:** A new `docs/audit/` (or `contracts/audit/`) package: `SCOPE.md`, `ARCHITECTURE.md`, `INVARIANTS.md`, `KNOWN_RISKS.md`, `THREAT_MODEL.md` (consolidating `specs/SECURITY.md` V1–V10 + Solana/EVM-specific vectors), `COVERAGE.md` (real `forge coverage` + `anchor test` output), and `FINDINGS.md` fixes tracker. Pin exact commit, compiler versions, deployed addresses (from `contracts/DEPLOYMENTS.md`).

**Out of scope:** Fixing findings (that becomes follow-up tasks tracked in `FINDINGS.md`); engaging the auditor; changing contract behavior; new features.

## Implementation guide
1. **Pin the artifact.** Record the audit commit hash, solc `0.8.24`/optimizer 200 (from `foundry.toml`), Anchor/Rust toolchain versions, and the live + pending deployed addresses (pull from `contracts/DEPLOYMENTS.md`, `api/_lib/erc8004-chains.js`, and `agent-payments-sdk/src/evm/addresses.ts` after P59).
2. **`SCOPE.md`** — table of every file in scope with LOC and one-line purpose: the four EVM `src/*.sol`, the two Anchor `lib.rs`. Explicitly mark out-of-scope: SDK TS, `api/`, `ThreeWSFactory.sol` (already verified, trivial CREATE2 wrapper), `ThreeWSPayments.sol` (separate x402 receiver). Note which contracts are already live mainnet vs. testnet-only vs. undeployed.
3. **`ARCHITECTURE.md`** — for each contract: roles/authorities, state layout, external entrypoints, trust boundaries, and the off-chain components that call it (e.g. `AgentPayments` ↔ `EvmAgent`; `ValidationRegistry` ↔ platform validator key + `recordValidation`; `skill_license` ↔ backend `SKILL_LICENSE_MINTER_KEY`). Draw the AgentPayments money flow: `acceptPayment → distributePayments → {buybackTrigger | withdraw}`.
4. **`INVARIANTS.md`** — enumerate what must always hold, e.g.:
   - AgentPayments: `paymentVault + Σ(buybackVault, withdrawVault distributed)` conserves received funds; an invoice ID settles at most once (`isInvoicePaid`); `buybackTrigger` only ever calls allow-listed routers and leaves zero standing allowance; only `authority` withdraws; balance-diff accounting never over-credits (fee-on-transfer safe).
   - skill_license: supply locked at exactly 1 post-mint; only `marketplace.minter` mints; only admin `authority` rotates minter; revoke uses retained freeze authority only.
   - Registries: one ReputationRegistry score per (reviewer, agent); only allow-listed validators write ValidationRegistry. Map each invariant to the test(s) that exercise it (or flag "no direct test").
5. **`THREAT_MODEL.md`** — fold in `specs/SECURITY.md` V1–V10 verbatim by reference, then add contract-level vectors auditors expect: reentrancy on the three `nonReentrant` paths, owner-key compromise blast radius (AgentPayments owner can trigger arbitrary buybacks on allow-listed routers), router allow-list poisoning, Solana account-substitution / missing-signer / arithmetic, IDL/`declare_id` drift. State each vector's current mitigation and residual risk.
6. **`KNOWN_RISKS.md`** — the honest register: registry owner is still the deployer EOA (governance roadmap → 3-of-5 Safe); upgrade authority migration pending (see the multisig task); validator keys have no on-chain expiry (V4 OPEN); NSFW moderation hook unwired (V8 OPEN). Disclose these up front so the auditor doesn't "discover" them as findings.
7. **`COVERAGE.md`** — run and paste real numbers:
   ```bash
   cd contracts && forge coverage --report summary
   cd contracts/agent-invocation && anchor test
   cd contracts/skill-license && anchor test
   ```
   Note any contract/branch below a target threshold and list the missing cases as pre-audit test debt.
8. **`FINDINGS.md`** — empty tracker with the format the auditor will fill: ID, severity (Critical/High/Medium/Low/Info), title, location, status (Open/Fixed/Acknowledged), fix commit. Pre-seed it with the self-identified items from `KNOWN_RISKS.md` marked `Acknowledged`.
9. **Changelog?** This is internal audit prep — **no `data/changelog.json` entry** unless a user-visible change ships (per CLAUDE.md, internal-only chores get none). If a fix from `FINDINGS.md` later changes behavior, that fix's task adds the entry.

## Definition of done
- [ ] Contract tests pass (`forge test` / `anchor test`); changes documented.
- [ ] Deployed addresses recorded + bytecode-verified where applicable; SDK address files updated.
- [ ] User-visible/holder-relevant → `data/changelog.json` entry + `npm run build:pages`.
- [ ] `git diff` self-reviewed.

## Verification
- `forge test` and both `anchor test` suites green; `forge coverage --report summary` produces the numbers pasted in `COVERAGE.md`.
- Every contract listed in `SCOPE.md` exists at the stated path/LOC; every address in the package resolves on-chain (`cast code` / `solana program show`).
- Cross-check: every `specs/SECURITY.md` vector appears in `THREAT_MODEL.md`; every OPEN status appears in `KNOWN_RISKS.md`.
- A peer skim of the package can reconstruct scope + invariants without opening the source.

## Guardrails
- No mocks. Real testnet first, then mainnet. Never paste a real third-party mint/creator/holder address; use $THREE CA or a synthetic placeholder.
- Never commit private keys/secrets. Stage explicit paths; re-check `git status`. Push only when asked, to BOTH remotes.
- Treat upgrade authority and minter keys as secrets; document rotation. The audit package names key *roles and rotation procedures*, never key material.
