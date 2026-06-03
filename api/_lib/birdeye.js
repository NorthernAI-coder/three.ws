// Shared Birdeye OHLCV fetch. Keeps BIRDEYE_API_KEY server-side and returns
// parsed candles [{ t, o, h, l, c, v }] (t = unix seconds), ascending by time.
// Throws an Error tagged with { status } so callers map to the right HTTP code.
// Never fabricates candles — upstream failures surface verbatim.

const BIRDEYE_OHLCV_URL = 'https://public-api.birdeye.so/defi/ohlcv';

export function birdeyeConfigured() {
	return !!process.env.BIRDEYE_API_KEY;
}

export async function fetchBirdeyeOhlcv({ mint, interval, from, to }) {
	const apiKey = process.env.BIRDEYE_API_KEY;
	if (!apiKey)
		throw Object.assign(new Error('On-chain data provider is not configured'), { status: 503 });

	const url =
		`${BIRDEYE_OHLCV_URL}?address=${encodeURIComponent(mint)}` +
		`&type=${interval}&time_from=${from}&time_to=${to}`;

	let upstream;
	try {
		upstream = await fetch(url, {
			headers: { 'X-API-KEY': apiKey, 'x-chain': 'solana', accept: 'application/json' },
			signal: AbortSignal.timeout(10_000),
		});
	} catch (e) {
		throw Object.assign(new Error(`Birdeye unreachable: ${e.message}`), { status: 502 });
	}

	if (!upstream.ok) {
		const body = await upstream.text().catch(() => '');
		throw Object.assign(new Error(`Birdeye ${upstream.status}: ${body.slice(0, 200)}`), {
			status: 502,
		});
	}

	const payload = await upstream.json().catch(() => null);
	const items = payload?.data?.items;
	if (!Array.isArray(items))
		throw Object.assign(new Error('Birdeye returned an unexpected payload'), { status: 502 });

	return items
		.map((it) => ({
			t: Number(it.unixTime),
			o: Number(it.o),
			h: Number(it.h),
			l: Number(it.l),
			c: Number(it.c),
			v: Number(it.v ?? 0),
		}))
		.filter((d) => Number.isFinite(d.t) && Number.isFinite(d.c));
}
