# x402 catalog rebuild — work orders

Owner mandate (2026-07-06): the x402scan listing ($5.87 volume / 10 buyers / 30 days) is mostly
internal demos wearing price tags. Rebuild it around two coherent products — **a free crypto
data API** and **the only 3D/GPU generation lane in the x402 ecosystem** — plus a curated set
of standalone tools.

## How to fire these

Each prompt is a **self-contained work order** designed to be pasted into a fresh Claude Code
session. Every one:
- starts by making the agent read `00-CONTEXT.md` (shared rules + platform facts),
- is independent — **no prompt requires another to have finished** (shared contracts like the
  `free` descriptor field are inert until the engine prompt lands, and dynamic surfaces render
  from whatever exists at runtime),
- is scoped small enough to be completed 100% in one session, with explicit tasks, a
  Definition of Done, and orders to never ask questions and to commit + push when done.

Fire them in any order. The suggested sequence below front-loads the funnel.

## Index

| # | Prompt | Ships | Track |
|---|--------|-------|-------|
| 01 | [free-tier-lane](01-free-tier-lane.md) | Genuine free lane (per-IP quota → 402) in the aggregator | Crypto API |
| 02 | [provider-dexscreener](02-provider-dexscreener.md) | DEX pairs/search/profiles for any token, free | Crypto API |
| 03 | [provider-jupiter](03-provider-jupiter.md) | Solana prices, executable swap quotes, token search | Crypto API |
| 04 | [provider-coingecko-defillama-expansion](04-provider-coingecko-defillama-expansion.md) | 2→7 CoinGecko + 2→5 DefiLlama endpoints, Llama prices/stablecoins | Crypto API |
| 05 | [provider-solana-reads](05-provider-solana-reads.md) | Balance/holdings/supply/holders/tx/fees as simple GETs | Crypto API |
| 06 | [pump-data-v1](06-pump-data-v1.md) | Free pump.fun trending/curve/search/launches/whales | Crypto API |
| 07 | [name-resolution-v1](07-name-resolution-v1.md) | Free ENS + SNS resolve endpoint | Crypto API |
| 08 | [sentiment-narrative-v1](08-sentiment-narrative-v1.md) | Existing v1 sentiment/intel routes hardened + freed | Crypto API |
| 09 | [crypto-api-docs-openapi](09-crypto-api-docs-openapi.md) | `/crypto-api` page, OpenAPI, docs — all registry-generated | Crypto API |
| 10 | [crypto-api-mcp-tools](10-crypto-api-mcp-tools.md) | `crypto_data` + `token_snapshot` MCP tools | Crypto API |
| 11 | [speech-package](11-speech-package.md) | ASR + TTS as free-quota/x402 products | AI package |
| 12 | [image-gen-package](12-image-gen-package.md) | Text→image endpoint over NIM/Vertex lanes | AI package |
| 13 | [free-3d-lane-productization](13-free-3d-lane-productization.md) | `POST /api/v1/ai/text-to-3d` — the flagship free endpoint | AI package |
| 14 | [pipeline-x402-products](14-pipeline-x402-products.md) | Rig/remesh/gameready/stylize/rembg as priced x402 stages | 3D pipeline |
| 15 | [pipeline-orchestrator](15-pipeline-orchestrator.md) | One paid call runs a full stage chain with per-stage progress | 3D pipeline |
| 16 | [embodiment-endpoint](16-embodiment-endpoint.md) | `POST /api/x402/embody` — an agent buys itself a body ($1) | 3D pipeline |
| 17 | [x402-dev-toolkit](17-x402-dev-toolkit.md) | Free echo / debugger / receipt verifier + dev docs page | Storefront |
| 18 | [storefront-cleanup](18-storefront-cleanup.md) | Delist demos, remove dead weight, rewrite every description | Storefront |
| 19 | [vanity-instant-inventory](19-vanity-instant-inventory.md) | Pre-ground inventory → instant delivery + premium tiers | Standalone |
| 20 | [fact-check-v2](20-fact-check-v2.md) | Free sample lane + published accuracy benchmark | Standalone |
| 21 | [token-security-v1](21-token-security-v1.md) | Free rug-check: authorities, concentration, liquidity facts | Crypto API |

## Suggested firing order

1. **Funnel first:** 01 → 02 → 03 → 04 → 05 → 06 → 07 → 08 (each is small; any order among
   02–08 works)
2. **Storefront:** 09 → 10 → 17 → 18
3. **Products:** 11 → 12 → 13 → 14 → 15 → 16
4. **Standalone:** 19 → 20

Note: 02–05 all append to `api/v1/_providers.js`. They're order-independent, but fire them
**sequentially, not simultaneously** — concurrent edits to one file in a shared worktree will
collide.

## ⚠️ De-confliction with `prompts/x402-overhaul/`

A parallel campaign (`prompts/x402-overhaul/`, authored concurrently) covers overlapping
ground with a DIFFERENT architecture: it builds brand-new standalone `/api/crypto/*` and
`/api/3d/*` surfaces, while this campaign routes everything through the existing `/api/v1`
unified API (aggregator registry + catalog). **Firing both crypto tracks builds two parallel
free crypto APIs at different URLs — the exact fragmentation this rebuild is meant to fix.**
Pick one architecture per area:

| Area | Fire | Skip (superseded by) |
|---|---|---|
| Free crypto API | this campaign 01–10, 21 | overhaul 01–11 (same data, second URL surface) |
| Free text→3D | this campaign 13 | overhaul 12 (same lane, second URL surface) |
| 3D index/docs | this campaign 09 + 14's docs | overhaul 14 |
| Listing rewrites + delistings | this campaign 18 (also removes/delists) | overhaul 17–19 (rewrites only) |
| Reputation/identity generalization | overhaul 15 + 16 (unique — not covered here) | — |
| Free GLB inspect | overhaul 13 (unique — optional) | — |

Safe from the overhaul set: **13, 15, 16** (no collision with this campaign). Fire 15/16 in a
separate session from 18, not simultaneously — they touch the same `api/x402/` files.
