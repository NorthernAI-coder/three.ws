# @three-ws/liquidation-collector

Standalone Node service that subscribes to the **public** futures liquidation
WebSocket streams of Binance, Bybit, and OKX, classifies each liquidation by
USD size, keeps a rolling 4-hour in-memory window, and serves an aggregate
REST snapshot.

It feeds the "liquidations pulse" strip on [three.ws/coins](https://three.ws/coins)
via the proxy endpoint [`api/coin/liquidations.js`](../../api/coin/liquidations.js).

Ported from a battle-tested 283-line SperaxOS collector — same stream URLs,
per-exchange parsing, size buckets, reconnect/backoff, rolling window, and
aggregate math.

## Why a separate service

This process holds three long-lived WebSocket connections open indefinitely.
That is fundamentally incompatible with Vercel/serverless functions (which are
short-lived, request-scoped invocations) — it **cannot** be deployed as a
Vercel function. It must run on an always-on Node host: a small VM, a Cloud
Run service with `min-instances >= 1` and no request timeout, a Fly.io app, a
Railway/Render worker, etc. Point `LIQUIDATION_COLLECTOR_URL` (set on the main
three.ws deployment) at wherever it ends up.

## Run it

```sh
cd services/liquidation-collector
npm install
npm start
# or, for local iteration with auto-restart on save:
npm run dev
```

No API keys or credentials are required — all three streams are public.
Liquidations on majors (BTC, ETH, SOL, …) typically start arriving within a
minute or two of connecting.

## Env vars

| Var    | Default | Description                                  |
| ------ | ------- | --------------------------------------------- |
| `PORT` | `3033`  | HTTP port the REST API listens on             |

## HTTP surface

### `GET /health`

```json
{ "ok": true, "cached": 1234, "uptime": 5821.4 }
```

### `GET /liquidations`

Returns the 50 most recent liquidations (across the tracked symbol list) plus
aggregate stats over the rolling 4-hour window.

```json
{
	"liquidations": [
		{
			"exchange": "Binance",
			"price": 61234.5,
			"qty": 0.42,
			"severity": "LARGE",
			"side": "LONG",
			"symbol": "BTC",
			"time": 1735689600000,
			"value": 257184.89
		}
	],
	"summary": {
		"dominantSide": "LONG PAIN",
		"largeCount": 12,
		"longCount": 340,
		"longValue": 8123456.12,
		"megaCount": 1,
		"shortCount": 190,
		"shortValue": 2456789.01,
		"totalCount": 530,
		"totalValue": 10580245.13
	},
	"symbolStats": [
		{ "count": 210, "longValue": 5123456.0, "shortValue": 890123.0, "symbol": "BTC" }
	],
	"timestamp": "2026-07-08T12:00:00.000Z"
}
```

- `severity` buckets: `SMALL` (< $10k), `MEDIUM` (< $100k), `LARGE` (< $1M), `MEGA` (>= $1M).
- `side` is the side that got liquidated: a forced-sell of a long is `LONG`, a forced-buy-back of a short is `SHORT`.
- `summary.dominantSide` is `LONG PAIN` when long liquidations exceed short liquidations by 1.5x, `SHORT SQUEEZE` for the inverse, `BALANCED` otherwise.

## Tracked symbols

BTC, ETH, SOL, DOGE, XRP, ARB, OP, AVAX, LINK, BNB, SUI, WIF, PEPE, BONK, INJ, TIA, APT, NEAR.

## Deploy note

Not a Vercel function — deploy to any always-on Node host (VM, Fly.io,
Railway, a dedicated Cloud Run service with `min-instances=1`, etc.). The
service reconnects each exchange stream automatically on disconnect (5s
backoff) and exits cleanly on process signals delivered by the host platform.
