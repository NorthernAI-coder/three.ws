# Task: End-to-end devnet smoke harness + platform-wide Definition-of-Done sweep

## Context

Tasks 01–09 build the full agent-wallet flow: wallet by default (01), fund via
QR/copy (02), trade from the agent wallet (03/04), snipe (05/06), AMM exits (07),
x402 pay (08), and withdraw + limits (09). This final task proves the **whole loop**
works end-to-end and runs a single Definition-of-Done pass across every new surface
so nothing ships half-wired. It is the gate before the epic is called done.

Known funding constraint (memory `pump-devnet-smoke`, `three-ws-self-registration`):
devnet airdrops have been rate-limited and platform signers have been unfunded, so
the harness must run **simulate-first** and degrade gracefully to clearly-reported
"blocked: needs funded devnet signer" rather than failing or faking a result.

## Goal

A re-runnable `scripts/agent-wallet-smoke.mjs` that exercises
create → fund → trade → snipe → x402 → withdraw against real devnet/testnet state
(simulate where live funding is unavailable, with honest blocked-reporting), plus a
completed DoD sweep (states, a11y, mobile, dead paths, console-clean, typecheck,
tests, changelog) across the new wallet hub and its tabs.

## Files to Read First

- All of `tasks/agent-wallet-trading/` (the epic README + tasks 01–09) — the success
  criteria each task promised
- `scripts/pump-devnet-smoke.mjs` (memory `pump-devnet-smoke`) — existing devnet smoke
  pattern (simulate-only PASS, funding-gated live) to mirror
- `scripts/onchain-smoke.mjs` precedent (`tasks/onchain-deployment/10`) — CI-runnable
  smoke harness shape
- The endpoints built by this epic: `POST /api/agents/:id/trade` (03),
  `…/wallet/withdraw` (09), `api/sniper/strategy.js` (06), `api/x402-pay.js` (08),
  `GET /api/agents/:id/solana` (balance)
- `CLAUDE.md` "Definition of done" + "Self-review protocol"
- `scripts/page-audit.mjs` (memory `page-audit-tooling`) + the console-audit baseline
  (memory `console-audit-baseline`) — for the UI sweep + distinguishing real errors
  from known non-bug noise

## What to Build / Do

1. **End-to-end smoke script** `scripts/agent-wallet-smoke.mjs` covering, in order:
   1. Create an agent → assert a Solana wallet is provisioned (`walletReady`,
      `solana_address`).
   2. Fund: assert the deposit panel's address/QR/`solana:` URI resolve; on
      devnet, fund the address (or report blocked) and assert the balance reads back.
   3. Trade: `POST /api/agents/:id/trade` buy then sell a synthetic/devnet mint;
      assert confirmed signatures + balance/position changes (simulate if unfunded).
   4. Snipe: arm a strategy via `POST /api/sniper/strategy`; assert it persists and
      (with the worker reachable) records a simulated fill.
   5. x402: pay a test endpoint from the agent wallet; assert settlement from the
      agent's balance (not the platform wallet).
   6. Graduation: assert a graduated position exits via AMM (07) rather than parking.
   7. Withdraw: sweep SOL/SPL back out; assert confirmed signature + balances.
   - Each step prints PASS / BLOCKED(reason) / FAIL. Live steps degrade to BLOCKED
     with the exact missing credential/funding, never to a fake PASS.
2. **DoD sweep across the new UI** (wallet hub + Deposit/Trade/Snipe/Pay/Withdraw
   tabs): use `scripts/page-audit.mjs` + a real browser pass to verify, for each
   surface: designed loading/empty/error/populated states; hover/active/focus on
   every interactive element; mobile-responsive at 320/768/1440; semantic HTML +
   ARIA + keyboard nav + focus rings; no dead buttons/links; no console
   errors/warnings (filtered against the known-noise baseline). File a punch-list and
   fix every real issue found (or hand specific items back to the owning task).
3. **Build gates**: confirm `npm run build`, `npm run typecheck`, and `npm test` are
   all clean across the epic's changes; confirm every user-visible change has a
   `data/changelog.json` entry.
4. **Epic completion report**: a short summary of what is fully live vs. what is
   built-but-blocked-on-credentials/funding (Cloud Run deploy, funded devnet
   signer), with the exact unblock step for each. Do not claim done for anything you
   could not verify.

## Constraints

- Simulate-first, honest reporting: never fabricate an on-chain result; BLOCKED is a
  first-class outcome with the precise reason and unblock step.
- Use synthetic agent authorities + the $THREE mint (or a clearly-synthetic
  placeholder) in tests — never a real third-party wallet or any non-$THREE mint.
- The smoke script is re-runnable and idempotent (cleans up or reuses test agents);
  no secrets committed; lives under `scripts/`, not the repo root.
- The DoD sweep fixes real defects but must not silently rewrite another task's
  scope — hand large items back as follow-ups with specifics.

## Success Criteria

- `node scripts/agent-wallet-smoke.mjs` runs end-to-end against devnet/testnet,
  printing PASS/BLOCKED/FAIL per step, with simulate fallbacks and zero fake passes.
- The DoD sweep punch-list is resolved: every new surface has all states designed,
  is mobile-responsive + accessible, has no dead paths, and is console-clean
  (against the known-noise baseline).
- `npm run build`, `npm run typecheck`, `npm test` clean; changelog entries present
  for all user-visible changes.
- A completion report distinguishes live vs. credential/funding-blocked, with unblock
  steps — no overclaiming.
- Changelog entry (tag: infra). Run the **completionist** subagent on the epic's
  changed files.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/agent-wallet-trading/10-e2e-smoke-and-dod-sweep.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
