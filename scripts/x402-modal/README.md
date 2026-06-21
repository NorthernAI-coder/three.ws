# x402 payment modal — end-to-end test harness

Exercises the **published** `@three-ws/x402-payment-modal` package (the code in
`../../x402-payment-modal`, not the repo's internal `api/_lib`) with a real,
funded Solana keypair. Covers both Solana settlement tokens — **USDC** and
**THREE** — through both the programmatic server helpers and the real browser
modal UI.

## What gets tested

| Test | Token | Endpoint | Settlement |
|------|-------|----------|------------|
| Programmatic A | USDC | live `https://three.ws/api/mcp` ($0.001) | real PayAI facilitator (sponsors SOL fee) |
| Programmatic B | THREE | local merchant+settler | submitted to RPC by us |
| Browser | USDC + THREE | local merchant+settler | submitted to RPC by us |

No live three.ws endpoint advertises THREE, so the local merchant
(`merchant-server.mjs`) issues a spec-correct 402 with both tokens using the
package's own `solanaAccept`, runs `handleCheckout` for prepare/encode, then
verifies and broadcasts the signed transaction itself. To keep the throwaway
wallet whole, `payTo = feePayer = buyer` → every local test is a **self-transfer**
that costs only the SOL network fee (+ one-time ATA rent).

## The keypair

Provide the throwaway Solana key any of these ways (checked in order):

- `X402_TEST_KEY` env — base58 secret **or** a JSON array string
- `X402_TEST_KEY_PATH` env — path to a Solana CLI / web3.js JSON array file
- default file `/home/codespace/.config/x402-test-wallets/solana.json`
- `scripts/x402-modal/key.json`

## Funding (throwaway amounts)

| Asset | Amount | Why |
|-------|--------|-----|
| USDC | ~0.05 | live `/api/mcp` is $0.001/call; lots of headroom |
| THREE | ~5 | local self-transfer test amount |
| SOL | ~0.01 | local txs (buyer pays its own fee) + any ATA rent |

The live USDC test is the only one that actually spends value (to three.ws). The
THREE and local-USDC tests are self-transfers — value returns to the wallet,
only SOL fees are consumed.

## Run

```bash
# 0. confirm funding
node scripts/x402-modal/preflight.mjs

# 1. programmatic e2e (live USDC + local THREE)
node scripts/x402-modal/merchant-server.mjs   # terminal 1 (needed for the THREE test)
node scripts/x402-modal/run-programmatic.mjs   # terminal 2
#   --live   only the live USDC test
#   --local  only the local THREE test

# 2. browser modal e2e (spawns the merchant itself)
node scripts/x402-modal/run-browser.mjs
HEADED=1 node scripts/x402-modal/run-browser.mjs   # watch the modal
```

Browser screenshots land at `browser-USDC.png` / `browser-THREE.png` (gitignored).

## Files

- `_lib.mjs` — keypair loader, balance reader, mint constants
- `preflight.mjs` — address + balances + readiness check (spends nothing)
- `merchant-server.mjs` — local x402 merchant + settler built on the package
- `run-programmatic.mjs` — package server helpers driven with the keypair
- `page.html` — loads the real modal + injects a keypair-backed provider
- `run-browser.mjs` — Playwright driver for the modal UI
