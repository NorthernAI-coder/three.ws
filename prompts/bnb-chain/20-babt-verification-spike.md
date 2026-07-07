# 20 — BABT sybil-gating verification spike (settle the open question)

Read `prompts/bnb-chain/00-CONTEXT.md` first, then `/workspaces/three.ws/CLAUDE.md`.
**Prereqs: none.** Research-first spike; ships a feature ONLY if the capability verifies real.

## Why
BABT (Binance Account Bound Token) — a non-transferable on-chain token tied to a KYC'd Binance
account — was a headline "unique to BNB" candidate that our research could NOT confirm
(00-CONTEXT refuted/unverified list). Before anyone builds sybil-resistance on it, settle
whether it's real, live, and queryable by a third-party BSC contract in 2026. Truth first;
code only if warranted.

## Do — verify (this half is mandatory)
1. Find the real BABT contract on BSC mainnet (SBT-706 / "Binance Account Bound"). Confirm the
   deployed address via BscScan + an `eth_getCode` check (use `chains.js`). Record the address
   and the interface (is it ERC-721-ish? a `balanceOf`/`tokenIdOf` gate? non-transferable?).
2. Determine, concretely: can an arbitrary third-party BSC contract read "does address X hold a
   BABT?" on-chain, cheaply, today? Is there a testnet deployment (for our normal testnet-first
   flow) or is it mainnet-only? Any usage terms/restrictions from Binance?
3. Write the finding into `prompts/bnb-chain/PROGRESS.md` AND a short
   `docs/bnb-babt-findings.md`: real / not-real, live address, how to gate on it, limitations,
   and whether it beats Base/Ethereum/Solana sybil-resistance options (Gitcoin Passport, World
   ID, etc.) — honest comparison.

## Build — ONLY if step 1–2 confirm it's real and third-party-queryable
- `api/_lib/bnb/babt.js` — `hasBabt(address)` reading the real contract via `chains.js`
  (mainnet read; note if no testnet exists). Typed result `{ address, holdsBabt, tokenId?, source }`.
- `GET /api/bnb/babt-check?address=` — free endpoint exposing it, for agents/apps that want a
  KYC-backed uniqueness signal. Handle unknown/invalid address, contract-unreachable, and the
  "no testnet" caveat honestly in the response.
- Tests (`tests/bnb-babt.test.js`): `hasBabt` maps a mocked `balanceOf>0` → true, `=0` → false;
  endpoint validates input; graceful when the contract read fails.

## If NOT real / not third-party-queryable
Do NOT build a fake. Ship only the `docs/bnb-babt-findings.md` verdict + PROGRESS note closing
the open question, and update `00-CONTEXT.md`'s refuted list with the confirmed reason. That
is a complete, valuable outcome.

## Definition of done
Inherit 00-CONTEXT DoD. Additionally:
- [ ] The open question is definitively answered with a real on-chain check (paste the address
      + `eth_getCode`/`balanceOf` probe result), regardless of whether code shipped.
- [ ] If shipped: real proof of `hasBabt` against a known BABT holder address (paste it).
- [ ] If not shipped: `docs/bnb-babt-findings.md` explains exactly why, with sources.
- [ ] `data/changelog.json`: entry ONLY if a user-visible endpoint shipped (tag `feature`, `security`).
