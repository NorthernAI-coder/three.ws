// GET /api/ops/health — comprehensive internal platform health check.
//
// Returns live probe results for every critical subsystem + cron heartbeats
// from Redis. Requires x-ops-secret header (OPS_SECRET env var). If the env
// var is unset, falls back to CRON_SECRET so ops pages work without extra setup.

import { cors, error, json, wrap, rateLimited } from '../_lib/http.js';
import { limits, clientIp } from '../_lib/rate-limit.js';
import { cacheGet } from '../_lib/cache.js';
import { env } from '../_lib/env.js';
import { constantTimeEquals } from '../_lib/crypto.js';
import { sql } from '../_lib/db.js';

const PROBE_TIMEOUT_MS = 8_000;
const ORIGIN = env.APP_ORIGIN || 'https://three.ws';

// ── Subsystems to probe live ─────────────────────────────────────────────────
// Each probe hits a real endpoint from outside. Grouped by category.
const PROBES = [
	// Core
	{ id: 'site', cat: 'core', label: 'Website', path: '/', expect: 200 },
	{ id: 'api', cat: 'core', label: 'Platform API', path: '/api/healthz', expect: 200 },
	{ id: 'explore', cat: 'core', label: 'Explore feed', path: '/api/explore', expect: [200, 401] },
	// x402
	{ id: 'x402_discovery', cat: 'x402', label: 'x402 discovery', path: '/.well-known/x402.json', expect: 200 },
	{ id: 'x402_dance_tip', cat: 'x402', label: 'dance-tip endpoint', path: '/api/x402/dance-tip', expect: 402 },
	{ id: 'x402_mint_batch', cat: 'x402', label: 'mint-to-mesh-batch', path: '/api/x402/mint-to-mesh-batch', method: 'POST', expect: 402 },
	{ id: 'x402_pay', cat: 'x402', label: 'x402-pay handler', path: '/api/x402-pay', method: 'POST', expect: [200, 400, 401] },
	// Pumpfun / trading
	{ id: 'pump_action', cat: 'trading', label: 'Pump action API', path: '/api/pump/launches', expect: [200, 400, 401, 404] },
	{ id: 'oracle_feed', cat: 'trading', label: 'Oracle feed', path: '/api/oracle/feed', expect: [200, 401] },
	{ id: 'oracle_signal', cat: 'trading', label: 'Oracle signal', path: '/api/oracle/signal', expect: [200, 401] },
	// Agents
	{ id: 'agents_public', cat: 'agents', label: 'Public agents list', path: '/api/agents/public', expect: [200, 401] },
	{ id: 'agents_featured', cat: 'agents', label: 'Featured agents', path: '/api/agents/featured', expect: [200, 401] },
	// Marketplace
	{ id: 'marketplace', cat: 'marketplace', label: 'Marketplace API', path: '/api/marketplace/agents', expect: [200, 401] },
	// Forge / AI
	{ id: 'forge_gallery', cat: 'ai', label: 'Forge gallery', path: '/api/forge-gallery', expect: [200, 401] },
	// Tips / social
	{ id: 'club_tips', cat: 'social', label: 'Tips stream (probe)', path: '/api/club/tips-stream', method: 'HEAD', expect: [200, 400, 401, 426] },
	// Avatars
	{ id: 'avatars_featured', cat: 'avatars', label: 'Featured avatars', path: '/api/avatars/featured', expect: [200, 401] },
	// Auth
	{ id: 'auth', cat: 'auth', label: 'Auth endpoint', path: '/api/auth', expect: [200, 400, 401, 404, 405] },
	// Payments
	{ id: 'pay_session', cat: 'payments', label: 'Payment sessions', path: '/api/pay/session', expect: [200, 401] },
	// Notifications
	{ id: 'notifications', cat: 'core', label: 'Notifications', path: '/api/notifications', expect: [200, 401] },
];

// ── Crons we expect to have heartbeats ──────────────────────────────────────
// stale_after_ms: how long before we consider a missing heartbeat a problem.
const CRONS = [
	{ id: 'uptime-check', label: 'Uptime monitor', stale_after_ms: 15 * 60 * 1000 },
	{ id: 'pulse-tick', label: 'Pulse tick', stale_after_ms: 15 * 60 * 1000 },
	{ id: 'oracle-score', label: 'Oracle score', stale_after_ms: 20 * 60 * 1000 },
	{ id: 'oracle-digest', label: 'Oracle digest', stale_after_ms: 70 * 60 * 1000 },
	{ id: 'three-holders-snapshot', label: 'THREE holders snapshot', stale_after_ms: 70 * 60 * 1000 },
	{ id: 'payment-session-sweep', label: 'Payment session sweep', stale_after_ms: 15 * 60 * 1000 },
	{ id: 'flush-usage-events', label: 'Flush usage events', stale_after_ms: 20 * 60 * 1000 },
	{ id: 'reflect-sweep', label: 'Reflect sweep', stale_after_ms: 70 * 60 * 1000 },
	{ id: 'forge-seed-cron', label: 'Forge seed', stale_after_ms: 40 * 60 * 1000 },
	{ id: 'avaturn-seed-cron', label: 'Avaturn seed', stale_after_ms: 6 * 60 * 60 * 1000 },
	{ id: 'smart-money-rollup', label: 'Smart money rollup', stale_after_ms: 70 * 60 * 1000 },
	{ id: 'smart-money-graph', label: 'Smart money graph', stale_after_ms: 70 * 60 * 1000 },
	{ id: 'dead-man-switch', label: 'Dead man switch', stale_after_ms: 15 * 60 * 1000 },
	{ id: 'world-health', label: 'World health', stale_after_ms: 40 * 60 * 1000 },
	{ id: 'quota-check', label: 'Quota check', stale_after_ms: 40 * 60 * 1000 },
	{ id: 'recompute-reputation', label: 'Reputation recompute', stale_after_ms: 6 * 60 * 60 * 1000 },
	{ id: 'copy-fanout', label: 'Copy fanout', stale_after_ms: 40 * 60 * 1000 },
	{ id: 'mirror-fanout', label: 'Mirror fanout', stale_after_ms: 40 * 60 * 1000 },
	{ id: 'signal-fanout', label: 'Signal fanout', stale_after_ms: 40 * 60 * 1000 },
	{ id: 'strategy-fanout', label: 'Strategy fanout', stale_after_ms: 40 * 60 * 1000 },
	{ id: 'gmgn-seed', label: 'GMGN seed', stale_after_ms: 70 * 60 * 1000 },
	{ id: 'intel-learn', label: 'Intel learn', stale_after_ms: 40 * 60 * 1000 },
	{ id: 'wallet-intents', label: 'Wallet intents', stale_after_ms: 15 * 60 * 1000 },
	{ id: 'auto-rig-sweep', label: 'Auto rig sweep', stale_after_ms: 40 * 60 * 1000 },
	{ id: 'radar-watchlist', label: 'Radar watchlist', stale_after_ms: 40 * 60 * 1000 },
];

async function runProbe(probe) {
	const url = `${ORIGIN}${probe.path}`;
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
	const t0 = Date.now();
	try {
		const res = await fetch(url, {
			method: probe.method || 'GET',
			redirect: 'manual',
			signal: controller.signal,
			headers: { 'user-agent': 'threews-ops-health/1.0' },
		});
		const ms = Date.now() - t0;
		const expected = Array.isArray(probe.expect) ? probe.expect : [probe.expect];
		const ok = expected.includes(res.status);
		return { id: probe.id, cat: probe.cat, label: probe.label, ok, status: res.status, ms };
	} catch (err) {
		return { id: probe.id, cat: probe.cat, label: probe.label, ok: false, status: 0, ms: Date.now() - t0, err: err?.message };
	} finally {
		clearTimeout(timer);
	}
}

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'GET,OPTIONS', origins: 'same' })) return;
	if (req.method?.toUpperCase() !== 'GET') return error(res, 405, 'method_not_allowed', 'GET only');

	const rl = await limits.authIp(clientIp(req));
	if (!rl.success) return rateLimited(res, rl);

	const secret = env.OPS_SECRET || env.CRON_SECRET;
	if (secret) {
		const provided = req.headers['x-ops-secret'] || req.headers['authorization']?.replace(/^Bearer\s+/i, '');
		if (!provided || !constantTimeEquals(provided, secret)) {
			return error(res, 401, 'unauthorized', 'x-ops-secret required');
		}
	}

	const t0 = Date.now();

	// Run all probes in parallel
	const probeResults = await Promise.all(PROBES.map(runProbe));

	// Load all cron heartbeats in parallel
	const heartbeats = await Promise.all(
		CRONS.map(async (cron) => {
			const hb = await cacheGet(`cron:heartbeat:${cron.id}`).catch(() => null);
			const now = Date.now();
			const lastRan = hb?.t ?? null;
			const msSince = lastRan ? now - lastRan : null;
			const stale = msSince === null || msSince > cron.stale_after_ms;
			return {
				id: cron.id,
				label: cron.label,
				ok: hb?.ok ?? null,
				lastRan,
				msSince,
				stale,
				lastErr: hb?.ok === false ? hb.err : null,
				durationMs: hb?.ms ?? null,
			};
		}),
	);

	// Cross-network payment circuit breaker — latest per-network status written
	// hourly by the autonomous loop (api/_lib/x402/circuit-breaker.js). A tripped
	// route or failed Solana settlement means the payment stack is degraded.
	const circuitBreaker = await loadCircuitBreaker();

	// Agent wallet balance — latest sample written every 10 min by the autonomous
	// loop (api/_lib/x402/wallet-balance-monitor.js). A low/unconfigured wallet
	// means autonomous calls are about to start failing on insufficient funds.
	const walletBalance = await loadWalletBalance();

	// Payment-proof idempotency audit — latest verdict written daily by the
	// autonomous loop (api/_lib/x402/pipelines/payment-proof-idempotency-audit.js).
	// A confirmed double-settlement means the x402 anti-replay guard is broken.
	const idempotencyAudit = await loadIdempotencyAudit();

	// Categorize probe results
	const byCategory = {};
	for (const r of probeResults) {
		if (!byCategory[r.cat]) byCategory[r.cat] = [];
		byCategory[r.cat].push(r);
	}

	const allProbesOk = probeResults.every((r) => r.ok);
	const allCronsOk = heartbeats.every((h) => !h.stale && h.ok !== false);
	// A missing breaker row (never run / table absent) is unknown, not failing —
	// don't fail health on a feature that hasn't booted. Only a present-and-degraded
	// breaker folds into the verdict.
	const breakerOk = circuitBreaker.ok !== false;
	// A low or unconfigured wallet degrades health (autonomous spend will fail);
	// a never-run monitor (ok:null) is unknown, not failing.
	const walletOk = walletBalance.ok !== false;
	// A confirmed double-settlement (ok:false) degrades health; a never-run audit
	// (ok:null) is unknown, not failing.
	const idempotencyOk = idempotencyAudit.ok !== false;
	const overallOk = allProbesOk && allCronsOk && breakerOk && walletOk && idempotencyOk;

	const failingProbes = probeResults.filter((r) => !r.ok);
	const failingCrons = heartbeats.filter((h) => h.stale || h.ok === false);

	return json(res, overallOk ? 200 : 207, {
		ok: overallOk,
		checkedAt: t0,
		durationMs: Date.now() - t0,
		summary: {
			probes: { total: probeResults.length, ok: probeResults.filter((r) => r.ok).length, failing: failingProbes.length },
			crons: { total: heartbeats.length, ok: heartbeats.filter((h) => !h.stale && h.ok !== false).length, failing: failingCrons.length },
		},
		failing: {
			probes: failingProbes,
			crons: failingCrons,
		},
		probes: byCategory,
		crons: heartbeats,
		circuitBreaker,
		walletBalance,
		idempotencyAudit,
	});
});

// Read the latest payment-proof idempotency audit verdict written daily by the
// autonomous loop (api/_lib/x402/pipelines/payment-proof-idempotency-audit.js).
// ok:false ONLY on a confirmed double-settlement (the anti-replay guard failed);
// a stale or never-run audit is unknown (ok:null), not failing, so health doesn't
// trip on a cold or paused feature.
const IDEMPOTENCY_STALE_AFTER_MS = 48 * 60 * 60 * 1000; // 48h (daily cadence + slack)

async function loadIdempotencyAudit() {
	try {
		const [row] = await sql`
			SELECT route, verdict, double_settled, pass, first_tx, second_tx,
			       second_marker, payment_id,
			       extract(epoch FROM ts) * 1000 AS checked_at_ms
			FROM x402_idempotency_audit
			ORDER BY ts DESC
			LIMIT 1
		`;
		if (!row) return { ok: null, reason: 'no_data' };
		const checkedAt = row.checked_at_ms ? Number(row.checked_at_ms) : null;
		const stale = checkedAt === null || Date.now() - checkedAt > IDEMPOTENCY_STALE_AFTER_MS;
		// Only a confirmed double-settlement fails health. A stale audit is unknown
		// (loop stopped writing), and an inconclusive run (first call never settled)
		// is not evidence of a broken guard → ok:null.
		const ok = row.double_settled ? false : stale ? null : row.verdict === 'inconclusive' ? null : true;
		return {
			ok,
			verdict: row.verdict,
			doubleSettled: row.double_settled,
			pass: row.pass,
			route: row.route,
			firstTx: row.first_tx,
			secondTx: row.second_tx,
			secondMarker: row.second_marker,
			paymentId: row.payment_id,
			lastChecked: checkedAt,
			stale,
		};
	} catch (err) {
		if (/does not exist|relation .* does not exist/i.test(err?.message || '')) {
			return { ok: null, reason: 'table_absent' };
		}
		return { ok: null, reason: `query_failed:${err?.message || 'unknown'}` };
	}
}

// Read the latest agent-wallet balance sample written every 10 min by the
// autonomous loop (api/_lib/x402/wallet-balance-monitor.js). A sample older than
// the staleness window means the monitor stopped writing; ok:null when it has
// never run (table absent / no rows) so health doesn't fail on a cold feature.
const WALLET_STALE_AFTER_MS = 30 * 60 * 1000; // 30m (10-min cadence + slack)

async function loadWalletBalance() {
	try {
		const [row] = await sql`
			SELECT address, configured, usdc, sol, low_balance, threshold_usdc,
			       usdc_delta, spend_rate_usdc_hr,
			       extract(epoch FROM ts) * 1000 AS checked_at_ms
			FROM agent_wallet_balance_log
			ORDER BY ts DESC
			LIMIT 1
		`;
		if (!row) return { ok: null, reason: 'no_data' };
		const checkedAt = row.checked_at_ms ? Number(row.checked_at_ms) : null;
		const stale = checkedAt === null || Date.now() - checkedAt > WALLET_STALE_AFTER_MS;
		// Degraded when the wallet is below threshold or unconfigured. A stale
		// sample is unknown (monitor stopped), not a balance failure → ok:null.
		const ok = stale ? null : !(row.low_balance || row.configured === false);
		return {
			ok,
			configured: row.configured,
			address: row.address,
			usdc: row.usdc != null ? Number(row.usdc) : null,
			sol: row.sol != null ? Number(row.sol) : null,
			lowBalance: row.low_balance,
			thresholdUsdc: row.threshold_usdc != null ? Number(row.threshold_usdc) : null,
			usdcDelta: row.usdc_delta != null ? Number(row.usdc_delta) : null,
			spendRateUsdcHr: row.spend_rate_usdc_hr != null ? Number(row.spend_rate_usdc_hr) : null,
			lastChecked: checkedAt,
			stale,
		};
	} catch (err) {
		if (/does not exist|relation .* does not exist/i.test(err?.message || '')) {
			return { ok: null, reason: 'table_absent' };
		}
		return { ok: null, reason: `query_failed:${err?.message || 'unknown'}` };
	}
}

// Read the latest per-network circuit-breaker snapshot. The hourly breaker
// upserts one row per network into x402_circuit_breaker; a row older than the
// staleness window means the loop stopped writing. Returns ok:null when the
// feature has never run (table absent / no rows) so health doesn't fail on it.
const BREAKER_STALE_AFTER_MS = 2 * 60 * 60 * 1000; // 2h (hourly cadence + slack)

async function loadCircuitBreaker() {
	try {
		const rows = await sql`
			SELECT network, label, scheme, advertised, route_ok, settled,
			       receipt_valid, tx_signature, error,
			       extract(epoch FROM checked_at) * 1000 AS checked_at_ms
			FROM x402_circuit_breaker
			ORDER BY label ASC
		`;
		if (!rows.length) return { ok: null, reason: 'no_data', networks: [] };
		const now = Date.now();
		const networks = rows.map((r) => {
			const checkedAt = r.checked_at_ms ? Number(r.checked_at_ms) : null;
			const stale = checkedAt === null || now - checkedAt > BREAKER_STALE_AFTER_MS;
			return {
				network: r.network,
				label: r.label,
				scheme: r.scheme,
				advertised: r.advertised,
				routeOk: r.route_ok,
				settled: r.settled,
				receiptValid: r.receipt_valid,
				txSignature: r.tx_signature,
				error: r.error,
				lastChecked: checkedAt,
				stale,
			};
		});
		const routesOk = networks.every((n) => n.routeOk && !n.stale);
		// Solana is the network we actually settle on; its settlement is the
		// end-to-end proof. Base/BSC are route-verify only.
		const solana = networks.find((n) => /solana/i.test(n.label) || /solana/i.test(n.network));
		const settlementOk = solana ? solana.settled && !solana.stale : false;
		const ok = routesOk && settlementOk;
		return {
			ok,
			routesOk,
			settlementOk,
			solanaTx: solana?.txSignature || null,
			networks,
		};
	} catch (err) {
		// Table not yet created (first boot before the loop runs) → unknown, not failing.
		if (/does not exist|relation .* does not exist/i.test(err?.message || '')) {
			return { ok: null, reason: 'table_absent', networks: [] };
		}
		return { ok: null, reason: `query_failed:${err?.message || 'unknown'}`, networks: [] };
	}
}
