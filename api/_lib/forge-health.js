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

let cache = null; // { at: epoch-ms, payload }

// Probe every backend in the registry, in parallel, with per-instance caching.
export async function probeForgeHealth({ force = false } = {}) {
	if (!force && cache && Date.now() - cache.at < CACHE_TTL_MS) {
		return { ...cache.payload, cached: true };
	}

	const entries = await Promise.all(
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
	);

	const backends = Object.fromEntries(entries.map((e) => [e.id, e]));
	const statuses = entries.map((e) => e.status);
	const overall = statuses.includes('down') || statuses.includes('degraded') ? 'degraded' : 'ok';

	const payload = {
		status: overall,
		generated_at: new Date().toISOString(),
		backends,
	};
	cache = { at: Date.now(), payload };
	return { ...payload, cached: false };
}

// Test hook — health is cached per lambda instance; tests need a clean slate.
export function resetForgeHealthCache() {
	cache = null;
}
