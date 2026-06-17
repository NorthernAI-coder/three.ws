# Task 01 — Real-wallet end-to-end verification (Base + Solana)

## Context

three.ws workspace at `/workspaces/three.ws`. The deliverable and all verified facts are in
[00-PLAN.md](00-PLAN.md). The page under test is
[`pages/ibm/x402-demo.html`](../../pages/ibm/x402-demo.html); it drives the drop-in widget
[`public/x402.js`](../../public/x402.js) against the real $0.001 endpoint
`https://three.ws/api/x402/symbol-availability`.

This is the foundation task. CLAUDE.md's definition of done is "feature exercised in a real
browser, no console errors, network tab shows real API calls succeeding with real data." This
task is where that gets done — with **real wallets and real on-chain USDC settlement**.

## Rails (non-negotiable)

- No mocks, no fake wallets, no "simulated" payment leg. If the test wallet lacks mainnet
  USDC, **stop and report it** — do not fake success. (The endpoint advertises mainnet only;
  there is no testnet accept to fall back to. If mainnet USDC is unavailable, document the
  blocker in the result file and mark the leg `BLOCKED`, not `PASS`.)
- Exercise **both** ecosystems — Base via MetaMask and Solana via Phantom — because both are
  advertised in the 402 body and both code paths in the widget differ (Base signs EIP-3009
  client-side; Solana round-trips `/api/x402-checkout` + dynamic-imports `@solana/web3.js`).

## Method

1. Serve the file from a local origin (a fresh dev server, or `npx http-server pages/ibm -p 8088`).
   Because the page uses absolute `https://three.ws` URLs, it behaves identically whether served
   locally, from three.ws, or from `live.ibm.com`.
2. Open it in a real browser with MetaMask **and** Phantom installed and funded with a few
   cents of USDC (Base USDC on MetaMask; Solana USDC on Phantom).
3. Keep DevTools open (Console + Network) for the whole run.

## What to verify

### Scenario A — Base (MetaMask)
1. On load, the **402 preview** populates: `$0.001 USDC`, networks `Base, Solana`, the two
   payTo addresses from 00-PLAN. No console errors.
2. Type a ticker (default `GRANITE`), click **Pay $0.001 & run**. The widget modal opens; pick
   the Base / browser-wallet option.
3. MetaMask prompts an **EIP-3009 `TransferWithAuthorization`** typed-data signature (a
   signature, not a gas transaction). Approve.
4. Network tab: the endpoint is re-called with an `X-PAYMENT` header and returns **200** with
   the JSON body; an `x-payment-response` response header is present.
5. The page result panel switches to the success state: recommendation pill, any matches, and a
   receipt with network = Base, the payer (short), and a **Basescan** tx link that resolves to a
   real settled USDC transfer to `0x4022…f402`.
6. Click the Basescan link — confirm the on-chain transfer exists and the amount is 1000 units (0.001 USDC).

### Scenario B — Solana (Phantom)
Same flow with Phantom. Additionally confirm:
- The widget POSTs to `https://three.ws/api/x402-checkout?action=prepare` then `…=encode`
  (Network tab) and dynamic-imports from `esm.sh` succeed.
- Phantom prompts to sign a transaction; on approval the call returns 200.
- The receipt shows network = Solana and a **Solscan** tx link to a real USDC transfer to
  `wwwPqsM4N7T9J69tB82nLyzxqsH159j4orftLTQfUGV`.

### Scenario C — Cancellation & re-run
- Open the modal, close it (✕ / Escape). The page result must return cleanly to the **idle**
  state (not an error) — the promise rejects with `code === 'cancelled'` and the page handles it.
- Re-run and complete a payment afterward to prove the flow is re-entrant.

## Output (required)

Write a result file at `~/.claude/ibm-x402-verify/result.json` with, per scenario: timestamp,
network, payer address, tx hash, explorer URL, HTTP status, and `PASS` / `FAIL` / `BLOCKED`
with a one-line reason. Include the exact console output if anything logged.

## Definition of done

- Scenarios A and B are `PASS` with real explorer-verifiable transactions, or clearly
  `BLOCKED` with the funding/credential gap named (never faked).
- Scenario C `PASS` (cancel is clean, re-run works).
- Zero console errors/warnings across the run. Network tab shows real 402 → 200 with real data.
- Result file written. Report the table back to the user. Run the **completionist** subagent if
  you changed any code to fix a bug you found.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **verified
and any found bug is fixed and committed** per the repo-root `CLAUDE.md` definition of done,
remove it in the same change:

```bash
git rm "tasks/ibm-x402-demo/01-e2e-wallet-verification.md"
```

Stage the deletion alongside your work and include it in the completion commit. A file that
still exists is unfinished work; a file that is gone has shipped. Do not delete early.
