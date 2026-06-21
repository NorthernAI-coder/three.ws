# 33 · On-Chain Contracts — Review & Test

## Mission
The on-chain programs (agent identity, skill licenses, agent invocation) must be correct, tested, and
safe before they secure real value.

## Context
- `contracts/` (Foundry, ERC-8004 agent identity), `contracts/skill-license/` (Anchor: each skill =
  1/1 SPL NFT + `SkillLicense` PDA; backend `api/_lib/skill-license-onchain.js`),
  `contracts/agent-invocation/` (Anchor: verifiable A2A invocation events; SDK `agent-protocol-sdk/`).
- Parity verifiers: `npm run verify:onchain`, `npm run smoke:onchain`, `npm run verify:solana`.

## Tasks
1. **Test coverage:** unit + integration tests for each program — minting, ownership/transfer, access
   checks, invocation event verification, failure/permission cases. Run the Foundry + Anchor suites.
2. **Security review:** access control, signer checks, PDA derivation, reentrancy/replay (where
   relevant), arithmetic safety, upgrade authority. Document trust assumptions.
3. **Backend parity:** the DB-backed access checks and the on-chain `SkillLicense` checks agree;
   `verify:onchain` / `smoke:onchain` / `verify:solana` pass.
4. **Deployment:** documented, reproducible deploy with addresses recorded; IDLs current and committed
   where the app depends on them.
5. **Gas/cost:** reasonable compute/rent; no pathological costs.
6. **Coin policy:** nothing references a non-$THREE token; test fixtures use $THREE CA or a clearly
   synthetic placeholder — never a real third-party mint.

## Acceptance
- Foundry + Anchor test suites pass with meaningful coverage incl. failure cases.
- Security review documented; backend↔on-chain parity verified by the smoke/verify scripts.
- Deploy reproducible + addresses/IDLs recorded; fixtures coin-policy clean.

---
### Operating rules — read CLAUDE.md + STRUCTURE.md first. No real third-party mints in tests/fixtures — use $THREE (`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`) or a synthetic placeholder. No mocks of on-chain logic in integration tests. Stage explicit paths; never `git add -A`. Don't commit `api/*.js` bundles. Push both remotes when asked; never pull from `threeD`. DoD = CLAUDE.md checklist.
