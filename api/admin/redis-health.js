// GET /api/admin/redis-health
// Admin-only endpoint that probes Upstash Redis quota and latency, then fires a
// Telegram ops alert when daily/monthly command usage crosses a warning threshold.
//
// Called by the uptime cron (cron/uptime-check.js) so quota pressure is caught
// before it causes another 500k/mo blowout (June 2026 incident).
//
// Response body: { ok, latencyMs, quotaWarningSent, info }
//   info — raw stats object from Upstash REST /info endpoint (or null on error)

import { cors, json, error, method, wrap } from '../_lib/http.js';
import { requireAdmin } from '../_lib/admin.js';
import { getRedis } from '../_lib/redis.js';
import { env } from '../_lib/env.js';
import { sendOpsAlert } from '../_lib/alerts.js';

// Warn when daily commands consumed crosses this fraction of the monthly limit.
// At 500k/mo that's 500k / 30 ≈ 16.7k/day; we alert at >70% of one day's share.
const DAILY_WARN_FRACTION = 0.7;

// Fetch raw Upstash info (REST endpoint). Returns null when Upstash is not
// configured or on any network error — never throws.
async function fetchUpstashInfo() {
	const url = env.UPSTASH_REDIS_REST_URL;
	const token = env.UPSTASH_REDIS_REST_TOKEN;
	if (!url || !token) return null;
	try {
		// Upstash's REST INFO command returns a formatted string; parse key=value lines.
		const infoUrl = `${url.replace(/\/$/, '')}/info`;
		const res = await fetch(infoUrl, {
			headers: { authorization: `Bearer ${token}` },
			signal: AbortSignal.timeout(5000),
		});
		if (!res.ok) return null;
		const { result } = await res.json();
		if (!result) return null;
		// Parse INFO lines: "key:value\r\n"
		const info = {};
		for (const line of result.split('\n')) {
			const [k, v] = line.split(':');
			if (k && v !== undefined) info[k.trim()] = v.trim();
		}
		return info;
	} catch {
		return null;
	}
}

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'GET,OPTIONS', credentials: true })) return;
	if (!method(req, res, ['GET'])) return;
	if (!(await requireAdmin(req, res))) return;

	const redis = getRedis();
	if (!redis) {
		return json(res, 200, {
			ok: false,
			configured: false,
			message: 'UPSTASH_REDIS_REST_URL/TOKEN not set',
		});
	}

	// Measure round-trip latency with a PING.
	const t0 = Date.now();
	let pingOk = false;
	try {
		await redis.ping();
		pingOk = true;
	} catch (err) {
		return json(res, 200, { ok: false, configured: true, latencyMs: Date.now() - t0, error: err?.message });
	}
	const latencyMs = Date.now() - t0;

	// Fetch quota info.
	const info = await fetchUpstashInfo();

	let quotaWarningSent = false;
	if (info) {
		// Upstash INFO exposes `used_memory_rss`, `total_commands_processed`, and
		// on managed plans `maxmemory` / `daily_commands_used` / `daily_commands_limit`.
		const dailyUsed = Number(info.daily_commands_used ?? info.daily_request_count ?? 0);
		const dailyLimit = Number(info.daily_commands_limit ?? info.daily_request_limit ?? 0);
		const monthlyUsed = Number(info.monthly_commands_used ?? info.total_commands_processed ?? 0);
		const monthlyLimit = Number(info.monthly_commands_limit ?? 0);

		const dailyFrac = dailyLimit > 0 ? dailyUsed / dailyLimit : null;
		const monthlyFrac = monthlyLimit > 0 ? monthlyUsed / monthlyLimit : null;

		if (dailyFrac !== null && dailyFrac > DAILY_WARN_FRACTION) {
			const pct = Math.round(dailyFrac * 100);
			await sendOpsAlert(
				`Redis quota warning — ${pct}% of daily limit used`,
				`Daily: ${dailyUsed.toLocaleString()} / ${dailyLimit.toLocaleString()} commands.\nMonthly: ${monthlyUsed.toLocaleString()} / ${monthlyLimit.toLocaleString()}.`,
				{ signature: `redis-quota-daily-${Math.floor(dailyFrac * 10)}` },
			);
			quotaWarningSent = true;
		} else if (monthlyFrac !== null && monthlyFrac > 0.8) {
			const pct = Math.round(monthlyFrac * 100);
			await sendOpsAlert(
				`Redis quota warning — ${pct}% of monthly limit used`,
				`Monthly: ${monthlyUsed.toLocaleString()} / ${monthlyLimit.toLocaleString()} commands.`,
				{ signature: `redis-quota-monthly-${Math.floor(monthlyFrac * 10)}` },
			);
			quotaWarningSent = true;
		}
	}

	return json(res, 200, {
		ok: pingOk,
		configured: true,
		latencyMs,
		quotaWarningSent,
		info,
	});
});
