// GET /api/cron/uptime-check — first-party synthetic uptime monitor.
//
// Every 5 minutes (vercel.json crons) this probes the platform's critical
// public surfaces from the outside (real HTTPS against APP_ORIGIN, exactly
// what a user or paying agent hits), records the results in the shared cache,
// and pages the ops Telegram channel on failure and recovery. /api/status
// serves the aggregates; /status renders them as the public status page.
//
// Storage layout (Upstash Redis via _lib/cache.js):
//   uptime:snapshots — rolling 24h of raw probe rounds (288 @ 5-min cadence)
//   uptime:daily     — 90 days of per-target daily aggregates {n, up, msSum}
//
// A concrete file here outranks the [name].js dynamic dispatcher for this
// path, which keeps this handler's import graph tiny — a monitor must not
// share a 10s cold start with ethers/viem/pump-sdk.

import { error, json, method, wrap } from '../_lib/http.js';
import { env } from '../_lib/env.js';
import { cacheGet, cacheSet } from '../_lib/cache.js';
import { sendOpsAlert } from '../_lib/alerts.js';
import { constantTimeEquals } from '../_lib/crypto.js';

// The surfaces that constitute "the platform is up". Each is a cheap public
// GET — no auth, no side effects, no spend.
export const UPTIME_TARGETS = [
	{ id: 'site', label: 'Website', path: '/' },
	{ id: 'api', label: 'Platform API', path: '/api/healthz' },
	{ id: 'explore', label: 'Explore feed', path: '/api/explore' },
	{
		id: 'x402',
		label: 'x402 paid-API discovery',
		path: '/.well-known/x402-discovery?name=x402-discovery',
	},
	{ id: 'viewer', label: '3D viewer', path: '/viewer' },
];

const PROBE_TIMEOUT_MS = 10_000;
const SNAPSHOT_WINDOW = 288; // 24h at 5-minute cadence
const DAILY_WINDOW = 90;
const SNAPSHOTS_KEY = 'uptime:snapshots';
const DAILY_KEY = 'uptime:daily';
const SNAPSHOTS_TTL_S = 2 * 24 * 60 * 60;
const DAILY_TTL_S = 100 * 24 * 60 * 60;

async function probe(target, origin) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
	const started = Date.now();
	try {
		const res = await fetch(origin + target.path, {
			redirect: 'follow',
			headers: { 'user-agent': 'threews-uptime/1.0' },
			signal: controller.signal,
		});
		return { ok: res.ok, status: res.status, ms: Date.now() - started };
	} catch (e) {
		return {
			ok: false,
			status: 0,
			ms: Date.now() - started,
			error: e?.name === 'AbortError' ? 'timeout' : e?.message || 'fetch failed',
		};
	} finally {
		clearTimeout(timer);
	}
}

function requireCron(req, res) {
	const secret = process.env.CRON_SECRET || env.CRON_SECRET;
	if (!secret) {
		error(res, 503, 'not_configured', 'CRON_SECRET unset');
		return false;
	}
	const auth = req.headers['authorization'] || '';
	const presented = auth.startsWith('Bearer ') ? auth.slice(7) : '';
	if (!constantTimeEquals(presented, secret)) {
		error(res, 401, 'unauthorized', 'invalid cron secret');
		return false;
	}
	return true;
}

export default wrap(async (req, res) => {
	if (!method(req, res, ['GET'])) return;
	if (!requireCron(req, res)) return;

	const origin = env.APP_ORIGIN || 'https://three.ws';
	const results = Object.fromEntries(
		await Promise.all(
			UPTIME_TARGETS.map(async (t) => [t.id, await probe(t, origin)]),
		),
	);
	const now = Date.now();

	// Rolling raw snapshots (24h window).
	const snapshots = (await cacheGet(SNAPSHOTS_KEY)) || [];
	const previous = snapshots[snapshots.length - 1] || null;
	snapshots.push({ t: now, results });
	while (snapshots.length > SNAPSHOT_WINDOW) snapshots.shift();
	await cacheSet(SNAPSHOTS_KEY, snapshots, SNAPSHOTS_TTL_S);

	// Per-day aggregates (90-day window) — drives the status page uptime bars.
	const day = new Date(now).toISOString().slice(0, 10);
	const daily = (await cacheGet(DAILY_KEY)) || [];
	let today = daily[daily.length - 1];
	if (!today || today.d !== day) {
		today = { d: day, targets: {} };
		daily.push(today);
		while (daily.length > DAILY_WINDOW) daily.shift();
	}
	for (const [id, r] of Object.entries(results)) {
		const agg = (today.targets[id] ||= { n: 0, up: 0, msSum: 0 });
		agg.n += 1;
		if (r.ok) agg.up += 1;
		agg.msSum += r.ms;
	}
	await cacheSet(DAILY_KEY, daily, DAILY_TTL_S);

	// Alert on failures; announce recovery once the target answers again.
	// sendOpsAlert dedups per signature per hour, so a sustained outage pages
	// once an hour instead of every 5 minutes.
	for (const target of UPTIME_TARGETS) {
		const r = results[target.id];
		const prev = previous?.results?.[target.id];
		if (!r.ok) {
			sendOpsAlert(
				`DOWN: ${target.label}`,
				`${origin}${target.path}\n${r.error || `HTTP ${r.status}`} after ${r.ms}ms`,
				{ signature: `uptime:down:${target.id}` },
			);
		} else if (prev && !prev.ok) {
			sendOpsAlert(`RECOVERED: ${target.label}`, `${origin}${target.path} — ${r.ms}ms`, {
				signature: `uptime:recovered:${target.id}:${now}`,
			});
		}
	}

	const downCount = Object.values(results).filter((r) => !r.ok).length;
	return json(res, 200, { ok: downCount === 0, down: downCount, results });
});
