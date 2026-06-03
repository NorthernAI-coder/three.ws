// GET  /api/ibm/attest?token=<mint>|pool=<addr>[&timeframe=hour&aggregate=1]
// GET  /api/ibm/attest?list=trending
// POST /api/ibm/attest   { token|pool, network?, timeframe?, aggregate?, submit? }
// --------------------------------------------------------------------------
// Granite Proof — the on-chain AI notary.
//
// Forecasts a live Solana token's price with IBM Granite TimeSeries
// (watsonx.ai /ml/v1/time_series/forecast), narrates it with Granite chat, and
// GOVERNS that narration with Granite Guardian. The governed forecast is then
// notarized on Solana: a SHA-256 digest of the canonical claim is stamped into
// an SPL-memo transaction signed by the agent's own wallet — a public,
// timestamped, model-attributed record of exactly what the AI predicted.
//
// Trust is enforced, not decorative: if Granite Guardian flags the narration,
// the agent REFUSES to notarize it (governance veto). Nothing unsafe reaches
// the chain.
//
// All real APIs, no mock path. Candles come keyless from GeckoTerminal and are
// ALWAYS returned, so the 3D scene renders real history even when watsonx or the
// attester wallet are not configured; the forecast, governance, and on-chain
// proof fields appear only when those services are reachable.
import { createHash } from 'node:crypto';

import { cors, json, method, wrap, error, readJson } from '../_lib/http.js';
import { limits, clientIp } from '../_lib/rate-limit.js';
import { watsonxConfig, watsonxChatComplete } from '../_lib/watsonx.js';
import { watsonxForecast, watsonxGuardian, forecastModelFor } from '../_lib/watsonx-forecast.js';
import { fetchOhlcv, topPoolForToken, trendingPools } from '../_lib/market/ohlcv.js';
import {
	avatarWalletConfig,
	loadAvatarKeypair,
	getConnection,
	getSolBalance,
	sendSol,
	explorerTxUrl,
	explorerAccountUrl,
} from '../_lib/avatar-wallet.js';

const isBase58 = (s) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s);
const isoOf = (unixSec) => new Date(unixSec * 1000).toISOString();

// Deterministic JSON: object keys sorted recursively so the same claim always
// hashes to the same digest regardless of property insertion order.
function canonical(value) {
	if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
	if (value && typeof value === 'object') {
		return `{${Object.keys(value)
			.sort()
			.map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`)
			.join(',')}}`;
	}
	return JSON.stringify(value === undefined ? null : value);
}
const sha256hex = (s) => createHash('sha256').update(s).digest('hex');

// Map a forecast %-change to an avatar emotion + sentiment in [-1, 1].
function moodFor(changePct) {
	const sentiment = Math.max(-1, Math.min(1, changePct / 15));
	let emotion = 'patience';
	if (changePct >= 8) emotion = 'celebration';
	else if (changePct >= 2) emotion = 'curiosity';
	else if (changePct <= -8) emotion = 'concern';
	else if (changePct <= -2) emotion = 'empathy';
	return { sentiment: Number(sentiment.toFixed(3)), emotion };
}

async function narrate(cfg, { name, symbol, currentPrice, stats }) {
	const dir = stats.changePct >= 0 ? 'higher' : 'lower';
	const system =
		'You are the embodied voice of an IBM Granite-powered market oracle inside a 3D scene that ' +
		'notarizes its forecasts on a public blockchain. Given a token and a Granite TimeSeries price ' +
		'forecast, narrate it in exactly two short, vivid sentences a trader would respect. State the ' +
		'direction and magnitude. Do not give financial advice, do not use hashtags or emojis, and ' +
		'never invent numbers beyond those given.';
	const user =
		`Token: ${name} (${symbol}). Current price: $${currentPrice}. ` +
		`Granite TimeSeries forecasts the price moving ${dir} by ${stats.changePct.toFixed(1)}% ` +
		`over the next ${stats.horizonHours} hours (forecast low $${stats.forecastLow}, high $${stats.forecastHigh}). ` +
		`Narrate this forecast.`;
	const { text, model } = await watsonxChatComplete(cfg, {
		messages: [
			{ role: 'system', content: system },
			{ role: 'user', content: user },
		],
		maxTokens: 160,
		temperature: 0.6,
	});
	return { text: (text || '').trim(), model };
}

// Build the on-chain memo for a claim — kept compact (the SPL-memo write is
// truncated at 180 bytes by the wallet layer; we stay well under).
function memoFor({ symbol, stats, governance, digest, tsModel }) {
	const arrow = stats.direction === 'up' ? '+' : stats.direction === 'down' ? '-' : '~';
	const ts = String(tsModel || '').replace('ibm/granite-ttm-', 'ttm-').replace('-r2', '');
	const gd = governance?.passed === false ? 'flag' : governance?.passed === true ? 'ok' : 'na';
	return (
		`three.ws granite-proof/1 ${symbol || '?'} ${arrow}${Math.abs(stats.changePct).toFixed(1)}% ` +
		`${stats.horizonHours}h ${ts} gd:${gd} ${digest.slice(0, 16)}`
	).slice(0, 180);
}

// Resolve and fetch real candles for the requested token/pool. Returns the same
// shape the page consumes, or throws an http-friendly { status, code, message }.
async function loadMarket(params) {
	const network = (params.network || 'solana').trim();
	let pool = (params.pool || '').trim();
	const token = (params.token || '').trim();
	if (!pool && token) {
		if (!isBase58(token)) throw { status: 400, code: 'bad_token', message: 'token must be a base58 mint' };
		pool = await topPoolForToken(token, network);
	}
	if (!pool || !isBase58(pool)) {
		throw { status: 400, code: 'bad_request', message: 'provide ?pool=<addr> or ?token=<mint>, or ?list=trending' };
	}
	const timeframe = ['minute', 'hour', 'day'].includes(params.timeframe) ? params.timeframe : 'hour';
	const aggregate = Math.max(1, Math.min(60, parseInt(params.aggregate || '1', 10) || 1));
	const { candles, base, quote, freq } = await fetchOhlcv({ pool, network, timeframe, aggregate, limit: 1000 });
	if (candles.length < 64) throw { status: 422, code: 'insufficient_history', message: 'not enough candle history to chart this pool' };
	return { network, pool, timeframe, aggregate, candles, base, quote, freq };
}

// Run the full Granite pipeline (forecast → narrate → guardian) and assemble the
// canonical claim + digest + memo. Mutates and returns `out`. Best-effort: any
// upstream failure is recorded on `out.ibm` and history still stands.
async function runGranite(out, market, attesterAddress) {
	const { candles, freq, timeframe, aggregate } = market;
	const cfg = watsonxConfig();
	if (!cfg.configured) {
		out.ibm = { configured: false, reason: 'WATSONX_API_KEY + project not set' };
		return out;
	}
	if (candles.length < 512) {
		out.ibm = { configured: true, error: `need ≥512 candles for Granite TimeSeries, have ${candles.length}` };
		return out;
	}

	const window = candles.length >= 1536 ? 1536 : candles.length >= 1024 ? 1024 : 512;
	const slice = candles.slice(-window);
	const timestamps = slice.map((c) => isoOf(c.t));
	const values = slice.map((c) => c.c);

	let fc;
	try {
		fc = await watsonxForecast(cfg, {
			model: forecastModelFor(window),
			timestamps,
			values,
			freq,
			targetColumn: 'price',
		});
	} catch (fErr) {
		out.ibm = { configured: true, error: String(fErr.message || fErr) };
		return out;
	}

	const forecast = fc.timestamps.map((iso, i) => ({ t: Math.floor(Date.parse(iso) / 1000), c: Number(fc.values[i]) }));
	const currentPrice = values[values.length - 1];
	const forecastEnd = forecast[forecast.length - 1]?.c ?? currentPrice;
	const fVals = forecast.map((p) => p.c).filter(Number.isFinite);
	const stats = {
		currentPrice,
		forecastEnd,
		forecastLow: Math.min(...fVals),
		forecastHigh: Math.max(...fVals),
		changePct: ((forecastEnd - currentPrice) / currentPrice) * 100,
		direction: forecastEnd > currentPrice ? 'up' : forecastEnd < currentPrice ? 'down' : 'flat',
		horizonHours: timeframe === 'hour' ? forecast.length * aggregate : forecast.length,
	};
	out.forecast = forecast;
	out.stats = stats;
	out.mood = moodFor(stats.changePct);

	// Granite narration + Guardian governance.
	let narration = null;
	let governance = null;
	try {
		const n = await narrate(cfg, {
			name: out.token.name,
			symbol: out.token.symbol,
			currentPrice: currentPrice.toPrecision(6),
			stats: {
				changePct: stats.changePct,
				horizonHours: stats.horizonHours,
				forecastLow: stats.forecastLow.toPrecision(6),
				forecastHigh: stats.forecastHigh.toPrecision(6),
			},
		});
		narration = { text: n.text, model: n.model };
		try {
			const g = await watsonxGuardian(cfg, { text: n.text, risk: 'harm' });
			governance = { passed: !g.flagged, risk: g.risk, label: g.label, model: g.model };
		} catch (gErr) {
			governance = { passed: null, error: String(gErr.message || gErr) };
		}
	} catch (nErr) {
		narration = { text: '', error: String(nErr.message || nErr) };
	}
	out.narration = narration;
	out.governance = governance;

	// Canonical claim → digest → memo. The claim is exactly what gets notarized.
	const claim = {
		v: 'granite-proof/1',
		domain: 'three.ws',
		token: { symbol: out.token.symbol, name: out.token.name, pool: out.token.pool, network: out.token.network },
		price: { current: Number(currentPrice), quote: out.token.quoteSymbol },
		forecast: {
			end: Number(forecastEnd),
			low: Number(stats.forecastLow),
			high: Number(stats.forecastHigh),
			changePct: Number(stats.changePct.toFixed(4)),
			direction: stats.direction,
			horizonHours: stats.horizonHours,
		},
		models: { timeseries: fc.model, narrator: narration?.model || null, guardian: governance?.model || null },
		governance: { risk: governance?.risk || null, passed: governance?.passed ?? null },
		attester: attesterAddress || null,
		issuedAt: out.generatedAt,
	};
	const digest = sha256hex(canonical(claim));
	out.ibm = { configured: true, forecastModel: fc.model, inputWindow: fc.inputWindow };
	out.proof = {
		digest,
		algorithm: 'sha256',
		claim,
		memo: memoFor({ symbol: out.token.symbol, stats, governance, digest, tsModel: fc.model }),
	};
	return out;
}

function baseRecord(market) {
	return {
		token: {
			name: market.base?.name || 'Token',
			symbol: market.base?.symbol || '',
			quoteSymbol: market.quote?.symbol || 'USD',
			pool: market.pool,
			network: market.network,
		},
		timeframe: market.timeframe,
		aggregate: market.aggregate,
		freq: market.freq,
		history: market.candles.map((c) => ({ t: c.t, c: c.c })),
		forecast: null,
		stats: null,
		narration: null,
		governance: null,
		mood: null,
		proof: null,
		ibm: { configured: false },
		generatedAt: new Date().toISOString(),
	};
}

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'GET,POST,OPTIONS', origins: '*' })) return;
	if (!method(req, res, ['GET', 'POST'])) return;

	const rl = await limits.publicIp(clientIp(req));
	if (!rl.success) return error(res, 429, 'rate_limited', 'too many requests');

	const url = new URL(req.url, 'http://x');
	const wallet = avatarWalletConfig();

	// ── Picker: trending Solana pools ────────────────────────────────────────
	if (req.method === 'GET' && url.searchParams.get('list') === 'trending') {
		const pools = await trendingPools('solana', 8);
		return json(res, 200, { pools }, { 'cache-control': 'public, max-age=30, s-maxage=60' });
	}

	// Gather params from query (GET) or JSON body (POST).
	let params;
	let submit = false;
	if (req.method === 'POST') {
		const body = (await readJson(req).catch(() => ({}))) || {};
		params = {
			token: body.token,
			pool: body.pool,
			network: body.network,
			timeframe: body.timeframe,
			aggregate: body.aggregate,
		};
		submit = Boolean(body.submit);
	} else {
		params = Object.fromEntries(url.searchParams.entries());
	}

	// ── Real candles (keyless, always returned) ──────────────────────────────
	let market;
	try {
		market = await loadMarket(params);
	} catch (e) {
		if (e && e.status) return error(res, e.status, e.code, e.message);
		throw e;
	}

	const out = baseRecord(market);
	out.attester = wallet.configured
		? { address: wallet.address, network: wallet.network, explorer: explorerAccountUrl(wallet.address, wallet.network) }
		: { address: null, network: wallet.network, configured: false };

	await runGranite(out, market, wallet.address);

	// ── On-chain notarization state ──────────────────────────────────────────
	const canNotarize = Boolean(out.proof) && out.governance?.passed !== false;
	out.onchain = {
		submitted: false,
		ready: canNotarize && wallet.configured,
		attester: wallet.address || null,
		network: wallet.network,
		memo: out.proof?.memo || null,
		reason: !out.proof
			? out.ibm?.reason || out.ibm?.error || 'forecast unavailable'
			: out.governance?.passed === false
				? 'vetoed_by_guardian'
				: !wallet.configured
					? 'attester wallet not configured (AVATAR_WALLET_SECRET)'
					: null,
	};

	// POST with submit:true actually writes the proof on-chain (server is
	// authoritative — it re-derives the digest and never trusts a client value).
	if (submit && req.method === 'POST') {
		if (!out.proof) {
			out.onchain.error = 'nothing to notarize: ' + (out.onchain.reason || 'no forecast');
		} else if (out.governance?.passed === false) {
			out.onchain.error = 'Granite Guardian vetoed this narration; refusing to notarize';
		} else if (!wallet.configured) {
			out.onchain.error = 'attester wallet not configured';
		} else {
			try {
				const conn = getConnection(wallet.rpcUrl);
				const keypair = loadAvatarKeypair(process.env.AVATAR_WALLET_SECRET);
				const bal = await getSolBalance(conn, keypair.publicKey);
				if (bal.lamports < 10_000) {
					out.onchain.error = `attester wallet unfunded (${bal.sol} SOL) — needs a little SOL to pay the network fee`;
				} else {
					// 1-lamport self-transfer carrying the proof memo: no value
					// leaves the wallet, the digest is permanently on-chain.
					const signature = await sendSol({
						connection: conn,
						fromKeypair: keypair,
						to: keypair.publicKey,
						lamports: 1,
						memo: out.proof.memo,
					});
					out.onchain = {
						...out.onchain,
						submitted: true,
						ready: true,
						signature,
						explorer: explorerTxUrl(signature, wallet.network),
						reason: null,
					};
				}
			} catch (e) {
				out.onchain.error = String(e?.message || e);
			}
		}
	}

	return json(res, 200, out, {
		'cache-control': req.method === 'POST' ? 'no-store' : 'public, max-age=20, s-maxage=30',
	});
});
