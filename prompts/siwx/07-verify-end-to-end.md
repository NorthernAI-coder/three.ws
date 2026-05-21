# SIWX prompt 07 — end-to-end verification (real wallets, real money)

## Context

three.ws workspace at `/workspaces/three.ws`. Architecture in
[prompts/siwx/PLAN.md](PLAN.md). Prompts 01-06 built the schema, storage
adapter, paidEndpoint integration, three opt-in endpoints, the browser
modal flow, and the GC cron.

This prompt is **step 7 of 7** — proving the whole thing works with real
wallets, real on-chain settlement, and real signatures. Definition of
done per CLAUDE.md is "feature exercised in a real browser, no console
errors, network tab shows real API calls succeeding" — this prompt is
where that gets done.

## Rails (CLAUDE.md, non-negotiable)

- No mocks. No fake data. No fake wallets. No localhost-only paths that
  don't translate to production.
- Real on-chain USDC settlement for the first payment leg. If the dev
  account lacks USDC, surface that — do NOT skip the payment leg or
  "simulate" it. (Use Base Sepolia + testnet USDC if mainnet is
  uncomfortable; document which network you ran on in the result file.)
- Real EVM wallet (MetaMask) AND real Solana wallet (Phantom) — both
  ecosystems must be exercised because both are advertised in 402 bodies.
- Done = result JSON file exists at `~/.claude/siwx-verify/result.json`
  with timestamps, txids, recovered addresses, and a clear pass/fail
  per scenario.

## What to verify

### Scenario A — Browser flow, EVM (Base + MetaMask)

Goal: pay once on `/api/x402/asset-download?slug=pole-dancer-rumba`, then
re-download via SIWX without paying again.

Steps:

1. `npm run dev` running.
2. Open `http://localhost:3000/siwx-test.html` (built in prompt 05) in a
   browser with MetaMask + Phantom installed.
3. Click the asset-download button. Wallet picker → choose MetaMask on
   Base. Approve the USDC transfer.
4. Confirm the modal shows success + the response JSON has
   `downloadUrl: "https://...r2..."`.
5. Open the URL — the GLB downloads cleanly (size matches the seeded
   `paid_assets.size_bytes`).
6. **Reload the test page.** Click the same button.
7. The modal NOW shows "Sign in with wallet" first. Click it. MetaMask
   prompts to sign a CAIP-122 message. Approve.
8. Network tab: confirm the second request fired with `SIGN-IN-WITH-X`
   header (not `X-PAYMENT`) and returned 200.
9. Open the new `downloadUrl` — second download works.
10. Postgres check:
    ```sql
    SELECT resource, address, network, paid_at, use_count, last_used_at
      FROM siwx_payments
     WHERE resource = 'http://localhost:3000/api/x402/asset-download';
    ```
    Exactly one row. `use_count >= 1`. `last_used_at` recent.

### Scenario B — Browser flow, Solana (Phantom)

Same as Scenario A but with Phantom. Two specific things to verify:

- The CAIP-122 message rendered in Phantom uses
  `"... wants you to sign in with your Solana account:"` (not "Ethereum").
- The signature is Base58-encoded in the `SIGN-IN-WITH-X` header.
- A second row exists in `siwx_payments` with `network = 'solana:5eykt...'`
  and the address in Base58 case-sensitive form.

### Scenario C — Agent flow, EVM (privateKeyToAccount + wrapFetchWithSIWx)

Goal: prove an automated agent works the same way as the browser without
touching the UI. Write a one-shot Node script at
`scripts/siwx-verify-agent.mjs`:

```js
#!/usr/bin/env node
// scripts/siwx-verify-agent.mjs
//
// End-to-end SIWX verification for the agent path. Requires:
//   EVM_PRIVATE_KEY      — 0x-prefixed funded wallet on Base
//   X402_RESOURCE        — full URL of a SIWX-enabled endpoint
//
// Flow:
//   1. Call the endpoint with @x402/fetch — pays via x402.
//   2. Call again with wrapFetchWithSIWx — signs and re-enters for free.
//   3. Write a result JSON to ~/.claude/siwx-verify/agent-result.json.
import { privateKeyToAccount } from 'viem/accounts';
import { wrapFetchWithPayment } from '@x402/fetch';
import { wrapFetchWithSIWx } from '@x402/extensions/sign-in-with-x';
import { writeFile, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const pk = process.env.EVM_PRIVATE_KEY;
const url = process.env.X402_RESOURCE;
if (!pk || !url) {
  console.error('EVM_PRIVATE_KEY and X402_RESOURCE required');
  process.exit(1);
}
const signer = privateKeyToAccount(pk);

// Leg 1 — pay.
const fetchWithPayment = wrapFetchWithPayment(fetch, signer);
const t0 = Date.now();
const r1 = await fetchWithPayment(url);
const j1 = await r1.json();
const t1 = Date.now();
if (r1.status !== 200) throw new Error(`pay leg failed ${r1.status}`);

// Leg 2 — SIWX retry.
const fetchWithSiwx = wrapFetchWithSIWx(fetch, signer);
const t2 = Date.now();
const r2 = await fetchWithSiwx(url);
const j2 = await r2.json();
const t3 = Date.now();
if (r2.status !== 200) throw new Error(`siwx leg failed ${r2.status}`);

const outDir = join(homedir(), '.claude/siwx-verify');
await mkdir(outDir, { recursive: true });
await writeFile(
  join(outDir, 'agent-result.json'),
  JSON.stringify(
    {
      url,
      pay:  { status: r1.status, ms: t1 - t0, paymentResponse: r1.headers.get('x-payment-response') },
      siwx: { status: r2.status, ms: t3 - t2, signature: 'redacted' },
      addresses: { signer: signer.address },
      ranAt: new Date().toISOString(),
    },
    null,
    2,
  ),
);
console.log('OK — wrote', join(outDir, 'agent-result.json'));
```

Run it:

```bash
EVM_PRIVATE_KEY=0x... X402_RESOURCE=http://localhost:3000/api/x402/asset-download?slug=pole-dancer-rumba \
  node scripts/siwx-verify-agent.mjs
```

`agent-result.json` is the artifact you submit.

### Scenario D — Negative path

A wallet that has NOT paid is correctly denied:

```bash
EVM_PRIVATE_KEY=0x<FRESH_EMPTY_WALLET> X402_RESOURCE=http://localhost:3000/api/x402/asset-download?slug=pole-dancer-rumba \
  node scripts/siwx-verify-agent.mjs
```

Expected: the SIWX leg returns `402 siwx_not_paid` (visible because the
script throws). Document the exact response in the result file.

### Scenario E — Replay protection

Capture the `SIGN-IN-WITH-X` header from a successful Scenario A retry
(`Network tab → Copy as cURL`). Replay it twice within 30 seconds.

Expected: first replay succeeds (race window — the nonce hasn't been
recorded yet if you copy the header before the response writes; if you
copy after, both should fail), second replay returns
`401 siwx_message_invalid` with reason `nonce already used`.

### Scenario F — Existing endpoints regression

Confirm the **non**-SIWX endpoints in `api/x402/*.js` still behave
bit-identically. Pick any 3 that weren't touched by prompt 04 (e.g.
`model-check.js`, `mint-to-mesh.js`, `symbol-availability.js`):

```bash
for slug in model-check mint-to-mesh symbol-availability; do
  curl -sSI http://localhost:3000/api/x402/$slug | grep -i 'payment-required'
done
```

Decode each `PAYMENT-REQUIRED` header and confirm `extensions` does NOT
contain `sign-in-with-x`. If any does, prompt 03 leaked SIWX into
non-opted-in endpoints — fix it.

## Artifact

Write `~/.claude/siwx-verify/result.json`:

```json
{
  "ranAt": "2026-05-21T...",
  "network": "base-mainnet",
  "scenarios": {
    "A_evm_browser":   { "status": "pass", "notes": "..." },
    "B_solana_browser":{ "status": "pass", "notes": "..." },
    "C_agent_evm":     { "status": "pass", "notes": "..." },
    "D_negative":      { "status": "pass", "notes": "..." },
    "E_replay":        { "status": "pass", "notes": "..." },
    "F_regression":    { "status": "pass", "notes": "..." }
  },
  "siwxPaymentsCount":  3,
  "siwxNoncesCount":    7
}
```

The user reviews this artifact to decide whether SIWX ships.

## Done means

- All six scenarios pass and are documented in
  `~/.claude/siwx-verify/result.json`.
- `scripts/siwx-verify-agent.mjs` exists, is real, runs against a real
  endpoint with a real private key.
- No console errors in either browser session.
- No new files left in the working tree besides the script and the
  verify artifact (which lives outside the repo).
- If anything failed, the prompt writer surfaces it immediately to the
  user with the failing scenario + the request/response that broke —
  do not paper over by tweaking thresholds.

Do not commit or push the script unless the user asks you to (it
contains no secrets, but it doesn't need to ship to prod either —
keep it in `scripts/` for repeat verification).
