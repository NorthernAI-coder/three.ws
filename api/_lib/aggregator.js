// Aggregator engine — runs a registered third-party API endpoint
// (api/v1/_providers.js) as part of the unified three.ws API.
//
// One function does the real upstream work (executeUpstream); the catch-all
// route picks the billing model and calls it. The x402 pay-per-call path is
// delegated to the platform's existing paidEndpoint rail (api/_lib/
// x402-paid-endpoint.js) so aggregated endpoints settle real USDC and appear
// in the x402 bazaar — no second payment implementation.

import { paidEndpoint } from './x402-paid-endpoint.js';
import { buildBazaarSchema } from './x402-spec.js';
import { installAccessControl } from './x402/access-control.js';
import { withService } from './x402/bazaar-helpers.js';

const UPSTREAM_TIMEOUT_MS = 20_000;

/**
 * Resolve the upstream key to use for a call.
 * BYOK (caller-supplied) wins; else the platform env key; else null.
 * @returns {{ key: string|null, source: 'byok'|'platform'|'none' }}
 */
export function resolveUpstreamKey(provider, byokKey) {
	if (byokKey) return { key: byokKey, source: 'byok' };
	const envKey = provider.envVar ? process.env[provider.envVar] : null;
	if (envKey) return { key: envKey, source: 'platform' };
	return { key: null, source: 'none' };
}

/**
 * Perform the real upstream request and return the normalized payload.
 * Throws an Error with `.status` + `.code` on any failure (mapped by wrap()).
 *
 * @param {object} args
 * @param {object} args.provider   provider descriptor
 * @param {object} args.endpoint   endpoint descriptor
 * @param {Record<string,any>} args.query  request query params
 * @param {any} [args.body]        parsed request body (POST)
 * @param {string|null} args.apiKey  resolved upstream key (or null)
 */
export async function executeUpstream({ provider, endpoint, query = {}, body, apiKey }) {
	if (provider.requiresKey && !apiKey) {
		const err = new Error(
			`${provider.name} requires an API key — supply your own via the "${provider.byokHeader}" header, ` +
				`or this deployment must set ${provider.envVar}`,
		);
		err.status = 503;
		err.code = 'not_configured';
		throw err;
	}

	const path = typeof endpoint.path === 'function' ? endpoint.path(query) : endpoint.path;
	const url = new URL(provider.base + path);

	if (endpoint.method === 'GET' && endpoint.query) {
		for (const [k, v] of Object.entries(endpoint.query(query))) {
			if (v != null && v !== '') url.searchParams.set(k, String(v));
		}
	}

	const headers = { accept: 'application/json' };
	let outBody;
	if (endpoint.method === 'POST') {
		outBody = endpoint.body ? endpoint.body(body) : body;
		headers['content-type'] = 'application/json';
	}
	provider.applyKey(headers, url, apiKey);

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
	let res;
	try {
		res = await fetch(url, {
			method: endpoint.method,
			headers,
			body: outBody != null ? JSON.stringify(outBody) : undefined,
			signal: controller.signal,
		});
	} catch (err) {
		clearTimeout(timer);
		const e = new Error(`${provider.name} is unreachable`);
		e.status = 504;
		e.code = 'upstream_unreachable';
		e.cause = err;
		throw e;
	}
	clearTimeout(timer);

	const text = await res.text();
	let data;
	try {
		data = text ? JSON.parse(text) : null;
	} catch {
		data = text;
	}

	if (!res.ok) {
		const e = new Error(
			`${provider.name} returned ${res.status} for ${endpoint.id}`,
		);
		// Map upstream 5xx to 502 (we're the proxy); pass client-fault 4xx through.
		e.status = res.status >= 500 ? 502 : res.status;
		e.code = res.status === 429 ? 'upstream_rate_limited' : 'upstream_error';
		e.detail = typeof data === 'object' ? data : { message: String(data).slice(0, 300) };
		throw e;
	}

	return endpoint.transform ? endpoint.transform(data) : data;
}

// ── x402 pay-per-call path ────────────────────────────────────────────────────
// Lazily build (and cache) one paidEndpoint handler per descriptor. The handler
// runs the SAME executeUpstream with the platform key, so a paying caller and a
// plan/BYOK caller hit identical upstream logic.
const _paidHandlers = new Map();

export function getPaidHandler(provider, endpoint) {
	const key = `${provider.id}/${endpoint.id}`;
	if (_paidHandlers.has(key)) return _paidHandlers.get(key);

	const route = `/api/v1/x/${provider.id}/${endpoint.id}`;
	const description =
		`three.ws API — ${provider.name}: ${endpoint.summary} ` +
		`Pay per call in USDC, or use a three.ws API key / your own ${provider.name} key.`;

	const bazaar = {
		discoverable: true,
		info: {
			input: { type: 'http', method: endpoint.method, queryParams: endpoint.params || {} },
			output: { type: 'json', example: {} },
		},
		schema: buildBazaarSchema({
			method: endpoint.method,
			queryParamsSchema: { type: 'object' },
			outputSchema: { type: 'object' },
		}),
	};

	const handler = paidEndpoint({
		route,
		method: endpoint.method,
		priceAtomics: endpoint.priceAtomics,
		networks: ['base', 'solana'],
		description,
		bazaar,
		service: withService({
			serviceName: `three.ws · ${provider.name}`,
			tags: ['aggregator', provider.category, provider.id],
		}),
		requiredScope: endpoint.scope || 'agents:read',
		accessControl: installAccessControl({ requiredScope: endpoint.scope || 'agents:read' }),
		async handler({ req, bypass }) {
			const query = req.query || {};
			let body;
			if (endpoint.method === 'POST') body = await readJsonStream(req);
			const { key } = resolveUpstreamKey(provider, null); // pay path uses platform key
			const out = await executeUpstream({ provider, endpoint, query, body, apiKey: key });
			return {
				data: out,
				_meta: {
					provider: provider.id,
					endpoint: endpoint.id,
					billing: bypass ? 'plan' : 'x402',
				},
			};
		},
	});

	_paidHandlers.set(key, handler);
	return handler;
}

// Minimal JSON body reader for the paid POST path (paidEndpoint leaves the
// stream untouched). Mirrors http.js readJson but without its content-type
// hard-fail, since the x402 dance has already consumed headers.
function readJsonStream(req, limit = 1_000_000) {
	return new Promise((resolve, reject) => {
		const chunks = [];
		let total = 0;
		req.on('data', (c) => {
			total += c.length;
			if (total > limit) {
				req.destroy();
				reject(Object.assign(new Error('payload too large'), { status: 413 }));
			} else chunks.push(c);
		});
		req.on('end', () => {
			if (!chunks.length) return resolve(undefined);
			try {
				resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
			} catch {
				reject(Object.assign(new Error('invalid JSON body'), { status: 400, code: 'validation_error' }));
			}
		});
		req.on('error', reject);
	});
}
