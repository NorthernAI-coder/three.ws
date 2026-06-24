# 34 · Solana / Base Parity & Cross-Chain Correctness

## Mission
Where the platform supports both chains, behavior must be correct and consistent — Solana as the
default, Base/EVM as a well-behaved secondary — with no silent divergence.

## Context
- Solana is the platform-wide default; Base/EVM secondary (team memory). Cross-chain SDKs:
  `sdk/`, `solana-agent-sdk/`, `agent-payments-sdk/`, `agent-protocol-sdk/`.
- Parity tooling: `npm run verify:solana`, `npm run verify:onchain`, `npm run smoke:onchain`.

## Tasks
1. **Default correctness:** Solana is the default everywhere a chain is chosen implicitly; Base/EVM is
   opt-in and clearly labeled; no surface silently defaults to the wrong chain.
2. **Feature parity matrix:** for each cross-chain capability (pay, send, name resolution, identity),
   document what's supported on each chain and ensure the UI only offers what actually works.
3. **Parity verifiers:** `verify:solana` / `verify:onchain` / `smoke:onchain` pass; fix divergences.
4. **Address/name handling:** correct validation + resolution per chain (SNS `*.threews.sol` on
   Solana, ENS on EVM); no cross-chain address confusion.
5. **Errors:** chain-specific failures (RPC, congestion, wrong network) handled with clear messaging.
6. **Docs:** a cross-chain support matrix in `docs/` so users + integrators know what works where.

## Acceptance
- Solana default honored platform-wide; Base/EVM opt-in + correctly scoped.
- Parity verifiers pass; UI offers only working capabilities per chain; address/name handling correct.
- Cross-chain support matrix documented.

---
### Operating rules — read CLAUDE.md + STRUCTURE.md first. Solana is the default network. No mocks of chain logic. $THREE only (`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`); settlement in USDC. Stage explicit paths; never `git add -A`. Don't commit `api/*.js` bundles. User-visible change → `data/changelog.json` + `npm run build:pages`. Push both remotes when asked; never pull from `threeD`. DoD = CLAUDE.md checklist.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "prompts/34-solana-base-parity.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
