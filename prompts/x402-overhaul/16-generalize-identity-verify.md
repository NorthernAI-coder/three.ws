# 16 — Generalize On-Chain Identity Verify → cross-platform trust primitive

Read `prompts/x402-overhaul/00-CONTEXT.md` first, then `/workspaces/three.ws/CLAUDE.md`.
Independent work order — completes fully on its own.

## The problem
`api/x402/onchain-identity-verify.js` only verifies three.ws agent_ids against three.ws's own
index. Useless to outside agents. A verification primitive must work for any claimed
identity↔address link.

## Agent use-case (name it in the docs)
Agent A is told "I am the deployer of contract/mint X" or "I own wallet W / ENS name / agent
id". Before trusting or paying, A calls one endpoint that returns cryptographic/on-chain
evidence the claim is real: deploy tx, signer, ownership proof, ENS/SNS resolution, ERC-8004
registration. A cross-platform trust check agents will pay for.

## Build — upgrade `api/x402/onchain-identity-verify.js` (keep route + paid model)
- Input: `{ claim: { identity, address, chain } }` where identity may be an agent_id, ENS/SNS
  name, wallet, or ERC-8004 id; address is the mint/contract/wallet the claim asserts control
  of.
- Verify with REAL sources: contract deploy tx + deployer (RPC/explorer), mint
  authority/creator (Solana), ENS/SNS resolution (`_lib/` resolvers or the ens_sns MCP), token
  ownership, ERC-8004 registry, three.ws `meta.onchain` index when relevant. Reuse existing
  helpers; generalize.
- Output: `{ claim, verified:true|false|'unverifiable', evidence: [{ kind, ref, detail }],
  method, ts }`. Never assert `verified:true` without concrete on-chain evidence.
- Update `BAZAAR` description + `api/wk.js` discovery mirror + run the verify script.

## States
Insufficient data → `verified:'unverifiable'` + what's missing, never a false positive.
Chain/explorer down → degrade + caveat. Bad input → 400. Never 500.

## Tests
Each identity type resolves; true vs false vs unverifiable branches; no-evidence never returns
true; discovery mirror matches live. Synthetic/`$THREE` fixtures.

## Definition of done
Inherit 00-CONTEXT DoD + gates. Plus:
- [ ] Real verifications (a true case + a false/unverifiable case) captured in PROGRESS.md.
- [ ] `scripts/verify-x402-discovery.mjs` passes; paste output.
- [ ] `docs/` trust-primitive doc updated (same doc as prompt 15 if present — extend, don't
      duplicate) with the evidence model + use-case.
- [ ] `data/changelog.json` (tags: `feature`,`improvement`) — "On-chain identity verification
      now works cross-platform for any claim".
