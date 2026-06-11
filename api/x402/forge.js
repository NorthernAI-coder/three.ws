// POST /api/x402/forge   { prompt | image_urls[], tier?, aspect_ratio? }
//
// Paid, autonomous 3D generation. The free /api/forge endpoint is browser-facing
// and IP-rate-limited; this is its pay-per-call twin for AI agents that settle in
// USDC with no account, key, or signup — cataloged by the CDP x402 Bazaar.
//
// One payment buys one generation. After verifying payment the server submits the
// real Forge job (FLUX→TRELLIS image pipeline — text→image→mesh, or image→mesh
// from supplied reference views), then settles. The response hands back a job
// token the buyer polls for FREE on the existing provider-aware endpoint:
//   GET /api/forge?job=<job_id>   → { status, glb_url, ... }
//
// Pricing is per-tier and lives in one place (api/_lib/forge-tiers.js): draft
// $0.05, standard $0.15, high $0.50. The 402 challenge quotes the price for the
// requested tier. GET /api/x402/forge (no payment) returns the price catalog so
// developers can discover cost before paying.
//
// Generation is submitted AFTER verify but BEFORE settle: if the text-to-image
// or reconstruction submit fails, settlement never runs and the buyer isn't
// charged. The job token is the upstream prediction id, identical to what the
// free endpoint issues, so a single poll path serves both.
//
// Networks: Base mainnet (EIP-3009 + Permit2 sibling) and Solana mainnet (USDC).
// verifyPayment / settlePayment in x402-spec.js route per network; the Solana
// entry is omitted when X402_PAY_TO_SOLANA is unset so the 402 stays valid.

import { wrap, cors, error, json, rateLimited } from '../_lib/http.js';
import {
	NETWORK_BASE_MAINNET,
	NETWORK_SOLANA_MAINNET,
	send402,
	verifyPayment,
	settlePayment,
	encodePaymentResponseHeader,
	permit2VariantOf,
	resolveResourceUrl,
	buildBazaarSchema,
} from '../_lib/x402-spec.js';
import { env } from '../_lib/env.js';
import { limits, clientIp } from '../_lib/rate-limit.js';
import {
	PAYMENT_IDENTIFIER,
	checkCache,
	extractIdFromHeader,
	hashPaymentProof,
	hashRequestPayload,
	paymentIdentifierExtension,
	storeResponse,
	writeCachedResponse,
	writeConflict,
} from '../_lib/x402/payment-identifier-server.js';
import { installAccessControl } from '../_lib/x402/access-control.js';
import { withService } from '../_lib/x402/bazaar-helpers.js';
import { assertSafePublicUrl } from '../_lib/ssrf-guard.js';
import { textToImage } from '../_mcp3d/text-to-image.js';
import { createRegenProvider } from '../_providers/replicate.js';
import {
	TIER_IDS,
	DEFAULT_TIER,
	resolveTier,
	priceAtomicsForTier,
	priceUsdcForTier,
	estimateEtaSeconds,
	buildCatalog,
} from '../_lib/forge-tiers.js';

const ROUTE = '/api/x402/forge';
const REQUIRED_SCOPE = 'x402:bypass';
const accessControl = installAccessControl({ requiredScope: REQUIRED_SCOPE });
const routeConfig = { path: ROUTE, method: 'POST', requiredScope: REQUIRED_SCOPE };

const VALID_ASPECT = new Set(['1:1', '4:3', '3:4', '16:9', '9:16']);
const HTTP_URL_RE = /^https:\/\/[^\s]+$/i;
const MAX_VIEWS = 4;
const BACKEND = 'trellis'; // the platform image pipeline this paid route serves

const ROUTE_DESCRIPTION =
	'three.ws Forge — pay-per-call text→3D and image→3D. Submit a prompt (or up ' +
	'to four reference views of one object) and get back a job token; poll it for ' +
	'free at GET /api/forge?job=<id> for the finished GLB. Runs the FLUX→TRELLIS ' +
	'pipeline (text→image→mesh, or image→mesh). Priced per quality tier in USDC ' +
	'($0.05 draft / $0.15 standard / $0.50 high). Pay autonomously on Base or ' +
	'Solana mainnet — no API key, no account.';

const INPUT_EXAMPLE = {
	prompt: 'a brass steampunk owl, full body',
	tier: 'standard',
	aspect_ratio: '1:1',
};

const INPUT_SCHEMA = {
	$schema: 'https://json-schema.org/draft/2020-12/schema',
	type: 'object',
	properties: {
		prompt: {
			type: 'string',
			minLength: 3,
			maxLength: 1000,
			description: 'Describe one subject for text→3D. Omit when supplying image_urls.',
		},
		image_urls: {
			type: 'array',
			items: { type: 'string', format: 'uri' },
			minItems: 1,
			maxItems: MAX_VIEWS,
			description: 'Up to four public https reference views of one object for image→3D.',
		},
		tier: { type: 'string', enum: [...TIER_IDS], default: DEFAULT_TIER },
		aspect_ratio: { type: 'string', enum: [...VALID_ASPECT], default: '1:1' },
	},
};

const OUTPUT_EXAMPLE = {
	job_id: 'abc123def4567890',
	status: 'queued',
	poll_url: '/api/forge?job=abc123def4567890',
	mode: 'text_to_3d',
	tier: 'standard',
	backend: 'trellis',
	eta_seconds: 60,
	price_usdc: '0.15',
};

const OUTPUT_SCHEMA = {
	$schema: 'https://json-schema.org/draft/2020-12/schema',
	type: 'object',
	required: ['job_id', 'status', 'poll_url'],
	properties: {
		job_id: { type: 'string', description: 'Poll this on GET /api/forge?job=<id>.' },
		status: { type: 'string' },
		poll_url: { type: 'string', description: 'Free, provider-aware status endpoint.' },
		mode: { type: 'string', enum: ['text_to_3d', 'image_to_3d'] },
		tier: { type: 'string' },
		backend: { type: 'string' },
		eta_seconds: { type: 'integer' },
		price_usdc: { type: 'string' },
	},
};

const ROUTE_BAZAAR = {
	discoverable: true,
	info: {
		input: { type: 'http', method: 'POST', bodyType: 'json', body: INPUT_EXAMPLE },
		output: { type: 'json', example: OUTPUT_EXAMPLE },
	},
	schema: buildBazaarSchema({
		method: 'POST',
		bodyType: 'json',
		bodySchema: INPUT_SCHEMA,
		outputSchema: OUTPUT_SCHEMA,
	}),
};

function buildRequirements(resourceUrl, priceAtomics) {
	const amount = String(priceAtomics);
	const eip3009 = {
		scheme: 'exact',
		network: NETWORK_BASE_MAINNET,
		amount,
		payTo: env.X402_PAY_TO_BASE,
		asset: env.X402_ASSET_ADDRESS_BASE,
		maxTimeoutSeconds: 60,
		resource: resourceUrl,
		extra: { name: 'USD Coin', version: '2', decimals: 6 },
	};
	const out = [eip3009];
	const permit2 = permit2VariantOf(eip3009);
	if (permit2) out.push(permit2);
	if (env.X402_PAY_TO_SOLANA) {
		out.push({
			scheme: 'exact',
			network: NETWORK_SOLANA_MAINNET,
			amount,
			payTo: env.X402_PAY_TO_SOLANA,
			asset: env.X402_ASSET_MINT_SOLANA,
			maxTimeoutSeconds: 60,
			resource: resourceUrl,
			extra: { name: 'USDC', decimals: 6, feePayer: env.X402_FEE_PAYER_SOLANA },
		});
	}
	return out;
}

// Submit the real generation job and return its poll token. Reuses the same
// text-to-image + reconstruction libs the free endpoint uses, so there is one
// source of truth for the pipeline; the token is the upstream prediction id,
// pollable on GET /api/forge?job=. Throws on any submit failure so the caller
// can avoid settling payment.
async function submitGeneration({ prompt, imageUrls, isImageMode, aspect, tier }) {
	let provider;
	try {
		provider = createRegenProvider();
	} catch {
		throw Object.assign(new Error('Generation is not configured on this deployment.'), {
			status: 503,
			code: 'unconfigured',
		});
	}

	let referenceImageUrl;
	let views;
	if (isImageMode) {
		// Caller-supplied views are fetched by the upstream reconstructor — guard
		// them against SSRF before we forward them, same as the MCP studio path.
		for (const u of imageUrls) await assertSafePublicUrl(u);
		views = imageUrls;
		referenceImageUrl = imageUrls[0];
	} else {
		const synthesized = await textToImage(prompt, { aspectRatio: aspect });
		referenceImageUrl = synthesized.imageUrl;
		views = [referenceImageUrl];
	}

	const job = await provider.submit({
		mode: 'reconstruct',
		sourceUrl: referenceImageUrl,
		params: { images: views, prompt: prompt || undefined },
	});

	const jobId = job.extJobId || job.jobId;
	if (!jobId) {
		throw Object.assign(new Error('Reconstruction submit returned no job id.'), {
			status: 502,
			code: 'submit_failed',
		});
	}
	return {
		job_id: jobId,
		status: 'queued',
		poll_url: `/api/forge?job=${encodeURIComponent(jobId)}`,
		mode: isImageMode ? 'image_to_3d' : 'text_to_3d',
		tier: resolveTier(tier).id,
		backend: BACKEND,
		eta_seconds: estimateEtaSeconds({ backendId: BACKEND, tier }),
		price_usdc: priceUsdcForTier(tier),
	};
}

// GET — free price/usage discovery. No payment, no generation.
function handleGet(req, res) {
	const url = new URL(req.url, 'http://localhost');
	// A stray ?job= on this route is a common mistake — point callers at the
	// free poll endpoint rather than 404-ing them.
	if (url.searchParams.get('job')) {
		return json(res, 400, {
			error: 'wrong_endpoint',
			message: 'Poll generations on GET /api/forge?job=<id> (free), not here.',
		});
	}
	const catalog = buildCatalog();
	return json(res, 200, {
		route: ROUTE,
		description: ROUTE_DESCRIPTION,
		method: 'POST',
		input_schema: INPUT_SCHEMA,
		poll: 'GET /api/forge?job=<id>',
		pricing_usdc: catalog.tiers.map((t) => ({ tier: t.id, price_usdc: t.price_usdc })),
	});
}

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'GET,POST,OPTIONS', origins: '*' })) return;

	if (req.method === 'GET') return handleGet(req, res);
	if (req.method !== 'POST') {
		res.setHeader('allow', 'GET, POST');
		return error(res, 405, 'method_not_allowed', 'use POST to generate, GET for pricing');
	}

	// Light rate limit on the public (pre-payment) path so the 402 challenge and
	// validation can't be hammered. Generation itself is paywalled.
	const rl = await limits.publicIp(clientIp(req));
	if (!rl.success) return rateLimited(res, rl);

	// Read the raw body once so we can both validate and hash it for idempotency.
	let rawBody = '';
	const chunks = [];
	for await (const c of req) chunks.push(c);
	rawBody = Buffer.concat(chunks).toString('utf8');
	// Re-expose the parsed body to parseRequest via a tiny shim (readJson reads
	// the stream, which is already consumed — parse here instead).
	let parsed;
	try {
		const bodyObj = rawBody ? JSON.parse(rawBody) : {};
		parsed = await parseRequestFromObject(bodyObj);
	} catch (err) {
		if (err.status) return error(res, err.status, err.code, err.message);
		return error(res, 400, 'invalid_json', 'Request body must be valid JSON.');
	}

	const resourceUrl = resolveResourceUrl(req, ROUTE);
	const priceAtomics = priceAtomicsForTier(parsed.tier);
	const requirements = buildRequirements(resourceUrl, priceAtomics);
	const service = withService({
		serviceName: 'three.ws Forge — text/image → 3D',
		tags: ['3d', 'generation', 'text-to-3d', 'image-to-3d', 'glb', 'mesh'],
	});
	const challenge = {
		resourceUrl,
		accepts: requirements,
		description: ROUTE_DESCRIPTION,
		bazaar: ROUTE_BAZAAR,
		extensions: { [PAYMENT_IDENTIFIER]: paymentIdentifierExtension(false) },
		serviceName: service.serviceName,
		tags: service.tags,
		iconUrl: service.iconUrl,
	};

	// Internal / subscription / OAuth callers bypass payment.
	const acResult = await accessControl(req, routeConfig);
	if (acResult?.abort) {
		if (acResult.headers)
			for (const [k, v] of Object.entries(acResult.headers)) res.setHeader(k, v);
		return error(
			res,
			acResult.status || 403,
			acResult.code || 'access_denied',
			acResult.reason || 'access denied',
		);
	}
	if (acResult?.grantAccess) {
		let result;
		try {
			result = await submitGeneration(parsed);
		} catch (err) {
			return error(res, err.status || 500, err.code || 'internal_error', err.message);
		}
		if (acResult.headers)
			for (const [k, v] of Object.entries(acResult.headers)) res.setHeader(k, v);
		res.setHeader('x-payment-bypass', acResult.reason || 'granted');
		res.setHeader('cache-control', 'no-store');
		res.setHeader('content-type', 'application/json; charset=utf-8');
		res.end(JSON.stringify(result));
		return;
	}

	const paymentHeader = req.headers['x-payment'] || req.headers['payment-signature'];
	if (!paymentHeader) return send402(res, challenge);

	// A probe with no actual generation request can't be fulfilled even once paid.
	if (parsed.isProbe) {
		return error(res, 400, 'missing_input', 'Provide a prompt or image_urls to generate.');
	}

	// Idempotency: a retried payment (same id, same body) returns the SAME job
	// token instead of submitting a second generation and double-charging.
	const clientPaymentId = extractIdFromHeader(paymentHeader);
	const payloadHash = hashRequestPayload({ method: 'POST', url: ROUTE, body: rawBody });
	const paymentHash = hashPaymentProof(paymentHeader);
	// Always-on replay guard: the payment-identifier extension is client-opt-in,
	// so when the client omits it we fall back to the proof hash itself as the
	// dedup key (reproducible only by the original payer), making replay
	// protection unconditional. Same idiom as api/_lib/x402-paid-endpoint.js.
	const paymentId = clientPaymentId || (paymentHash ? `proof:${paymentHash}` : null);
	if (paymentId) {
		const lookup = await checkCache({ route: ROUTE, paymentId, payloadHash, paymentHash });
		if (lookup.kind === 'hit') return writeCachedResponse(res, lookup.entry);
		if (lookup.kind === 'conflict') {
			return writeConflict(res, {
				route: ROUTE,
				attemptedHash: lookup.attemptedHash,
				existingHash: lookup.existingHash,
				reason: lookup.reason,
			});
		}
	}

	let verified;
	try {
		verified = await verifyPayment({ paymentHeader, requirements });
	} catch (err) {
		if (err.status === 402) return send402(res, { ...challenge, error: err.message });
		return error(res, err.status || 502, err.code || 'verify_failed', err.message);
	}

	// Submit AFTER verify but BEFORE settle so a failed submit never charges.
	let result;
	try {
		result = await submitGeneration(parsed);
	} catch (err) {
		return error(res, err.status || 502, err.code || 'generation_failed', err.message);
	}

	let settled;
	try {
		settled = await settlePayment({ verified });
	} catch (err) {
		return error(res, err.status || 502, err.code || 'settle_failed', err.message);
	}

	const paymentResponseHeader = encodePaymentResponseHeader(settled);
	const contentType = 'application/json; charset=utf-8';
	const body = JSON.stringify(result);

	res.setHeader('x-payment-response', paymentResponseHeader);
	res.setHeader('cache-control', 'no-store');
	res.setHeader('content-type', contentType);
	res.end(body);

	if (paymentId) {
		await storeResponse({
			route: ROUTE,
			paymentId,
			payloadHash,
			paymentHash,
			status: 200,
			body,
			contentType,
			paymentResponseHeader,
		});
	}
});

// Validate a parsed body object (the stream is already consumed by the handler).
// Mirrors parseRequest but takes an object instead of the request stream.
async function parseRequestFromObject(body) {
	body = body && typeof body === 'object' ? body : {};
	const tier = TIER_IDS.includes(body.tier) ? body.tier : DEFAULT_TIER;
	const aspect = VALID_ASPECT.has(body.aspect_ratio) ? body.aspect_ratio : '1:1';

	let imageUrls = [];
	if (Array.isArray(body.image_urls)) imageUrls = body.image_urls;
	else if (typeof body.image_url === 'string') imageUrls = [body.image_url];
	const rawImageCount = Array.isArray(body.image_urls)
		? body.image_urls.length
		: imageUrls.length;
	imageUrls = imageUrls
		.filter((u) => typeof u === 'string' && HTTP_URL_RE.test(u))
		.slice(0, MAX_VIEWS);
	const isImageMode = imageUrls.length > 0;

	const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
	const isProbe = !prompt && !isImageMode;

	if (!isImageMode && !isProbe && (prompt.length < 3 || prompt.length > 1000)) {
		throw Object.assign(
			new Error('Describe one subject in 3–1000 characters, or pass image_urls.'),
			{
				status: 400,
				code: 'invalid_prompt',
			},
		);
	}
	if (rawImageCount > 0 && imageUrls.length === 0) {
		throw Object.assign(new Error('image_urls must be public https URLs.'), {
			status: 400,
			code: 'invalid_image_urls',
		});
	}
	return { prompt, imageUrls, isImageMode, isProbe, tier, aspect };
}
