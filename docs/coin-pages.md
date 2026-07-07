# Global Markets & Coin Detail Pages

three.ws has always had deep coverage of pump.fun launches (`/launches`,
`/coin-intel`, `/oracle`). The **Markets** surface extends that to the whole
crypto market: a CoinGecko-style index of the top assets, and a rich,
shareable detail page for every coin. The design is adopted from the
[cryptocurrency.cv](https://github.com/nirholas/cryptocurrency.cv) coin pages —
editorial serif headings, hairline borders, mono numerals, light/dark themes.

## The pages

### `/coins` — markets index

- **Global stats bar** — total market cap (with 24h change), 24h volume, the
  top-2 dominance shares, the Fear & Greed index, and the active-coin count.
- **Top coins table** — rank, name, live price, 24h %, 7d %, market cap, 24h
  volume, and a 7-day sparkline per coin. Every column sorts (click or
  Enter/Space on a header); every row links to its detail page. "Load more"
  appends the next 100 ranks.
- **Search** — a debounced type-ahead over the full CoinGecko catalog with
  keyboard navigation (↑/↓/Enter/Escape); selecting a result opens its detail
  page.
- Responsive: lower-priority columns collapse at small widths, the coin-name
  column stays sticky while the table scrolls horizontally.

### `/coin/:id` — coin detail

`:id` accepts either a CoinGecko slug or a base58 **Solana mint address**
(resolved through the contract lookup).

- **Header** — icon, name, symbol, market-cap-rank badge, live price, and
  24h / 7d / 30d change chips, plus the coin's categories.
- **Interactive chart** — SVG line chart across 24H / 7D / 30D / 90D / 1Y with
  a crosshair tooltip showing exact price and time.
- **Market stats** — market cap, 24h volume, circulating/total supply,
  all-time high and low (dated), 24h high/low.
- **Related news** — live articles mentioning the coin, from the
  cryptocurrency.cv aggregator with a direct-RSS fallback.
- **About + links** — plain-text description, official site / social /
  explorer pills, and per-chain contract addresses with one-click copy.
- **three.ws integration** — coins with a Solana contract cross-link into
  [Alpha Copilot](/alpha-copilot) and the [live trade feed](/trades). A
  mint-shaped id that isn't on the market data source points to its
  [launch profile](/launches) and [Coin Intelligence](/coin-intel) instead.

Unknown ids, upstream outages, loading, and empty news all have designed
states — the page never renders a blank void.

## The market tools

Four more surfaces extend Markets, all sharing the same design system
([`src/coin-pages.css`](../src/coin-pages.css)) and real, key-free data. Every
one cross-links back into the markets table and the coin detail pages.

### `/heatmap` — market heatmap

Every top coin as a tile in a squarified treemap, **sized by market cap** and
**colored by its price move** (green up, red down, brightness scaling with the
move). Toggle the color between 24h and 7d, and the set between top 50 and top
100. Hover any tile for a price · 24h · 7d · market-cap tooltip; click it to open
the coin's detail page. The layout is computed client-side from the existing
`/api/coin/markets` feed — no extra endpoint.

### `/fear-greed` — Fear & Greed index

The market's mood as a single 0–100 score on a live semicircle **gauge**, with a
week-over-week delta and its classification (Extreme Fear → Extreme Greed). Below
it, an **interactive history chart** (30D / 90D / 1Y) with a crosshair tooltip,
and a labelled scale. Data is the alternative.me index — the same source the
`/coins` stats bar uses — served through `/api/coin/fear-greed`.

### `/gas` — Ethereum gas tracker

Live Ethereum gas in three tiers (**slow / standard / fast**), each in gwei with
a USD cost estimate, plus a cost-by-action table (ETH transfer, token transfer,
DEX swap, NFT mint). The page auto-refreshes every 15s and pauses when the tab is
hidden. Fees are read straight from the chain — `/api/coin/gas` calls
`eth_feeHistory` on a public RPC (with failover across four providers) and prices
each tier with the live ETH price. No third-party gas API, no key.

### `/compare` — side-by-side comparison

Up to four coins head to head: an **overlay chart** of normalized price
performance (% change from the window start) over 7D / 30D / 90D / 1Y with a
multi-series crosshair, and a **stats table** lining up price, 24h/7d/30d change,
market cap, volume, FDV, supply, and all-time high — the best value per row
highlighted. Add coins with the search type-ahead; the selection is mirrored to
`?ids=…` so any matchup is a shareable link. Reuses `/api/coin/markets` (search),
`/api/coin/detail`, and `/api/coin/ohlc` — no new endpoint.

## Where the data comes from

All data is real and fetched at runtime — nothing is hardcoded or sampled:

| Endpoint | Upstream | Cache |
|---|---|---|
| `/api/coin/detail` | CoinGecko `/coins/{id}` or `/coins/solana/contract/{mint}` | 60 s |
| `/api/coin/ohlc` | CoinGecko `/coins/{id}/market_chart` | 120 s |
| `/api/coin/markets` | CoinGecko `/coins/markets`, `/search` | 60 s / 300 s |
| `/api/coin/global` | CoinGecko `/global` + alternative.me Fear & Greed | 120 s |
| `/api/coin/fear-greed` | alternative.me `/fng` (current + history) | 300 s |
| `/api/coin/gas` | public Ethereum RPC `eth_feeHistory` + CoinGecko ETH price | 15 s |
| `/api/coin/news` | cryptocurrency.cv aggregator → first-party RSS fallback | 300 s |

Full request/response shapes: [api-reference.md → Coin Market Data API](api-reference.md#coin-market-data-api).

The proxies live in [`api/coin/`](../api/coin) over the shared
[`api/_lib/coingecko.js`](../api/_lib/coingecko.js) fetcher (optional
`COINGECKO_API_KEY` env lifts the public rate limit; everything works
key-free). Payloads are slimmed server-side — the markets endpoint downsamples
sparklines so 100 rows stay light, and coin descriptions are stripped to plain
text before they reach the client.

## Code map

| Piece | Location |
|---|---|
| Markets page | [`pages/coins.html`](../pages/coins.html) + [`src/coins-index.js`](../src/coins-index.js) |
| Detail page | [`pages/coin.html`](../pages/coin.html) + [`src/coin-page.js`](../src/coin-page.js) |
| Heatmap | [`pages/heatmap.html`](../pages/heatmap.html) + [`src/heatmap.js`](../src/heatmap.js) |
| Fear & Greed | [`pages/fear-greed.html`](../pages/fear-greed.html) + [`src/fear-greed.js`](../src/fear-greed.js) |
| Gas tracker | [`pages/gas.html`](../pages/gas.html) + [`src/gas.js`](../src/gas.js) |
| Compare | [`pages/compare.html`](../pages/compare.html) + [`src/compare.js`](../src/compare.js) |
| Shared design system | [`src/coin-pages.css`](../src/coin-pages.css) (Source Serif 4 self-hosted in `public/fonts/`) |
| Shared formatters | [`src/shared/coin-format.js`](../src/shared/coin-format.js) — unit-tested in [`tests/coin-format.test.js`](../tests/coin-format.test.js) |
| API proxies | [`api/coin/`](../api/coin) — `detail.js`, `ohlc.js`, `markets.js`, `global.js`, `fear-greed.js`, `gas.js`, `news.js` |

Routing: `vercel.json` rewrites `/coins`, `/coin/<id>`, `/heatmap`,
`/fear-greed`, `/gas`, and `/compare` to their pages in production; the Vite dev
server mirrors each (including the dynamic `/coin/:id` path). The pre-existing
`/coin` (no id) redirect to `/demo/coin` is untouched.
