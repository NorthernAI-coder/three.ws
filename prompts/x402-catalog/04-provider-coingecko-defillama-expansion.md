# 04 — Expand CoinGecko + DefiLlama coverage (and add the Llama price/stablecoin bases)

Read `prompts/x402-catalog/00-CONTEXT.md` first and obey every rule in it. Work alone, finish
100%, never ask questions.

## Mission

The `coingecko` and `defillama` providers in `api/v1/_providers.js` each expose only 2
endpoints. Expand them to real coverage, and add DefiLlama's two sibling APIs (coins.llama.fi
prices, stablecoins.llama.fi) as their own providers since they live on different base URLs.

## Context

- Registry + descriptor contract: `api/v1/_providers.js`. Match existing style exactly. Append
  new endpoints INSIDE the existing `coingecko`/`defillama` entries; add the two new providers
  at the end of `PROVIDERS`. Don't reformat existing entries (concurrent agents may be editing
  the same file — keep your diff surgical).
- All of these upstreams are keyless. VERIFY EVERY PATH WITH CURL BEFORE WIRING and slim every
  large payload with a `transform` (see the existing `defillama/protocols` transform for the
  bar: a multi-MB upstream response must not ship through unslimmed).
- Known surfaces to verify:
  - CoinGecko `https://api.coingecko.com/api/v3`: `/coins/{id}` (use
    `localization=false&tickers=false&community_data=false&developer_data=false`),
    `/search/trending`, `/simple/token_price/{platform}?contract_addresses=…&vs_currencies=usd`,
    `/global`, `/coins/{id}/ohlc?vs_currency=usd&days=…`
  - DefiLlama `https://api.llama.fi`: `/v2/chains`, `/protocol/{slug}` (HUGE — slim hard),
    `/v2/historicalChainTvl/{chain}`
  - Llama coins `https://coins.llama.fi`: `/prices/current/{coins}` where `{coins}` is
    comma-sep `chain:address` (e.g. `solana:FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`)
  - Llama stablecoins `https://stablecoins.llama.fi`: `/stablecoins?includePrices=true`

## Tasks

1. Curl everything; record real shapes.
2. **CoinGecko additions** (each: `free: { perMin: 20, perDay: 1500 }`, `priceAtomics '1000'`,
   scope `agents:read`, specific summary, documented params):
   - `coin` — `/coins/{id}` slimmed to name/symbol/market_data essentials (price, ath, atl,
     market_cap, volume, supply, price changes) + description.en truncated to 500 chars.
   - `trending` — `/search/trending`, slim to coins `[{ id, symbol, name, market_cap_rank,
     price_btc }]` and top categories.
   - `token-price` — `/simple/token_price/{platform}` with params `platform` (default
     `solana`), `addresses` (required). Example address: the $THREE mint.
   - `global` — `/global`, slim to total market cap, volume, btc/eth dominance, active coins.
   - `ohlc` — `/coins/{id}/ohlc`, params `id` (required), `days` (default 1, allow 1/7/14/30).
3. **DefiLlama additions** (same pricing/free defaults):
   - `chains` — `/v2/chains` slimmed to `[{ name, tvl, tokenSymbol, chainId }]` sorted by tvl.
   - `protocol` — `/protocol/{slug}` slimmed to name, category, chains, current TVL per chain,
     and the LAST 30 points of the total TVL series only.
   - `chain-tvl` — `/v2/historicalChainTvl/{chain}`, last 90 points.
4. **New provider `llama-prices`** (base coins.llama.fi, category `crypto-market-data`):
   endpoint `current` — param `coins` (required, comma-sep `chain:address`), transform to
   `{ [key]: { price, symbol, decimals, timestamp, confidence } }`.
5. **New provider `llama-stablecoins`** (base stablecoins.llama.fi, category `defi-data`):
   endpoint `list` — slim each to `name, symbol, pegType, price, circulating total`, sorted by
   circulating desc, cap 50.
6. **Tests** in `tests/api/v1-provider-llama-expansion.test.js` +
   `tests/api/v1-provider-coingecko-expansion.test.js`: descriptor integrity via
   `ENDPOINT_INDEX`, every new transform against captured real-shaped fixtures and malformed
   payloads, required-param errors. Targeted vitest until green.
7. **Docs:** extend the provider sections in `docs/api-reference.md` (runnable curl each).
   Changelog entry (`feature`), holder-readable.
8. Commit (explicit paths) and push per 00-CONTEXT.

## Definition of done

CoinGecko 2→7 endpoints, DefiLlama 2→5, two new Llama providers live, everything transformed
slim + tested against real captured shapes, docs + changelog updated, committed, pushed.
