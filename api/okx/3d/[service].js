// OKX.AI marketplace services — one Vercel function, many fronts.
// Routes /api/okx/3d/<service> per the catalog in api/_lib/okx-catalog.js:
//
//   /api/okx/3d/catalog          GET, free — machine-readable service index
//   /api/okx/3d/health           GET, free — live subsystem health (real probes)
//   /api/okx/3d/identity-studio  A2MCP (MCP Streamable HTTP): POST tool calls,
//                                GET SSE, DELETE terminate. create_identity is
//                                x402-priced; identity_status + getting_started
//                                are free. Transport mirrors api/mcp-3d.js —
//                                verify → dispatch → settle-on-success.
import { cors, json, readJson, wrap } from '../../_lib/http.js';
import { limits, clientIp } from '../../_lib/rate-limit.js';
import { settlePayment, encodePaymentResponseHeader } from '../../_lib/x402-spec.js';
import { priceBatch, isDiscoveryOnlyBatch } from '../../_lib/mcp-batch-price.js';
import { OKX_CATALOG, catalogIndex, catalogEntry } from '../../_lib/okx-catalog.js';
import { headObject, putObject } from '../../_lib/r2.js';
import {
	send401,
	sendJsonRpcError,
	authenticateRequest,
	handleSse,
	handleTerminate,
	isMcpProtocolClient,
} from '../../_mcp/auth.js';
import { sendX402Error, reservePaymentProof } from '../../_mcp/payments.js';
import {
	dispatch,
	PROTOCOL_VERSION,
	identityX402Amount,
	isPublicIdentityTool,
	IDENTITY_CHALLENGE,
} from '../../_okx3d/tools.js';

const BASE = 'https://three.ws';
const HEALTH_PROBE_KEY = 'okx-identity/health-probe.txt';

function serviceFrom(req) {
	if (typeof req.query?.service === 'string') return req.query.service;
	const m = String(req.url || '').match(/\/api\/okx\/3d\/([a-z0-9-]+)/);
	return m ? m[1] : '';
}

async function probe(name, fn) {
	const started = Date.now();
	try {
		const detail = await fn();
		return { name, ok: true, latency_ms: Date.now() - started, ...(detail || {}) };
	} catch (err) {
		return { name, ok: false, latency_ms: Date.now() - started, error: String(err?.message || err) };
	}
}

// Live health: every subsystem a paid job passes through, actually probed.
async function healthReport() {
	const subsystems = await Promise.all([
		probe('generation', async () => {
			// /api/forge serves its catalog/config on GET without starting a job —
			// reachable + parseable proves the generation front door is up.
			const res = await fetch(`${BASE}/api/forge`, {
				headers: { accept: 'application/json' },
				signal: AbortSignal.timeout(10_000),
			});
			if (res.status >= 500) throw new Error(`forge returned ${res.status}`);
			return { status: res.status };
		}),
		probe('render', async () => {
			const res = await fetch(`${BASE}/api/render/avatar-clip`, {
				headers: { accept: 'application/json' },
				signal: AbortSignal.timeout(10_000),
			});
			if (!res.ok) throw new Error(`renderer returned ${res.status}`);
			const data = await res.json();
			if (!Array.isArray(data?.poses) || data.poses.length === 0) throw new Error('pose catalog empty');
			return { poses: data.poses.length };
		}),
		probe('storage', async () => {
			try {
				await headObject(HEALTH_PROBE_KEY);
			} catch {
				await putObject({
					key: HEALTH_PROBE_KEY,
					body: Buffer.from('agent-identity-studio storage probe', 'utf8'),
					contentType: 'text/plain',
				});
				await headObject(HEALTH_PROBE_KEY);
			}
		}),
	]);
	return { ok: subsystems.every((s) => s.ok), subsystems, checkedAt: new Date().toISOString() };
}

async function handleIdentityStudio(req, res) {
	const resourcePath = '/api/okx/3d/identity-studio';

	if (req.method === 'GET' || req.method === 'HEAD')
		return handleSse(req, res, { resourcePath, challenge: IDENTITY_CHALLENGE });
	if (req.method === 'DELETE') return handleTerminate(req, res);
	if (req.method !== 'POST') return send401(res, 'method not supported');

	const body = await readJson(req, 1_000_000);

	const { totalAmount: x402Amount, allFree } = priceBatch(body, {
		priceForTool: identityX402Amount,
		isFreeName: isPublicIdentityTool,
	});

	const result = await authenticateRequest(req, res, {
		x402Amount,
		resourcePath,
		challenge: IDENTITY_CHALLENGE,
		allowFree: allFree || (isDiscoveryOnlyBatch(body) && !isMcpProtocolClient(req)),
	});
	if (!result) return;
	const { auth, x402Ctx } = result;

	const ipRl = await limits.mcpIp(clientIp(req));
	if (!ipRl.success)
		return sendJsonRpcError(res, null, -32000, 'rate_limited', {
			retry_after: Math.ceil((ipRl.reset - Date.now()) / 1000),
		});
	const userRl = await limits.mcpUser(auth.userId || auth.rateKey || clientIp(req));
	if (!userRl.success)
		return sendJsonRpcError(res, null, -32000, 'rate_limited', {
			retry_after: Math.ceil((userRl.reset - Date.now()) / 1000),
		});

	const batch = Array.isArray(body) ? body : [body];
	if (batch.length > 16) return sendJsonRpcError(res, null, -32600, 'batch too large (max 16)');

	// Single-use lock on the payment proof across dispatch+settle, mirroring
	// /api/mcp-3d — a replayed X-PAYMENT can't run a second job before the
	// first settle lands.
	let releaseProof = async () => {};
	if (x402Ctx) {
		const guard = await reservePaymentProof(resourcePath, req.headers['x-payment']);
		if (!guard.ok) {
			return sendJsonRpcError(res, null, -32000, 'payment_in_flight', { retry_after: 1 });
		}
		releaseProof = guard.release;
	}

	try {
		const responses = [];
		for (const msg of batch) {
			const r = await dispatch(msg, auth, req);
			if (r !== null) responses.push(r);
		}

		// Settle only after the work was accepted: a create_identity that failed
		// validation (bad brief, unreachable reference image) returns isError and
		// the payment is never settled — the pay-only-on-acceptance promise the
		// catalog description makes.
		if (x402Ctx) {
			const anySuccess = responses.some((r) => r && !r.error && !(r.result && r.result.isError));
			if (anySuccess) {
				try {
					const settled = await settlePayment({ verified: x402Ctx.verified });
					res.setHeader('x-payment-response', encodePaymentResponseHeader(settled));
				} catch (err) {
					return sendX402Error(
						res,
						{ resourceUrl: x402Ctx.resourceUrl, accepts: x402Ctx.requirements },
						err,
					);
				}
			}
		}

		res.statusCode = 200;
		res.setHeader('content-type', 'application/json; charset=utf-8');
		res.setHeader('mcp-protocol-version', PROTOCOL_VERSION);
		res.end(JSON.stringify(Array.isArray(body) ? responses : (responses[0] ?? null)));
	} finally {
		await releaseProof();
	}
}

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'GET,HEAD,POST,DELETE,OPTIONS', origins: '*' })) return;

	const service = serviceFrom(req);

	if (service === 'catalog') {
		if (req.method !== 'GET' && req.method !== 'HEAD')
			return json(res, 405, { error: 'method_not_allowed', message: 'catalog is GET-only' });
		return json(res, 200, catalogIndex(), { 'cache-control': 'public, max-age=300' });
	}

	if (service === 'health') {
		if (req.method !== 'GET' && req.method !== 'HEAD')
			return json(res, 405, { error: 'method_not_allowed', message: 'health is GET-only' });
		const report = await healthReport();
		return json(res, report.ok ? 200 : 503, report, { 'cache-control': 'no-store' });
	}

	if (service === 'identity-studio') return handleIdentityStudio(req, res);

	const known = catalogEntry(service);
	return json(res, 404, {
		error: 'unknown_service',
		message: known
			? `service "${service}" is catalogued but not yet routable — see the catalog for status`
			: `no such service "${service}"`,
		services: OKX_CATALOG.map((e) => e.endpoint),
	});
});
