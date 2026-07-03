// @ts-check
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

import { error, json, method, wrapCron } from '../_lib/http.js';
import { env } from '../_lib/env.js';
import { cacheGet, cacheSet } from '../_lib/cache.js';
import { sendOpsAlert } from '../_lib/alerts.js';
import { constantTimeEquals } from '../_lib/crypto.js';
import { gatherSubsystemHealth } from '../_lib/ops/subsystem-health.js';

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

// Internal-dependency health (cache/ring/helius/db/world), gathered here and
// parked so /api/status can render it without a per-request DB ping.
const SUBSYSTEMS_KEY = 'uptime:subsystems';
const SUBSYSTEMS_TTL_S = 60 * 60; // 12× the 5-min cadence — a couple skipped ticks won't blank it
// Escalation memory: how many consecutive ticks each subsystem has been
// unhealthy, so a degradation that *persists* re-pages instead of dedup'ing into
// silence after the first hour. Keyed short; it only needs to survive tick-to-tick.
const DEGRADE_STREAK_KEY = 'uptime:subsystems:streak';
const DEGRADE_STREAK_TTL_S = 6 * 60 * 60;
// Re-page a still-degraded subsystem every this many ticks (5-min cadence → ~1h).
const RE_ESCALATE_EVERY_TICKS = 12;

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

export default wrapCron(async (req, res) => {
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

	// ── Internal subsystem health ─────────────────────────────────────────────
	// Reachability (above) says the door opens; this says the rooms behind it are
	// healthy. Gather, park for /api/status, and drive an escalation digest that
	// re-pages a *persistent* degradation rather than going quiet after dedup.
	let subsystems = null;
	try {
		subsystems = await gatherSubsystemHealth();
		await cacheSet(SUBSYSTEMS_KEY, subsystems, SUBSYSTEMS_TTL_S);
		await escalateSubsystems(subsystems);
	} catch (err) {
		console.warn('[uptime-check] subsystem health gather failed:', err?.message || err);
	}

	const downCount = Object.values(results).filter((r) => !r.ok).length;
	return json(res, 200, {
		ok: downCount === 0 && (subsystems ? subsystems.status !== 'down' : true),
		down: downCount,
		results,
		subsystems: subsystems ? { status: subsystems.status, degraded: subsystems.degraded } : null,
	});
});

// Config-drift + escalation digest. A subsystem that is degraded/down for the
// first time pages immediately (deduped 1h by sendOpsAlert). One that *stays*
// unhealthy re-pages every RE_ESCALATE_EVERY_TICKS so a half-armed ring or an
// unprotected world can't quietly persist for days behind a single stale alert.
// A subsystem that recovers pages a one-line "resolved". Streaks live in the
// cache so this survives across the stateless cron invocations.
async function escalateSubsystems(health) {
	const unhealthy = health.subsystems.filter((s) => s.status === 'down' || s.status === 'degraded');
	const prevStreaks = (await cacheGet(DEGRADE_STREAK_KEY)) || {};
	const nextStreaks = {};

	for (const s of unhealthy) {
		const streak = (prevStreaks[s.name] || 0) + 1;
		nextStreaks[s.name] = streak;
		// Page on the first tick, then once per RE_ESCALATE_EVERY_TICKS thereafter.
		const shouldPage = streak === 1 || streak % RE_ESCALATE_EVERY_TICKS === 0;
		if (!shouldPage) continue;
		const ageNote = streak === 1 ? 'new' : `degraded for ~${Math.round((streak * 5) / 60 * 10) / 10}h`;
		sendOpsAlert(
			`${s.status === 'down' ? 'DOWN' : 'DEGRADED'}: ${s.label}`,
			`${s.detail || ''}${s.hint ? `\n→ ${s.hint}` : ''}\n(${ageNote})`,
			// Rotate the signature each re-escalation window so the hourly dedup in
			// sendOpsAlert doesn't swallow the repeat, but hold it steady within a
			// window so a 5-min tick storm still collapses to one page.
			{ signature: `subsystem:${s.status}:${s.name}:${Math.floor(streak / RE_ESCALATE_EVERY_TICKS)}` },
		);
	}

	// Recovery notices: anything that was unhealthy last tick and isn't now.
	for (const name of Object.keys(prevStreaks)) {
		if (nextStreaks[name]) continue;
		const rec = health.subsystems.find((s) => s.name === name);
		sendOpsAlert(`RESOLVED: ${rec?.label || name}`, rec?.detail || 'recovered', {
			signature: `subsystem:resolved:${name}:${Date.now()}`,
		});
	}

	await cacheSet(DEGRADE_STREAK_KEY, nextStreaks, DEGRADE_STREAK_TTL_S);
}
