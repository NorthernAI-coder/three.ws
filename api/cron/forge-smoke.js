// @ts-check
// GET /api/cron/forge-smoke — daily end-to-end generation smoke test.
//
// The June 2026 audit found fully-wired generation flows that were 100% dead
// in production while every config check read green. The only bar that counts
// is the one a stranger hits: a prompt in, a real GLB out. This cron runs that
// bar once a day against the deployed site (vercel.json crons):
//
//   1. POST /api/forge { prompt, tier: 'draft' } — the free NVIDIA lane, so a
//      daily run costs zero vendor spend.
//   2. Poll the job (the draft lane usually answers synchronously) and fetch
//      the resulting GLB's first bytes — only the 'glTF' magic counts as up.
//   3. GET /api/forge?health — surfaces paid-lane breakage (provider auth,
//      quota, the rate-limiter store failing closed) that the free lane masks.
//
// Failures page the ops Telegram channel; recovery is announced once. Like
// uptime-check, a concrete file keeps the import graph tiny.

import { error, json, method, wrap } from '../_lib/http.js';
import { env } from '../_lib/env.js';
import { cacheGet, cacheSet } from '../_lib/cache.js';
import { sendOpsAlert } from '../_lib/alerts.js';
import { constantTimeEquals } from '../_lib/crypto.js';

const SMOKE_PROMPT = 'a small wooden toy boat with a striped sail';
const SUBMIT_TIMEOUT_MS = 90_000;
const POLL_INTERVAL_MS = 5_000;
const POLL_DEADLINE_MS = 180_000;
const LAST_STATUS_KEY = 'forge-smoke:last';
const LAST_STATUS_TTL_S = 7 * 24 * 60 * 60;

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

async function fetchJson(url, options = {}, timeoutMs = 15_000) {
	const res = await fetch(url, {
		...options,
		headers: { 'user-agent': 'threews-forge-smoke/1.0', ...options.headers },
		signal: AbortSignal.timeout(timeoutMs),
	});
	let body = null;
	try {
		body = await res.json();
	} catch {
		// non-JSON bodies are judged by status alone
	}
	return { status: res.status, body };
}

// A generation only counts when the GLB exists AND starts with the binary
// glTF magic — a 200 with an HTML error page must not pass.
async function verifyGlb(glbUrl) {
	const res = await fetch(glbUrl, {
		headers: { range: 'bytes=0-3', 'user-agent': 'threews-forge-smoke/1.0' },
		signal: AbortSignal.timeout(20_000),
	});
	if (!res.ok) return { ok: false, reason: `GLB fetch returned HTTP ${res.status}` };
	const bytes = new Uint8Array(await res.arrayBuffer());
	const magic = String.fromCharCode(...bytes.slice(0, 4));
	if (magic !== 'glTF') return { ok: false, reason: `GLB magic bytes were "${magic}", not "glTF"` };
	return { ok: true };
}

// Submit a draft generation and follow it to a verified GLB.
async function runGeneration(origin) {
	const submit = await fetchJson(
		`${origin}/api/forge`,
		{
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ prompt: SMOKE_PROMPT, tier: 'draft' }),
		},
		SUBMIT_TIMEOUT_MS,
	);
	if (submit.status !== 200) {
		return {
			ok: false,
			reason: `submit returned HTTP ${submit.status}: ${submit.body?.error_description || submit.body?.error || 'no body'}`,
		};
	}

	let { status, glb_url: glbUrl, job_id: jobId } = submit.body || {};
	const deadline = Date.now() + POLL_DEADLINE_MS;
	while (status !== 'done' && jobId && Date.now() < deadline) {
		await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
		const poll = await fetchJson(`${origin}/api/forge?job=${encodeURIComponent(jobId)}`);
		if (poll.status !== 200) return { ok: false, reason: `poll returned HTTP ${poll.status}` };
		status = poll.body?.status;
		glbUrl = poll.body?.glb_url || glbUrl;
		if (status === 'failed') {
			return { ok: false, reason: `job failed: ${poll.body?.error || 'no error detail'}` };
		}
	}
	if (status !== 'done' || !glbUrl) {
		return { ok: false, reason: `job did not finish within ${POLL_DEADLINE_MS / 1000}s (status: ${status})` };
	}

	const glb = await verifyGlb(glbUrl);
	if (!glb.ok) return { ok: false, reason: glb.reason };
	return { ok: true, glb_url: glbUrl };
}

// Health must be 'ok' — 'degraded' means a lane users can pick is down (a
// provider, a worker, or the limiter store failing paid lanes closed).
async function runHealthCheck(origin) {
	const health = await fetchJson(`${origin}/api/forge?health`);
	if (health.status !== 200) return { ok: false, reason: `health returned HTTP ${health.status}` };
	if (health.body?.status === 'ok') return { ok: true };
	const broken = [
		...Object.values(health.body?.backends || {}),
		...(health.body?.limiter ? [health.body.limiter] : []),
	]
		.filter((b) => b.status === 'down' || b.status === 'degraded')
		.map((b) => `${b.id}: ${b.message}`);
	return { ok: false, reason: broken.join('\n') || `health status: ${health.body?.status}` };
}

export default wrap(async (req, res) => {
	if (!method(req, res, ['GET'])) return;
	if (!requireCron(req, res)) return;

	const origin = env.APP_ORIGIN || 'https://three.ws';
	const [generation, health] = await Promise.all([runGeneration(origin), runHealthCheck(origin)]);
	const ok = generation.ok && health.ok;

	const previous = await cacheGet(LAST_STATUS_KEY);
	await cacheSet(LAST_STATUS_KEY, { ok, at: Date.now() }, LAST_STATUS_TTL_S);

	if (!generation.ok) {
		sendOpsAlert(
			'FORGE SMOKE FAILED: text→3D draft generation',
			`${origin}/forge\n${generation.reason}`,
			{ signature: 'forge-smoke:generation' },
		);
	}
	if (!health.ok) {
		sendOpsAlert('FORGE SMOKE: degraded generation backends', health.reason, {
			signature: 'forge-smoke:health',
		});
	}
	if (ok && previous && previous.ok === false) {
		sendOpsAlert('RECOVERED: forge generation smoke test', `${origin}/forge — prompt→GLB verified`, {
			signature: `forge-smoke:recovered:${Date.now()}`,
		});
	}

	return json(res, 200, { ok, generation, health });
});
