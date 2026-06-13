// Consolidated KOL endpoints dispatcher.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cors, json, method, readJson, wrap, error, rateLimited } from '../_lib/http.js';
import { limits, clientIp } from '../_lib/rate-limit.js';
import { requireAdmin } from '../_lib/admin.js';
import { putObject, getObjectBuffer } from '../_lib/r2.js';

// ── wallets (Birdeye P&L proxy) ───────────────────────────────────────────────

const BIRDEYE_BASE = 'https://public-api.birdeye.so';
const CACHE_TTL_MS = 60_000;
const MAX_ADDRESSES = 20;
const _cache = new Map(); // address → { data, ts }

function _getCached(addr) {
	const entry = _cache.get(addr);
	if (!entry) return null;
	if (Date.now() - entry.ts > CACHE_TTL_MS) {
		_cache.delete(addr);
		return null;
	}
	return entry.data;
}

function _setCache(addr, data) {
	_cache.set(addr, { data, ts: Date.now() });
}

async function _fetchBirdeye(addr, apiKey) {
	const url = `${BIRDEYE_BASE}/v1/wallet/portfolio?wallet=${encodeURIComponent(addr)}&chain=solana`;
	const ctrl = new AbortController();
	const t = setTimeout(() => ctrl.abort(), 8000);
	try {
		const res = await fetch(url, { headers: { 'X-API-KEY': apiKey }, signal: ctrl.signal });
		if (!res.ok) throw new Error(`birdeye ${res.status}`);
		const j = await res.json();
		if (!j.success) throw new Error('birdeye responded with success=false');
		return j.data;
	} finally {
		clearTimeout(t);
	}
}

function _normalizePortfolio(addr, portfolio) {
	const items = portfolio?.items ?? [];
	let topToken = null;
	let maxVal = 0;
	for (const item of items) {
		const val = item.valueUsd ?? 0;
		if (val > maxVal) {
			maxVal = val;
			topToken = { symbol: item.symbol ?? '?', pnl: val };
		}
	}
	return {
		address: addr,
		realizedPnl: portfolio?.realizedPnl ?? 0,
		unrealizedPnl: portfolio?.unrealizedPnl ?? portfolio?.totalUsd ?? 0,
		winRate: portfolio?.winRate ?? 0,
		totalTrades: portfolio?.totalTrades ?? 0,
		topToken,
	};
}

async function handleWallets(req, res) {
	if (cors(req, res, { methods: 'GET,OPTIONS', origins: '*' })) return;
	if (!method(req, res, ['GET'])) return;

	const apiKey = process.env.BIRDEYE_API_KEY;
	if (!apiKey) return error(res, 503, 'birdeye_not_configured', 'Birdeye API key not configured');

	const rl = await limits.mcpIp(clientIp(req));
	if (!rl.success) return rateLimited(res, rl);

	const url = new URL(req.url, `http://${req.headers.host}`);
	const addresses = (url.searchParams.get('addresses') ?? '')
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean)
		.slice(0, MAX_ADDRESSES);
	if (addresses.length === 0)
		return error(res, 400, 'validation_error', 'addresses query param is required');

	const uncached = addresses.filter((a) => _getCached(a) === null);
	const cacheHit = uncached.length === 0;

	if (uncached.length > 0) {
		await Promise.allSettled(
			uncached.map(async (addr) => {
				try {
					const portfolio = await _fetchBirdeye(addr, apiKey);
					_setCache(addr, _normalizePortfolio(addr, portfolio));
				} catch {
					_setCache(addr, _normalizePortfolio(addr, null));
				}
			}),
		);
	}

	const data = addresses.map((a) => _getCached(a)).filter(Boolean);
	res.setHeader('x-cache', cacheHit ? 'HIT' : 'MISS');
	return json(res, 200, { data });
}

const WALLETS_PATH = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'../../src/kol/wallets.json',
);

// Imported wallets live in R2 — the Vercel filesystem is read-only at runtime,
// so writes to the bundled wallets.json can never persist (or even succeed).
const WALLETS_R2_KEY = 'kol/wallets.json';

async function loadBundledWallets() {
	try {
		return JSON.parse(await readFile(WALLETS_PATH, 'utf8'));
	} catch {
		return [];
	}
}

async function loadImportedWallets() {
	try {
		const buf = await getObjectBuffer(WALLETS_R2_KEY);
		const parsed = JSON.parse(buf.toString('utf8'));
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return []; // nothing imported yet (or storage unreachable) — bundled list only
	}
}

// Merged view: R2-stored imports take precedence over the bundled seed file.
async function loadWallets() {
	const [bundled, imported] = await Promise.all([loadBundledWallets(), loadImportedWallets()]);
	const byWallet = new Map(bundled.map((w) => [w.wallet, w]));
	for (const w of imported) byWallet.set(w.wallet, w);
	return [...byWallet.values()];
}

// ── import-gmgn ───────────────────────────────────────────────────────────────

async function handleImportGmgn(req, res) {
	if (cors(req, res, { methods: 'POST,OPTIONS', origins: '*' })) return;
	if (!method(req, res, ['POST'])) return;
	const rl = await limits.mcpIp(clientIp(req));
	if (!rl.success) return rateLimited(res, rl);
	// Writes the tracked-wallet list that downstream KOL surfaces read — admin only.
	const admin = await requireAdmin(req, res);
	if (!admin) return;
	const body = await readJson(req);
	if (!body || body.rawJson == null)
		return error(res, 400, 'validation_error', 'body.rawJson is required');
	const { parseGmgnSmartWallets } = await import('../../src/kol/gmgn-parser.js');
	let parsed;
	try {
		parsed = parseGmgnSmartWallets(body.rawJson);
	} catch (err) {
		return error(res, 400, 'validation_error', err.message);
	}
	const existing = await loadWallets();
	const byWallet = new Map(existing.map((w) => [w.wallet, w]));
	for (const entry of parsed) byWallet.set(entry.wallet, entry);
	const merged = [...byWallet.values()];
	try {
		await putObject({
			key: WALLETS_R2_KEY,
			body: JSON.stringify(merged, null, '\t') + '\n',
			contentType: 'application/json',
		});
	} catch (err) {
		console.error('[kol/import-gmgn] R2 write failed:', err?.message || err);
		return error(res, 503, 'storage_unavailable', 'failed to persist imported wallets');
	}
	return json(res, 200, { imported: parsed.length, wallets: merged });
}

// ── leaderboard ───────────────────────────────────────────────────────────────

async function handleLeaderboard(req, res) {
	if (cors(req, res, { methods: 'GET,OPTIONS', origins: '*' })) return;
	if (!method(req, res, ['GET'])) return;
	const rl = await limits.mcpIp(clientIp(req));
	if (!rl.success) return rateLimited(res, rl);
	const url = new URL(req.url, `http://${req.headers.host}`);
	const window = url.searchParams.get('window') || '7d';
	const limitRaw = url.searchParams.get('limit');
	const limit = Math.min(Math.max(Number(limitRaw) || 25, 1), 100);
	const { getLeaderboard } = await import('../../src/kol/leaderboard.js');
	let items;
	try {
		items = await getLeaderboard({ window, limit });
	} catch (err) {
		if (err.status === 400) return error(res, 400, err.code || 'validation_error', err.message);
		throw err;
	}
	return json(res, 200, { items });
}

// ── trades ────────────────────────────────────────────────────────────────────

async function handleTrades(req, res) {
	if (cors(req, res, { methods: 'GET,OPTIONS' })) return;
	if (!method(req, res, ['GET'])) return;
	// fetchKolTrades fans out one Helius call per tracked wallet — meter per IP.
	const rl = await limits.mcpIp(clientIp(req));
	if (!rl.success) return rateLimited(res, rl);
	const url = new URL(req.url, 'http://x');
	const mint = url.searchParams.get('mint');
	const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') || '20')));
	if (!mint) return error(res, 400, 'validation_error', 'mint is required');
	const { KOL_WALLETS } = await import('../../src/kol/wallets.js');
	const { fetchKolTrades } = await import('../../src/kol/trades.js');
	let result;
	try {
		result = await fetchKolTrades({ mint, limit });
	} catch (err) {
		return error(
			res,
			err.status || 502,
			err.code || 'provider_unavailable',
			err.message || 'provider error',
		);
	}
	res.setHeader('x-kol-source', result.source || 'unconfigured');
	return json(res, 200, { mint, trades: result.trades, wallets: KOL_WALLETS.length });
}

// ── dispatcher ────────────────────────────────────────────────────────────────

const DISPATCH = {
	'import-gmgn': handleImportGmgn,
	leaderboard: handleLeaderboard,
	trades: handleTrades,
	wallets: handleWallets,
};

export default wrap(async (req, res) => {
	const action = req.query?.action ?? new URL(req.url, 'http://x').pathname.split('/').pop();
	const fn = DISPATCH[action];
	if (!fn) return error(res, 404, 'not_found', `unknown kol action: ${action}`);
	return fn(req, res);
});
