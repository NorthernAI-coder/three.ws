# 01 — Free Crypto Data API: Token Snapshot

Read `prompts/x402-overhaul/00-CONTEXT.md` first, then `/workspaces/three.ws/CLAUDE.md`.
Independent work order — completes fully on its own.

## Agent use-case (name it in the docs)
A trading/research agent has a token address and needs its current market state in one call
before deciding to buy, alert, or ignore. Today it has to juggle DexScreener + an RPC + a
price API. We give it one clean free call.

## Build — `GET /api/crypto/token`
- New file `api/crypto/token.js`, free plain-handler pattern (00-CONTEXT "Free endpoint
  pattern": `cors`/`wrap`/`error` from `_lib/http.js`, rate-limit via `clientIp`+`limits`).
- Input: `?address=<mint|pair|contract>&chain=<solana|base|...>` (chain optional; infer from
  address shape when omitted — Solana base58 vs 0x EVM).
- Data: DexScreener (keyless) for price/liq/mcap/volume/24h-change; `_lib/sol-price.js` /
  `_lib/token-market.js` / `_lib/token-metadata.js` to enrich name/symbol/decimals. Prefer
  keyless sources; enrich with Helius/Birdeye only if keys exist (else `null`, per
  "never blocked").
- Output (stable schema): `{ address, chain, name, symbol, priceUsd, change24h, marketCapUsd,
  liquidityUsd, volume24hUsd, fdvUsd, pairCreatedAt, dexId, url, ts, sources[] }`.
- Every field that couldn't be resolved = `null`, never omitted, never faked.

## Catalog registration
Drop `api/_lib/crypto-catalog/token.js` exporting `{ slug:'token', method:'GET',
path:'/api/crypto/token', title, summary, inputSchema, outputSchema, example }`. (The
`/api/crypto` index in prompt 10 globs this dir; if it doesn't exist yet, your file still
stands alone — no dependency.)

## States to handle
Unknown/invalid address → 400 with a clear message + example. Token found but thin data
(new launch, no pair) → 200 with the fields you have + the rest `null`. Upstream (DexScreener)
down → 200 from RPC/meta fallback where possible, else 503 with a retry hint. Rate-limited →
429. Never 500 on a well-formed request.

## Tests (`tests/`)
Schema shape always present; address-type inference (Solana vs EVM); graceful-degradation
path (simulate no key → keyless fields still return); use `$THREE` (CA in 00-CONTEXT) or a
synthetic mint in fixtures, never a real third-party mint.

## Definition of done
Inherit 00-CONTEXT's DoD + anti-laziness gates. Additionally:
- [ ] Live call against a real token (use `$THREE`) captured in PROGRESS.md with real JSON.
- [ ] Docs: add this endpoint to `docs/crypto-api.md` (create if absent; prompt 11 expands
      it — your section stands alone) with a runnable `curl` example and the named use-case.
- [ ] `data/changelog.json`: entry (tags: `feature`, `sdk`) — "Free crypto token snapshot API
      for AI agents".
