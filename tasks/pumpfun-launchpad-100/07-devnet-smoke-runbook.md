# Devnet smoke runbook — `scripts/pump-devnet-smoke.mjs`

The acceptance gate for Tasks 01–03. Proves the launch → buy → sell loop works against **real
on-chain devnet state** for a SOL-paired coin, a USDC-paired coin, and the custodial
(server-signed) path — and that every trade lands in `pump_agent_trades` with the correct
`quote_mint` / `quote_symbol` / `quote_amount`.

It drives the **same production helpers the dispatcher handlers use** — not a reimplementation:
`getPumpSdk`, the `@pump-fun` v2 builders (`createV2` / `buyV2` / `sellV2`), `pump-trade-args`
(slippage, token-program, `resolveCustodialQuote`), `pump-quote` (`tradeQuoteColumns`,
`walletQuoteDeltaAtomics`), `verifySignature`, and the same `sql` client + the exact recording
logic from `api/pump/[action].js`'s buy/sell-confirm. It signs locally, broadcasts, confirms, then
re-reads the row from Postgres and asserts the quote columns.

**Devnet only.** It refuses any mainnet RPC.

## What it runs

| Leg | Proves |
| --- | --- |
| SOL launch + buy + sell | create_v2 (SOL-paired) → buy_v2 → sell_v2, row recorded `quote_symbol='SOL'`, lamports |
| USDC launch + buy + sell | create_v2 (USDC-paired) → buy_v2 → sell_v2 against the whitelisted devnet USDC, row recorded `quote_symbol='USDC'`, 1e6 atoms (Task 01) |
| Custodial buy + sell (SOL & USDC) | a server-held keypair signs + broadcasts, mirroring `loadAgentForSigning` + the custodial handler (Task 03) |

Each leg prints its tx signatures with devnet explorer links and a final `PASS / FAIL / SKIP`
summary. Failures are actionable (which step, the RPC error). It is idempotent: it seeds a
clearly-synthetic devnet user+agent (`devnet-smoke@three.ws`), records the trades, asserts, then
cascade-deletes everything it created (pass `--keep` to retain for inspection).

## Funding the signer (required for a live run)

The signer defaults to the x402 demo Solana wallet
(`~/.config/x402-test-wallets/solana.json`); override with `--keypair <path>` or `DEVNET_TEST_WALLET`.

1. **Devnet SOL** (~0.12 needed: create + buys + sells + ATA rent). The script auto-airdrops via
   the configured RPC → Helius devnet (if `HELIUS_API_KEY` is set) → the public faucet. The public
   devnet faucet is aggressively rate-limited (HTTP 429 "airdrop limit reached / faucet dry") and is
   frequently exhausted from shared CI/Codespace IPs. If airdrop fails:
   - fund the printed address at <https://faucet.solana.com> (devnet), **or**
   - pass `--rpc https://devnet.helius-rpc.com/?api-key=<KEY>` (or any premium devnet endpoint)
     whose faucet isn't exhausted — this is the reliable path in an automated environment.
2. **Devnet USDC** (only for the USDC legs). The pump.fun devnet program whitelists exactly one
   quote mint: `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`. Its mint authority is an external
   faucet, so it can't be minted locally — fund the printed address at <https://faucet.circle.com>
   (Solana devnet). Without USDC the USDC legs report `SKIP` (not `FAIL`), with the exact address +
   amount to fund.

## Running it

```bash
# Validate the whole build pipeline on-chain WITHOUT funds (simulation only):
node scripts/pump-devnet-smoke.mjs --simulate-only

# Full live run (needs a funded signer; DATABASE_URL from .env.local for the row assertions):
node scripts/pump-devnet-smoke.mjs

# Live run against a premium devnet RPC (bypasses the public-faucet 429):
node scripts/pump-devnet-smoke.mjs --rpc 'https://devnet.helius-rpc.com/?api-key=…'

# Useful flags:
#   --sol-only        run only the SOL legs
#   --no-db           skip the Postgres record + assert (chain-only proof)
#   --keep            keep the seeded devnet rows
#   --cleanup         delete prior smoke rows and exit
#   --usdc <n> / --sol <n> / --slippage-bps <n>
```

`--simulate-only` needs no funds and no DB: it builds every launch instruction with the real SDK,
compiles it to a v0 transaction, checks it serializes within the 1232-byte packet limit, and
simulates it on devnet (halting only on the unfunded fee payer — expected). This is the
fund-independent proof that the instruction-building pipeline is correct.

## Verified status (2026-06-15)

- `--simulate-only`: **4/4 PASS** — SOL, USDC, custodial-SOL, custodial-USDC launch instructions all
  build, compile to v0 (817–922 B), and reach the devnet program. Devnet USDC confirmed whitelisted.
- Live broadcast + DB assertions: **blocked solely by devnet funding** — the public airdrop returns
  429 (exhausted), `HELIUS_API_KEY` is empty under `vercel env pull`, and devnet USDC needs the
  Circle faucet. Re-run with a premium devnet RPC key or a pre-funded keypair to complete the live
  legs; the script then prints real signatures and asserts the recorded quote columns.
- Tasks 01/03 unit coverage (`tests/pump-quote.test.js`, `tests/api/pump.test.js`): green
  (the trades-quote migration `20260614000000_pump_trades_quote.sql` is applied to the DB).

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/pumpfun-launchpad-100/07-devnet-smoke-runbook.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
