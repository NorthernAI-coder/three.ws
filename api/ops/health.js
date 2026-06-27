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

	// Categorize probe results
	const byCategory = {};
	for (const r of probeResults) {
		if (!byCategory[r.cat]) byCategory[r.cat] = [];
		byCategory[r.cat].push(r);
	}

	const allProbesOk = probeResults.every((r) => r.ok);
	const allCronsOk = heartbeats.every((h) => !h.stale && h.ok !== false);
	const overallOk = allProbesOk && allCronsOk;

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
	});
});
