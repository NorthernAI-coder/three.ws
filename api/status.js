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

// Monochrome SVG status badge (shields-style, two segments) for READMEs, agent
// dashboards, and integrator status walls — embed with
//   <img src="https://three.ws/api/status?format=svg" alt="three.ws status">
// Deliberately grayscale to match the brand: the STATE WORD carries the meaning,
// not a color, so it reads the same for color-blind viewers and in monochrome
// print. `state` is 'operational' | 'degraded' | 'down' | 'warming up'.
function statusBadgeSvg(state) {
	const label = 'three.ws';
	const value = state;
	// Monospace-ish width estimate: 6.5px/char + padding, keeps text inside the pill.
	const lw = Math.round(label.length * 6.5) + 16;
	const vw = Math.round(value.length * 6.5) + 16;
	const w = lw + vw;
	// down inverts (light text on ink) so an outage still stands out at a glance
	// without leaving the grayscale palette.
	const down = state === 'down';
	const valueBg = down ? '#111111' : '#e8e8e8';
	const valueFg = down ? '#e8e8e8' : '#111111';
	const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="20" role="img" aria-label="${esc(label)}: ${esc(value)}">
  <title>${esc(label)}: ${esc(value)}</title>
  <rect width="${w}" height="20" rx="3" fill="#111111"/>
  <rect x="${lw}" width="${vw}" height="20" rx="3" fill="${valueBg}"/>
  <rect x="${lw}" width="6" height="20" fill="${valueBg}"/>
  <g font-family="ui-monospace,SFMono-Regular,Menlo,monospace" font-size="11">
    <text x="8" y="14" fill="#e8e8e8">${esc(label)}</text>
    <text x="${lw + 8}" y="14" fill="${valueFg}">${esc(value)}</text>
  </g>
</svg>`;
}

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
	const up = probed.filter((s) => s.operational);
	const allOk = probed.length > 0 && probed.every((s) => s.operational);
	const warming = probed.length === 0;

	// Fleet aggregates, computed once server-side so the page and any agent
	// consuming the JSON share one source of truth instead of each recomputing.
	const latNums = services.map((s) => s.avgLatency24hMs).filter((n) => n != null);
	const u90Nums = services.map((s) => s.uptime90d).filter((n) => n != null);
	const u24Nums = services.map((s) => s.uptime24h).filter((n) => n != null);
	const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
	const summary = {
		operational: up.length,
		total: services.length,
		probed: probed.length,
		avgLatencyMs: latNums.length ? Math.round(avg(latNums)) : null,
		fleetUptime24h: u24Nums.length ? round(avg(u24Nums)) : null,
		fleetUptime90d: u90Nums.length ? round(avg(u90Nums)) : null,
	};

	const state = warming ? 'warming up' : allOk ? 'operational' : 'degraded';
	// A total outage (everything probed is down) flips the badge to its inverted
	// 'down' treatment so it screams; partial disruption stays 'degraded'.
	const badgeState = !warming && up.length === 0 ? 'down' : state;

	// Embeddable SVG badge: /api/status?format=svg (or ?badge). Long shared cache
	// — a badge that's a minute stale is fine and keeps it off the origin hot path.
	// Parse from req.url too: the Vite dev middleware doesn't populate req.query,
	// and relying on it alone would 404 the badge locally.
	const qs = (() => {
		try {
			return new URL(req.url, 'http://x').searchParams;
		} catch {
			return new URLSearchParams();
		}
	})();
	const wantsBadge =
		req.query?.format === 'svg' ||
		req.query?.badge !== undefined ||
		qs.get('format') === 'svg' ||
		qs.has('badge');
	if (wantsBadge) {
		res.setHeader('content-type', 'image/svg+xml; charset=utf-8');
		res.setHeader('cache-control', 'public, max-age=60, s-maxage=60, stale-while-revalidate=300');
		res.statusCode = 200;
		res.end(statusBadgeSvg(badgeState));
		return;
	}

	return json(
		res,
		200,
		{
			ok: warming ? true : allOk,
			monitoring: warming ? 'warming-up' : 'active',
			state,
			checkedAt: latest?.t ?? null,
			summary,
			services,
		},
		// json() defaults to no-store; status is probed every 5 minutes, so a
		// short shared cache absorbs page-load bursts without staleness.
		{ 'cache-control': 'public, max-age=60' },
	);
});
