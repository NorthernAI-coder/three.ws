# Pump.fun platform trade fee

three.ws can charge a platform fee on every pump.fun buy/sell routed through the
trade modal (`src/game/coin-buy.js` → `/api/pump/buy-prep` · `/api/pump/sell-prep`).
The fee matches pump.fun's own trade-fee rate and is a **real on-chain transfer
added to the same transaction the user signs** — native SOL for SOL-paired
trades, USDC for USDC-paired trades — sent to the platform fee wallet. One
signature, no custody.

## Status: OFF by default

The fee ships **inert**. It activates only when BOTH are configured:

| Env var | Effect |
|---|---|
| `PUMP_PLATFORM_FEE_BPS` | Rate in basis points. **Default `0` (off).** Set `100` for 1% (pump.fun's rate). Hard-capped at 500 (5%). |
| `PUMP_PLATFORM_FEE_WALLET` | Recipient Solana address. Falls back to the platform treasury keypair (`PLATFORM_TREASURY_KEYPAIR` / `TREASURY_KEYPAIR`) pubkey if unset. |

With either knob missing/zero, `buildPlatformFeeInstructions` returns `null`, no
fee instruction is added, and the quote/UI report `platform_fee_bps: 0` (no fee
line shown). This is why local/preview and a fresh deploy charge nothing — and
why turning it on is a deliberate one-line env change after trading is verified.

## How it's computed

- **Buy:** fee = `bps × quote spent`, charged on top (you pay trade + fee).
- **Sell:** fee = `bps × expected proceeds`, taken from the proceeds. AMM-sell
  proceeds are quoted via the pump-swap SDK's `sellBaseInput` (`uiQuote`); if
  that quote can't be derived the fee is skipped, never the sell.

All four routes are covered: bonding-curve buy/sell and PumpSwap AMM buy/sell,
for both SOL- and USDC-paired coins (`api/_lib/pump-platform-fee.js`).

## Disclosure (required before enabling)

The fee is **never** charged silently. When `platform_fee_bps > 0`:

1. The trade modal shows a live fee line ("Platform fee 1% · ~0.01 SOL") and the
   exact amount at the wallet-approval step (`coin-buy.js#_renderFee` / `_feeNote`).
2. **Before flipping the rate on in production, add a fees clause to the Terms**
   stating that three.ws charges a trading fee at pump.fun's rate on trades
   routed through the platform, and add a public changelog entry. Disclosure in
   the UI is already wired; the Terms + changelog are the remaining steps and
   must land in the same change that enables the fee.

## Enable checklist

1. Verify SOL + USDC buy/sell end-to-end with the fee at 0.
2. Set `PUMP_PLATFORM_FEE_WALLET` (or confirm the treasury keypair pubkey is the
   intended recipient).
3. Add the Terms fees clause + a changelog entry.
4. Set `PUMP_PLATFORM_FEE_BPS=100`.
5. Confirm the modal shows the fee line and a test trade routes the fee to the
   wallet.
