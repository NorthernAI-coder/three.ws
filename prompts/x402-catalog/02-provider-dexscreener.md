# 02 — Aggregator provider: DexScreener

Read `prompts/x402-catalog/00-CONTEXT.md` first and obey every rule in it. Work alone, finish
100%, never ask questions.

## Mission

Add DexScreener as a provider in `api/v1/_providers.js` so any agent can pull live DEX pair
data (price, liquidity, volume, txns) for any token through the free three.ws crypto API. This
replaces the pointless paid `token-intel`/`three-intel` wrappers with an honest free surface.

## Context

- Registry + descriptor contract: `api/v1/_providers.js` (read the header comment and match the
  existing `coingecko` entry's style exactly — tabs, `required()` helper, slim transforms).
- DexScreener is keyless (`requiresKey: false`, `envVar: null`, `byokHeader: null`).
- Known API surface (VERIFY EVERY PATH WITH CURL BEFORE WIRING — shapes drift):
  - Base `https://api.dexscreener.com`
  - `GET /latest/dex/tokens/{tokenAddresses}` — up to 30 comma-separated addresses; ~300 req/min
  - `GET /latest/dex/search?q=<query>` — ~300 req/min
  - `GET /latest/dex/pairs/{chainId}/{pairId}` — ~300 req/min
  - `GET /token-profiles/latest/v1` and `GET /token-boosts/latest/v1` — ~60 req/min
- The repo already consumes DexScreener elsewhere (`api/_lib/token-market.js`
  `fetchTokenMarket`) — read it for field names the platform already normalizes to.
- Use the $THREE mint `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump` for every example address
  in params docs, tests, and docs.

## Tasks

1. Curl each endpoint above with a real request (token endpoint: use the $THREE mint). Record
   actual response shapes.
2. Add provider `dexscreener` (category `crypto-market-data`) with endpoints:
   - `token` — pairs for one or more token addresses. Param `addresses` (required, comma-sep,
     cap at 30). **Transform**: DexScreener returns full pair objects (~large); slim each pair
     to: `chainId, dexId, pairAddress, baseToken {address,name,symbol}, quoteToken {symbol},
     priceUsd, priceNative, liquidity.usd, fdv, marketCap, volume.h24, priceChange {h1,h6,h24},
     txns.h24, pairCreatedAt, url`. Sort by `liquidity.usd` desc.
   - `search` — param `q` (required). Same slim transform, cap 20 pairs.
   - `pair` — params `chain` + `pair` (both required), path-param style like defillama's `tvl`.
     Same slim transform.
   - `profiles` — latest token profiles (no params). Slim to
     `chainId, tokenAddress, description, links` per entry, cap 30.
   - `boosts` — latest boosted tokens (no params). Slim similarly, cap 30.
3. Free-tier field on all endpoints per the 00-CONTEXT contract: `token`/`search`/`pair` get
   `free: { perMin: 30, perDay: 3000 }`; `profiles`/`boosts` get
   `free: { perMin: 10, perDay: 500 }` (upstream limit is 60/min shared). Set `priceAtomics`
   `'1000'` ($0.001) on all — the x402 price for above-quota callers. Scope `agents:read`.
4. `summary` lines must be specific and agent-readable (what data, for what input, from where).
   `params` documents every input with an example using the $THREE mint.
5. **Tests** in `tests/api/v1-provider-dexscreener.test.js`: descriptor integrity (every
   endpoint resolvable via `ENDPOINT_INDEX`, transforms handle a recorded real-shaped payload
   AND a malformed/empty payload without throwing), `required()` errors on missing params. Use
   fixtures captured from your real curls (a recorded upstream response used as a test fixture
   is real data, not a mock of our code). Run targeted vitest until green.
6. **Docs:** add the provider to the `/api/v1/x` section of `docs/api-reference.md` with one
   runnable curl per endpoint ($THREE mint example). Changelog entry (`feature`): live DEX
   pair data for any token, free.
7. Commit (explicit paths: the registry, tests, docs, changelog) and push per 00-CONTEXT.

## Definition of done

All five endpoints wired, transforms verified against real captured responses, tests green,
docs + changelog updated, committed, pushed to threews (threeD attempted).
