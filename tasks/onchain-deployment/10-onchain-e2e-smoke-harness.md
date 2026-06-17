# Task: On-Chain End-to-End Smoke Harness

## Context

The on-chain stack spans EVM (ERC-8004 identity/reputation/validation, x402 on Base)
and Solana (pump.fun launch/trade, agent-payments, SNS, agent_invocation). Each piece
is tested in isolation, but **nothing exercises the whole path in one pass**, so a
regression in the seam between two systems (e.g. a registry address drift, a broken
pin endpoint, an unfunded relayer) is only discovered in production. This is the
verification net that makes "100% wired" provable and keeps it that way.

This is the capstone — it depends on tasks 01, 02, 03, 06, 09 being done (or it will
report exactly which are not).

## Goal

A single CI-runnable script, `scripts/onchain-smoke.mjs`, that exercises the full
on-chain agent lifecycle against testnet/devnet and exits non-zero on any break, with
a clear per-step report.

## Files to Read First

- `src/erc8004/agent-registry.js`, `src/erc8004/registration-json.js` — register flow
- `src/erc8004/validation-recorder.js` — validation record
- `contracts/src/ReputationRegistry.sol` — reputation read
- `api/pump/[action].js` — launch-prep/confirm, buy-prep/confirm
- `api/x402/pay-by-name.js` — x402 resolve + pay
- `scripts/verify-onchain-parity.mjs` (from task 05) — reuse for the address check
- `scripts/onchain-smoke.mjs` — does not exist yet; you create it

## What to Build / Do

Write `scripts/onchain-smoke.mjs` that runs these steps in order, each reporting
PASS/FAIL/SKIP with timing, and a final summary:

1. **Address parity** — invoke the task-05 parity check; fail fast on drift.
2. **EVM register (Base Sepolia)** — pin a synthetic GLB, `register()`,
   `setAgentURI()`, confirm `tokenURI()` round-trips and the card validates against
   `3d-agent-card.schema.json` with a matching `model.sha256`.
3. **EVM validation** — record a validation attestation for the test agent, read it
   back via `getLatestByKind`.
4. **EVM reputation** — submit feedback from a second synthetic signer, read
   `getReputation()` and assert the count incremented.
5. **Solana launch (devnet)** — `launch-prep` → `launch-confirm` for a synthetic mint,
   assert a `pump_agent_mints` row.
6. **Solana trade (devnet)** — `buy-prep` → `buy-confirm`, assert a confirmed signature.
7. **x402 pay-by-name (devnet/testnet)** — resolve a synthetic `@user`/`.sol` name and
   run a `mode=prep` payment build (don't broadcast real value unless funded).
8. **Solana agent_invocation (devnet)** — `invokeSkill()` between two synthetic agent
   authorities, assert the `SkillInvoked` event.

Each step is independently `--only=<step>` runnable and skippable via env so CI can
run the read-only subset without funded signers. Print a final table.

## Constraints

- Testnet/devnet only by default; a `--mainnet-readonly` mode may do read-only checks
  (parity, bytecode, tokenURI resolve) but must never broadcast value on mainnet.
- Synthetic signers/mints only — never a real third-party wallet or token; `$THREE`
  or `THREEsynthetic1111…` placeholders only.
- A missing-funded-signer step SKIPs with a clear reason (not FAIL) so the read-only
  subset stays green in CI; funded runs turn SKIP into PASS/FAIL.
- Reuse existing endpoints/SDKs — do not reimplement registration or trading logic.
- Self-cleanup where cheap (release test SNS claims, etc.); document what it leaves behind.

## Success Criteria

- `node scripts/onchain-smoke.mjs` runs all 8 steps and prints a clear PASS/FAIL/SKIP table.
- With funded testnet/devnet signers, all steps PASS end-to-end.
- Without funded signers, read-only steps PASS and value steps SKIP (CI stays green).
- It catches an injected regression (e.g. temporarily wrong registry address → step 1 FAIL).
- Wired into CI as a non-blocking-but-reported job (or blocking for the read-only subset).
- Documented in `tasks/onchain-deployment/00-PLAN.md` as the standing verification net.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/onchain-deployment/10-onchain-e2e-smoke-harness.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
