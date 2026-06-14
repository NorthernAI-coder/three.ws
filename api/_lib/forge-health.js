// Live forge backend health — the truth behind the catalog's `configured` flag.
//
// `configured: true` only means "the env var exists". Two production outages
// hid behind it (a Replicate account throttle and a misrouted Hunyuan3D
// worker), so this module probes each platform backend's upstream with a
// cheap, zero-cost request and reports what a generation would actually hit.
//
// Statuses:
//   ok           — auth + quota gates passed; a generation should start.
//   degraded     — upstream is throttling (transient 429); retries may work.
//   down         — auth/billing failure or worker unreachable; will not work.
//   byok         — needs the caller's own key; probed at request time, not here.
//   unconfigured — required env absent on this deployment.
//
// Probes never spend vendor money: Replicate is probed with an invalid
// version (the 4xx arrives after the auth/quota gates), NVIDIA with a status
// lookup of a synthetic request id, GCP workers with a bare authenticated GET.
//
// Results are cached briefly per lambda instance so the UI and uptime checks
// can poll without hammering vendors.

import { BACKENDS, backendIsConfigured } from './forge-tiers.js';
import { env } from './env.js';
import { getRedisBurn } from './redis-usage.js';
import { probeLlmHealth } from './llm-health.js';

const PROBE_TIMEOUT_MS = 4_000;
const CACHE_TTL_MS = 60_000;

const REPLICATE_PREDICTIONS_URL = 'https://api.replicate.com/v1/predictions';
const NVCF_STATUS_URL = 'https://api.nvcf.nvidia.com/v2/nvcf/pexec/status';
// Valid UUID shape that no real NVCF request will ever have — auth is checked
// before the id is resolved, so 404 proves the key works.
const NVCF_PROBE_ID = '00000000-0000-4000-8000-000000000000';

function readEnv(name) {
	if (typeof process !== 'undefined' && process.env?.[name]) return process.env[name];
	return null;
}

function result(id, status, message, extra = {}) {
	return { id, status, message, ...extra };
}

// fetch with a hard timeout; resolves to the Response or null on network error.
async function probeFetch(url, options = {}) {
	try {
		return await fetch(url, { ...options, signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
	} catch {
		return null;
	}
}

// Replicate (the `trellis` lane): an invalid-version prediction submit clears
// the auth and account-quota gates without creating billable work — 4xx
// validation means a real submit would have been accepted.
async function probeReplicate() {
	const id = 'trellis';
	const token = readEnv('REPLICATE_API_TOKEN');
	if (!token) return result(id, 'unconfigured', 'REPLICATE_API_TOKEN is not set on this deployment.');
	const started = Date.now();
	const res = await probeFetch(REPLICATE_PREDICTIONS_URL, {
		method: 'POST',
		headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
		body: JSON.stringify({ version: 'forge-health-probe-invalid-version' }),
	});
	const latency = Date.now() - started;
	if (!res) return result(id, 'down', 'Replicate is unreachable.', { latency_ms: latency });
	if (res.status === 401 || res.status === 403) {
		return result(id, 'down', 'Replicate rejected the platform API token.', { http_status: res.status, latency_ms: latency });
	}
	if (res.status === 402) {
		return result(id, 'down', 'The Replicate account is out of credit.', { http_status: res.status, latency_ms: latency });
	}
	if (res.status === 429) {
		return result(id, 'degraded', 'Replicate is throttling this account — generations will be rejected until the quota clears (check billing).', { http_status: res.status, latency_ms: latency });
	}
	// 400/404/422 — the fake version was rejected AFTER auth and quota, which is
	// exactly what the probe wants to see.
	if (res.status >= 400 && res.status < 500) {
		return result(id, 'ok', 'Replicate accepted authentication; generations should start.', { latency_ms: latency });
	}
	return result(id, 'down', `Replicate returned an unexpected HTTP ${res.status}.`, { http_status: res.status, latency_ms: latency });
}

// NVIDIA NIM (the free `nvidia` lane): a status lookup of a synthetic request
// id authenticates without invoking the model — 404 proves the key is live.
async function probeNvidia() {
	const id = 'nvidia';
	const key = readEnv('NVIDIA_API_KEY');
	if (!key) return result(id, 'unconfigured', 'NVIDIA_API_KEY is not set on this deployment.');
	const started = Date.now();
	const res = await probeFetch(`${NVCF_STATUS_URL}/${NVCF_PROBE_ID}`, {
		headers: { authorization: `Bearer ${key}`, accept: 'application/json' },
	});
	const latency = Date.now() - started;
	if (!res) return result(id, 'down', 'NVIDIA NIM is unreachable.', { latency_ms: latency });
	if (res.status === 401 || res.status === 403) {
		return result(id, 'down', 'NVIDIA rejected the platform API key.', { http_status: res.status, latency_ms: latency });
	}
	if (res.status === 429) {
		return result(id, 'degraded', 'NVIDIA NIM is throttling — the free lane may queue.', { http_status: res.status, latency_ms: latency });
	}
	// 404 (synthetic id not found) or any 2xx means the key authenticated.
	return result(id, 'ok', 'NVIDIA NIM accepted authentication; the free lane is live.', { latency_ms: latency });
}

// Self-hosted Cloud Run workers (Hunyuan3D, TripoSG): an authenticated GET
// against the service root. Cloud Run answers anything <500 when the
// container is up and routable.
function gcpWorkerProbe(id, urlEnv) {
	return async function probeGcpWorker() {
		const label = BACKENDS[id]?.label || id;
		const url = readEnv(urlEnv);
		const key = readEnv('GCP_RECONSTRUCTION_KEY');
		if (!url || !key) {
			return result(id, 'unconfigured', `The ${label} self-host worker is not deployed on this deployment.`);
		}
		const started = Date.now();
		const res = await probeFetch(url, {
			headers: { authorization: `Bearer ${key}` },
		});
		const latency = Date.now() - started;
		if (!res) return result(id, 'down', `The ${label} worker is unreachable.`, { latency_ms: latency });
		if (res.status >= 500) {
			return result(id, 'down', `The ${label} worker returned HTTP ${res.status}.`, { http_status: res.status, latency_ms: latency });
		}
		return result(id, 'ok', `The ${label} worker is reachable.`, { latency_ms: latency });
	};
}

function byokResult(id) {
	const label = BACKENDS[id]?.label || id;
	return result(id, 'byok', `${label} uses your own API key — availability is checked when you generate.`);
}

const PROBES = {
	nvidia: probeNvidia,
	trellis: probeReplicate,
	hunyuan3d: gcpWorkerProbe('hunyuan3d', 'GCP_HUNYUAN3D_URL'),
	triposg: gcpWorkerProbe('triposg', 'GCP_TRIPOSG_URL'),
};

// The distributed rate-limiter store gates every paid lane: when Redis is
// unreachable (or the Upstash account is over quota) the cost-protecting
// limiters fail closed and ALL standard/high/image generations 429 — while
// every backend above still reports ok. A June 2026 outage hid exactly there,
// so the store is probed like any other upstream: one PING over the same REST
// credentials the limiter uses.
async function probeLimiterStore() {
	const id = 'limiter';
	const url = env.UPSTASH_REDIS_REST_URL;
	const token = env.UPSTASH_REDIS_REST_TOKEN;
	const isProduction = env.NODE_ENV === 'production' || env.VERCEL_ENV === 'production';
	if (!url || !token) {
		return isProduction
			? result(id, 'down', 'The rate-limiter store is unconfigured — paid generation lanes fail closed (every non-draft submit is denied).')
			: result(id, 'ok', 'No Redis configured; the permissive in-memory limiter is active outside production.');
	}
	const started = Date.now();
	const res = await probeFetch(url, {
		method: 'POST',
		headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
		body: JSON.stringify(['PING']),
	});
	const latency = Date.now() - started;
	if (!res) return result(id, 'down', 'The rate-limiter store is unreachable — paid generation lanes fail closed.', { latency_ms: latency });
	let body = null;
	try {
		body = await res.json();
	} catch {
		// fall through — a non-JSON body is judged by status code below
	}
	if (res.ok && body?.result === 'PONG') {
		return result(id, 'ok', 'The rate-limiter store answered PING; paid lanes are open.', { latency_ms: latency });
	}
	const detail = body?.error || `HTTP ${res.status}`;
	return result(id, 'down', `The rate-limiter store rejected commands (${detail}) — paid generation lanes fail closed.`, { http_status: res.status, latency_ms: latency });
}

// world.three.ws (Hyperfy multiplayer world) is a separate Cloud Run service,
// but a forge user who generates an avatar wants to walk it into the world — so
// the forge health report surfaces the world too. Two real outage modes:
// unprotected (every visitor can delete the scene) and a missing blueprint
// asset (the scene crashes on join — the 2026-06-12 void-fall). The patched
// /status enumerates blueprint assets with absolute URLs; we HEAD a bounded
// sample so this probe stays as cheap as the others.
const WORLD_STATUS_URL =
	(env.WORLD_URL ? env.WORLD_URL.replace(/\/+$/, '') : 'https://world.three.ws') + '/status';
const WORLD_ASSET_SAMPLE = 12;

async function probeWorld() {
	const id = 'world';
	const started = Date.now();
	const res = await probeFetch(WORLD_STATUS_URL, {
		headers: { accept: 'application/json', 'user-agent': 'threews-forge-health/1.0' },
	});
	const latency = Date.now() - started;
	if (!res) return result(id, 'down', 'world.three.ws is unreachable.', { latency_ms: latency });
	if (!res.ok) {
		return result(id, 'down', `world.three.ws /status returned HTTP ${res.status}.`, { http_status: res.status, latency_ms: latency });
	}
	let status = null;
	try {
		status = await res.json();
	} catch {
		return result(id, 'down', 'world.three.ws /status returned an unparseable body.', { latency_ms: latency });
	}
	const isProtected = status?.protected === true;
	const blueprints = Array.isArray(status?.blueprints) ? status.blueprints : [];
	const assetUrls = blueprints
		.map((b) => b?.assetUrl)
		.filter((u) => typeof u === 'string' && /^https?:\/\//.test(u))
		.slice(0, WORLD_ASSET_SAMPLE);
	const heads = await Promise.all(
		assetUrls.map((u) => probeFetch(u, { method: 'HEAD', redirect: 'follow' })),
	);
	const missing = heads.filter((h) => !h || !h.ok).length;
	const extra = { protected: isProtected, blueprint_count: blueprints.length, latency_ms: latency };
	if (missing > 0) {
		return result(id, 'down', `${missing} blueprint asset(s) are missing — the scene will crash on join.`, extra);
	}
	if (!isProtected) {
		return result(id, 'degraded', 'The world is unprotected — ADMIN_CODE is unset, so every visitor has build rights.', extra);
	}
	return result(id, 'ok', 'The world is protected and all sampled blueprint assets are present.', extra);
}

let cache = null; // { at: epoch-ms, payload }

// Probe every backend in the registry, in parallel, with per-instance caching.
export async function probeForgeHealth({ force = false } = {}) {
	if (!force && cache && Date.now() - cache.at < CACHE_TTL_MS) {
		return { ...cache.payload, cached: true };
	}

	const [entries, limiter, llm, world, redis] = await Promise.all([
		Promise.all(
			Object.values(BACKENDS).map(async (b) => {
				if (b.byok) return byokResult(b.id);
				const probe = PROBES[b.id];
				if (!probe) {
					// A platform backend with no live probe falls back to env presence —
					// weaker, but never silently absent from the report.
					return backendIsConfigured(b.id)
						? result(b.id, 'ok', 'Configured (env-presence check only).')
						: result(b.id, 'unconfigured', 'Required environment is not set on this deployment.');
				}
				return probe();
			}),
		),
		probeLimiterStore(),
		// LLM providers gate every AI-driven generation surface (prompt rewriting,
		// agent responses). A dead provider chain degrades the product the same way
		// a dead 3D backend does, so it folds into the same overall verdict.
		probeLlmHealth(),
		// The multiplayer world is downstream of the forge (generate → walk it in),
		// so a down/unprotected world degrades the overall verdict too.
		probeWorld(),
		// Quota-burn reading for the SAME store probeLimiterStore() pings. That
		// probe answers "is Redis reachable?"; this answers "is Redis about to run
		// out of quota?" — the slow failure that took the platform down in June
		// 2026 while every reachability check still read green.
		getRedisBurn(),
	]);

	const backends = Object.fromEntries(entries.map((e) => [e.id, e]));
	// llm carries an 'ok' | 'degraded' | 'down' overall plus per-provider verdicts.
	// A down world degrades overall to 'degraded' (never 'down' — the forge still
	// functions when the world is offline), which the cap below already enforces.
	// A critical Redis burn rate degrades overall too: it predicts the limiters
	// failing closed before they actually do, so it warns rather than waits.
	const statuses = entries
		.map((e) => e.status)
		.concat(limiter.status, llm.overall, world.status, redis.status === 'critical' ? 'down' : 'ok');
	const overall = statuses.includes('down') || statuses.includes('degraded') ? 'degraded' : 'ok';

	const payload = {
		status: overall,
		generated_at: new Date().toISOString(),
		backends,
		limiter,
		llm,
		world,
		redis,
	};
	cache = { at: Date.now(), payload };
	return { ...payload, cached: false };
}

// Test hook — health is cached per lambda instance; tests need a clean slate.
export function resetForgeHealthCache() {
	cache = null;
}
