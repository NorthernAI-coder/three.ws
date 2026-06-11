// @ts-check
// GET /api/status — public platform status, computed from the probe history
// written by api/cron/uptime-check.js. Powers the /status page and is itself
// a machine-readable status feed for agents and integrators.
//
// Returns per-target: current state (latest probe), 24h uptime + median-ish
// latency from raw snapshots, and 90 days of daily uptime cells for the bars.
// No probe data yet (fresh deploy, cache flush) → ok:true with empty history
// and `monitoring: 'warming-up'`, so the page renders an honest empty state
// rather than fake green.

import { cors, json, method, wrap, rateLimited } from './_lib/http.js';
import { limits, clientIp } from './_lib/rate-limit.js';
import { cacheGet } from './_lib/cache.js';
import { UPTIME_TARGETS } from './cron/uptime-check.js';

const round = (n) => Math.round(n * 100) / 100;

export default wrap(async (req, res) => {
	if (cors(req, res, { origins: '*', methods: 'GET,OPTIONS' })) return;
	if (!method(req, res, ['GET'])) return;

	const rl = await limits.publicIp(clientIp(req));
	if (!rl.success) return rateLimited(res, rl);

	const [snapshots, daily] = await Promise.all([
		cacheGet('uptime:snapshots'),
		cacheGet('uptime:daily'),
	]);
	const snaps = Array.isArray(snapshots) ? snapshots : [];
	const days = Array.isArray(daily) ? daily : [];
	const latest = snaps[snaps.length - 1] || null;

	const services = UPTIME_TARGETS.map((target) => {
		const current = latest?.results?.[target.id] || null;

		let up24 = 0;
		let n24 = 0;
		let msSum = 0;
		for (const snap of snaps) {
			const r = snap.results?.[target.id];
			if (!r) continue;
			n24 += 1;
			if (r.ok) up24 += 1;
			msSum += r.ms;
		}

		let up90 = 0;
		let n90 = 0;
		const history = days.map((d) => {
			const agg = d.targets?.[target.id];
			if (!agg || !agg.n) return { date: d.d, uptime: null };
			n90 += agg.n;
			up90 += agg.up;
			return { date: d.d, uptime: round((agg.up / agg.n) * 100) };
		});

		return {
			id: target.id,
			label: target.label,
			path: target.path,
			operational: current ? current.ok : null,
			latencyMs: current?.ms ?? null,
			uptime24h: n24 ? round((up24 / n24) * 100) : null,
			avgLatency24hMs: n24 ? Math.round(msSum / n24) : null,
			uptime90d: n90 ? round((up90 / n90) * 100) : null,
			history,
		};
	});

	const probed = services.filter((s) => s.operational !== null);
	const allOk = probed.length > 0 && probed.every((s) => s.operational);

	return json(
		res,
		200,
		{
			ok: probed.length === 0 ? true : allOk,
			monitoring: probed.length === 0 ? 'warming-up' : 'active',
			checkedAt: latest?.t ?? null,
			services,
		},
		// json() defaults to no-store; status is probed every 5 minutes, so a
		// short shared cache absorbs page-load bursts without staleness.
		{ 'cache-control': 'public, max-age=60' },
	);
});
