# 08 — Free Crypto Data API: Wallet Portfolio

Read `prompts/x402-overhaul/00-CONTEXT.md` first, then `/workspaces/three.ws/CLAUDE.md`.
Independent work order — completes fully on its own.

## Agent use-case (name it in the docs)
An agent needs to inspect a wallet — its own or a counterparty's — before transacting: token
balances, SOL/native, rough USD value. Useful for treasury agents, copy-trade agents, and
pre-trade counterparty checks.

## Build — `GET /api/crypto/wallet`
- New file `api/crypto/wallet.js`, free plain-handler pattern (00-CONTEXT).
- Input: `?address=<wallet>&chain=<solana|base|...>`.
- Data: `_lib/balances.js`, `_lib/helius.js` (if key) / Solana RPC `getTokenAccountsByOwner`
  (keyless) for SPL balances; `_lib/sol-price.js` + DexScreener for USD valuation. Keyless
  path must return real balances even without Helius.
- Output: `{ address, chain, native: { amount, usd }, tokens: [{ mint, symbol, amount,
  usd }], totalUsd, tokenCount, ts, sources[] }`. Unpriced tokens → `usd:null`, still listed.

## Catalog registration
Drop `api/_lib/crypto-catalog/wallet.js` (entry shape per 00-CONTEXT).

## States
Invalid address → 400. Empty wallet → 200 with zeros/empty arrays. RPC down → 503 + retry.
Never 500. Consider a sane cap on tokens returned (e.g. 200) with a `truncated` flag.

## Tests
Balance parsing; USD valuation with a missing price; keyless RPC path; empty wallet.
Use a known public address or a synthetic one in fixtures (no private keys, ever).

## Definition of done
Inherit 00-CONTEXT DoD + gates. Plus:
- [ ] Live call on a real public address captured in PROGRESS.md.
- [ ] `docs/crypto-api.md` section + curl + use-case.
- [ ] `data/changelog.json` (tags: `feature`) — "Free wallet portfolio API for agents".
