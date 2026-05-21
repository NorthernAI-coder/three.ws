# USE-27: Paywall UI — Browser-native payment flow

## Goal
A polished browser paywall for human visitors hitting paid endpoints directly. Shows price, network options, asset, "Pay" button, and live settlement status. Falls back gracefully when wallet not connected.

## Why
- Not every buyer is an agent. Some are humans on a phone reading an article.
- The `@x402/paywall` package provides the UI, but we should wire it into our routes and brand it.

## Reference
- `@x402/paywall`: [typescript/packages/http/paywall](https://github.com/x402-foundation/x402/tree/main/typescript/packages/http/paywall)
- Quickstart for sellers (paywall section): [/tmp/x402-docs/docs/getting-started/quickstart-for-sellers.mdx](/tmp/x402-docs/docs/getting-started/quickstart-for-sellers.mdx)

## Dependencies
- USE-00, USE-02, USE-03

## Files to create
- `public/paywall.html` — paywall page
- `public/paywall.js` — client-side logic, integrates `@x402/paywall`
- `public/paywall.css` — branded styles
- `api/_lib/x402/paywall-handler.js` — detects `Accept: text/html` on 402 and serves the paywall page instead of bare JSON

## Files to modify
- Every paid endpoint that can be accessed directly by a human browser: install the paywall handler middleware
- `vercel.json` — route `/paywall` → `/paywall.html`
- `public/x402.js` — share buyer logic with paywall

## Implementation

### Content negotiation
```js
// Inside our payment middleware (USE-02)
if (req.headers.accept?.includes("text/html") && !req.headers["payment-signature"]) {
  return servePaywall(req, res, paymentRequirements);
}
```

The paywall HTML page receives `?req=<base64 PaymentRequirements>` and renders accordingly.

### UI features
- Show all `accepts[]` options with logos (USDC, USDT0, etc.)
- Per-option: network name, price in USD and in atomic units, asset address, payTo address, an icon
- "Connect Wallet" button (Coinbase Wallet, MetaMask, Phantom)
- "Need test funds? Get USDC on Base Sepolia" link to a faucet (read from the paywall's bundled faucet URL map)
- After settlement: show transaction hash, link to block explorer

### Wallet connect
- EVM: Coinbase Wallet SDK or wagmi
- Solana: `@solana/wallet-adapter` with Phantom + Solflare

### Custom assets
For chains where `decimals != 6`, the bundled `decimals.ts` from `@x402/paywall` handles formatting. Verify our default-asset table (USE-00) matches.

### Branding
Theme the paywall with the same colors and typography as the main 3D-Agent site. Logo top-left, "Powered by x402" footer link.

## Wiring checklist
- [ ] Content negotiation correctly differentiates HTML browsers from JSON clients
- [ ] Wallet connect works for the top 3 EVM wallets and top 2 Solana wallets
- [ ] Faucet links visible on testnet, hidden on mainnet
- [ ] Block explorer links correct per network (Basescan, Solscan, etc.)
- [ ] Settlement status updates live (no manual refresh)

## Acceptance
- [ ] Open `/api/x402/exact-evm-demo` in a browser (no payment header) → paywall page renders
- [ ] Connect Coinbase Wallet, pay, see resource
- [ ] Same flow with Phantom on the Solana endpoint
- [ ] On testnet, faucet link works
- [ ] On mainnet, no faucet shown
- [ ] Settlement tx link opens block explorer in new tab
