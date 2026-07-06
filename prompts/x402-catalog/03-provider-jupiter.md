# 03 — Aggregator provider: Jupiter (Solana prices, quotes, token search)

Read `prompts/x402-catalog/00-CONTEXT.md` first and obey every rule in it. Work alone, finish
100%, never ask questions.

## Mission

Add Jupiter as a provider in `api/v1/_providers.js`: Solana token prices, real swap quotes, and
token metadata search through the free three.ws crypto API. A swap **quote** (not execution) is
one of the highest-value free data calls an agent can make — it's the true executable price.

## Context

- Registry + descriptor contract: `api/v1/_providers.js` (match existing entries' style).
- Jupiter's keyless tier lives on `https://lite-api.jup.ag` (their paid/keyed tier is
  `api.jup.ag`). Use the lite base — `requiresKey: false`. Known surface (VERIFY EVERY PATH
  WITH CURL BEFORE WIRING — Jupiter versions endpoints aggressively; if a path 404s, probe the
  adjacent version, e.g. `/price/v2` vs `/price/v3`, `/swap/v1/quote` vs `/v6/quote`, and use
  what actually responds):
  - Price: `GET /price/v3?ids=<comma-sep mints>` (v2 form: `/price/v2?ids=…`)
  - Quote: `GET /swap/v1/quote?inputMint=…&outputMint=…&amount=<atomics>&slippageBps=50`
  - Token search: `GET /tokens/v2/search?query=<text>` (v1 form: `/tokens/v1/token/<mint>`)
- USDC mint for examples: `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` is a real third-party
  reference — acceptable ONLY as a quote-side parameter default documented in `params` (it's
  generic infrastructure, like `ids=solana` precedent). For the token-side examples use the
  $THREE mint `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`.
- BYOK: Jupiter keys go in an `x-api-key` header against `api.jup.ag`. The descriptor `base` is
  static, so keep the lite base and set `byokHeader: null` — document in the endpoint summaries
  that this is Jupiter's keyless tier. Do not build multi-base plumbing.

## Tasks

1. Curl each candidate path with real mints ($THREE, wrapped SOL `So11111111111111111111111111111111111111112`)
   and record the working versions + response shapes.
2. Add provider `jupiter` (category `crypto-market-data`) with endpoints:
   - `price` — param `ids` (required, comma-sep mints). Transform to a flat
     `{ [mint]: { price_usd, … } }` keeping only stable fields you observed.
   - `quote` — params `inputMint`, `outputMint`, `amount` (all required), `slippageBps`
     (default 50). Transform: keep `inAmount, outAmount, otherAmountThreshold, priceImpactPct,
     routePlan` slimmed to `[{ label, inputMint, outputMint, percent }]`, drop the rest.
   - `token-search` — param `query` (required). Slim each hit to
     `address, name, symbol, decimals, logoURI, tags, daily_volume` (whatever subset the real
     response carries), cap 20.
3. Free-tier field on all three: `free: { perMin: 20, perDay: 2000 }`. `priceAtomics` `'1000'`.
   Scope `agents:read`. Specific `summary` + fully documented `params` with runnable examples.
4. **Tests** in `tests/api/v1-provider-jupiter.test.js`: descriptor integrity via
   `ENDPOINT_INDEX`, transforms against captured real-shaped fixtures + malformed payloads,
   required-param errors. Targeted vitest until green.
5. **Docs:** provider section in `docs/api-reference.md` with one runnable curl per endpoint.
   Changelog entry (`feature`): Solana prices, executable swap quotes, and token search, free.
6. Commit (explicit paths) and push per 00-CONTEXT.

## Definition of done

Three endpoints wired against verified-live paths, transforms tested against captured real
shapes, docs + changelog updated, tests green, committed, pushed to threews (threeD attempted).
