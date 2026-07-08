// three.ws liquidation-collector — standalone always-on Node service.
//
// Subscribes to the PUBLIC futures liquidation WebSocket streams of Binance,
// Bybit, and OKX, classifies each liquidation by USD size, keeps a rolling
// 4-hour in-memory window, and serves an aggregate REST snapshot consumed by
// `api/coin/liquidations.js` (proxy) → the "liquidations pulse" strip on
// three.ws/coins.
//
// Ported faithfully from the reference SperaxOS collector
// (_prompts/sperax/ref/liquidation-collector/index.ts) — same stream URLs,
// per-exchange parsing, size buckets, reconnect/backoff, rolling window, and
// aggregate math. The only change is swapping the Hono HTTP layer for plain
// node:http so this package has zero framework dependencies beyond `ws`.
//
// This process holds long-lived WebSocket connections — it is NOT deployable
// as a Vercel serverless function. Run it on any always-on Node host (see
// README.md) and point `LIQUIDATION_COLLECTOR_URL` at it.

import { createServer } from 'node:http';
import { WebSocket } from 'ws';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const TRACKED = [
	'BTC', 'ETH', 'SOL', 'DOGE', 'XRP', 'ARB', 'OP', 'AVAX', 'LINK',
	'BNB', 'SUI', 'WIF', 'PEPE', 'BONK', 'INJ', 'TIA', 'APT', 'NEAR',
];

const MAX_CACHE = 10_000;
const MAX_AGE_MS = 4 * 60 * 60 * 1000; // 4 hours

// ---------------------------------------------------------------------------
// In-memory store
// ---------------------------------------------------------------------------

/** @typedef {{ exchange: string, price: number, qty: number, severity: string, side: 'LONG'|'SHORT', symbol: string, time: number, value: number }} LiquidationEntry */

/** @type {LiquidationEntry[]} */
const cache = [];

function classify(value) {
	if (value >= 1_000_000) return 'MEGA';
	if (value >= 100_000) return 'LARGE';
	if (value >= 10_000) return 'MEDIUM';
	return 'SMALL';
}

function push(entry) {
	cache.push({ ...entry, severity: classify(entry.value) });
	if (cache.length > MAX_CACHE) cache.shift();
}

// ---------------------------------------------------------------------------
// Binance — public stream: wss://fstream.binance.com/ws/!forceOrder@arr
// ---------------------------------------------------------------------------

function connectBinance() {
	const ws = new WebSocket('wss://fstream.binance.com/ws/!forceOrder@arr');
	let ping;

	ws.on('open', () => {
		console.log('[Binance] connected');
		ping = setInterval(() => ws.ping(), 20_000);
	});

	ws.on('message', (data) => {
		try {
			const msg = JSON.parse(data.toString());
			const o = msg.o;
			if (!o) return;
			const base = String(o.s).replace('USDT', '').replace('BUSD', '');
			if (!TRACKED.includes(base)) return;
			const price = parseFloat(o.ap || o.p);
			const qty = parseFloat(o.q);
			if (isNaN(price) || isNaN(qty)) return;
			push({
				exchange: 'Binance',
				price,
				qty,
				side: o.S === 'BUY' ? 'SHORT' : 'LONG',
				symbol: base,
				time: o.T ?? Date.now(),
				value: price * qty,
			});
		} catch {}
	});

	ws.on('close', () => {
		clearInterval(ping);
		console.log('[Binance] disconnected — reconnecting in 5s');
		setTimeout(connectBinance, 5_000);
	});

	ws.on('error', (err) => {
		console.error('[Binance] error', err.message);
		ws.terminate();
	});
}

// ---------------------------------------------------------------------------
// Bybit — public stream: wss://stream.bybit.com/v5/public/linear
// Topics: liquidation.{SYMBOL}USDT
// ---------------------------------------------------------------------------

function connectBybit() {
	const ws = new WebSocket('wss://stream.bybit.com/v5/public/linear');
	let ping;

	ws.on('open', () => {
		console.log('[Bybit] connected');
		const args = TRACKED.map((s) => `liquidation.${s}USDT`);
		ws.send(JSON.stringify({ op: 'subscribe', args }));
		ping = setInterval(() => ws.send(JSON.stringify({ op: 'ping' })), 20_000);
	});

	ws.on('message', (data) => {
		try {
			const msg = JSON.parse(data.toString());
			// skip pong / subscribe confirmations
			if (msg.op || !msg.data) return;
			const d = msg.data;
			const base = (d.symbol ?? '').replace('USDT', '');
			if (!TRACKED.includes(base)) return;
			const price = parseFloat(d.price);
			const qty = parseFloat(d.size);
			if (isNaN(price) || isNaN(qty)) return;
			push({
				exchange: 'Bybit',
				price,
				qty,
				side: d.side === 'Buy' ? 'SHORT' : 'LONG',
				symbol: base,
				time: Number(d.updatedTime ?? d.updateTime) || Date.now(),
				value: price * qty,
			});
		} catch {}
	});

	ws.on('close', () => {
		clearInterval(ping);
		console.log('[Bybit] disconnected — reconnecting in 5s');
		setTimeout(connectBybit, 5_000);
	});

	ws.on('error', (err) => {
		console.error('[Bybit] error', err.message);
		ws.terminate();
	});
}

// ---------------------------------------------------------------------------
// OKX — public stream: wss://ws.okx.com:8443/ws/v5/public
// Channel: liquidation-orders (all SWAP instruments, real-time)
// ---------------------------------------------------------------------------

function connectOKX() {
	const ws = new WebSocket('wss://ws.okx.com:8443/ws/v5/public');
	let ping;

	ws.on('open', () => {
		console.log('[OKX] connected');
		ws.send(
			JSON.stringify({
				op: 'subscribe',
				args: [{ channel: 'liquidation-orders', instType: 'SWAP' }],
			}),
		);
		ping = setInterval(() => ws.send('ping'), 20_000);
	});

	ws.on('message', (data) => {
		try {
			const text = data.toString();
			if (text === 'pong') return;
			const msg = JSON.parse(text);
			if (msg.event) return; // subscribe ack
			if (!Array.isArray(msg.data)) return;
			for (const item of msg.data) {
				const base = String(item.instId).split('-')[0];
				if (!TRACKED.includes(base)) continue;
				for (const d of item.details ?? []) {
					const price = parseFloat(d.bkPx);
					const qty = parseFloat(d.sz);
					if (isNaN(price) || isNaN(qty)) continue;
					push({
						exchange: 'OKX',
						price,
						qty,
						side: d.side === 'buy' ? 'SHORT' : 'LONG',
						symbol: base,
						time: parseInt(d.ts) || Date.now(),
						value: price * qty,
					});
				}
			}
		} catch {}
	});

	ws.on('close', () => {
		clearInterval(ping);
		console.log('[OKX] disconnected — reconnecting in 5s');
		setTimeout(connectOKX, 5_000);
	});

	ws.on('error', (err) => {
		console.error('[OKX] error', err.message);
		ws.terminate();
	});
}

// ---------------------------------------------------------------------------
// REST API (consumed by api/coin/liquidations.js)
// ---------------------------------------------------------------------------

function buildSnapshot() {
	const cutoff = Date.now() - MAX_AGE_MS;
	const recent = cache
		.filter((l) => l.time > cutoff)
		.sort((a, b) => b.time - a.time);

	const longLiqs = recent.filter((l) => l.side === 'LONG');
	const shortLiqs = recent.filter((l) => l.side === 'SHORT');
	const longValue = longLiqs.reduce((s, l) => s + l.value, 0);
	const shortValue = shortLiqs.reduce((s, l) => s + l.value, 0);

	const bySymbol = {};
	for (const l of recent) {
		if (!bySymbol[l.symbol]) {
			bySymbol[l.symbol] = { count: 0, longValue: 0, shortValue: 0, symbol: l.symbol };
		}
		bySymbol[l.symbol].count++;
		if (l.side === 'LONG') bySymbol[l.symbol].longValue += l.value;
		else bySymbol[l.symbol].shortValue += l.value;
	}

	return {
		liquidations: recent.slice(0, 50),
		summary: {
			dominantSide:
				longValue > shortValue * 1.5
					? 'LONG PAIN'
					: shortValue > longValue * 1.5
						? 'SHORT SQUEEZE'
						: 'BALANCED',
			largeCount: recent.filter((l) => l.severity === 'LARGE').length,
			longCount: longLiqs.length,
			longValue,
			megaCount: recent.filter((l) => l.severity === 'MEGA').length,
			shortCount: shortLiqs.length,
			shortValue,
			totalCount: recent.length,
			totalValue: longValue + shortValue,
		},
		symbolStats: Object.values(bySymbol).sort(
			(a, b) => b.longValue + b.shortValue - (a.longValue + a.shortValue),
		),
		timestamp: new Date().toISOString(),
	};
}

function sendJson(res, status, body) {
	const payload = JSON.stringify(body);
	res.writeHead(status, {
		'content-type': 'application/json; charset=utf-8',
		'content-length': Buffer.byteLength(payload),
		'access-control-allow-origin': '*',
	});
	res.end(payload);
}

const server = createServer((req, res) => {
	const url = new URL(req.url ?? '/', 'http://localhost');

	if (req.method === 'OPTIONS') {
		res.writeHead(204, {
			'access-control-allow-origin': '*',
			'access-control-allow-methods': 'GET, OPTIONS',
		});
		res.end();
		return;
	}

	if (req.method !== 'GET') {
		sendJson(res, 405, { error: 'method_not_allowed' });
		return;
	}

	if (url.pathname === '/health') {
		sendJson(res, 200, { ok: true, cached: cache.length, uptime: process.uptime() });
		return;
	}

	if (url.pathname === '/liquidations') {
		sendJson(res, 200, buildSnapshot());
		return;
	}

	sendJson(res, 404, { error: 'not_found' });
});

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

connectBinance();
connectBybit();
connectOKX();

const port = parseInt(process.env.PORT ?? '3033', 10);
server.listen(port, () => {
	console.log(`liquidation-collector listening on :${port}`);
});
