// Shared server-side IBM watsonx.ai client for the LLM proxies.
//
// Mirrors the verified REST contract used by packages/ibm-watsonx-mcp:
// an IBM Cloud API key is exchanged for a short-lived IAM bearer token (cached
// across warm invocations), every inference call is scoped to a project (or
// deployment space), and the endpoint is version-stamped. The streaming chat
// endpoint returns an OpenAI-shaped SSE stream (choices[].delta.content), so
// callers can reuse an OpenAI delta reader verbatim.
//
// There is no mock path. When credentials are absent watsonxConfig() reports
// `configured: false` so a proxy can mark the provider unavailable; any IAM or
// upstream failure throws so the proxy reports the real cause to the caller.

const IAM_TOKEN_URL = 'https://iam.cloud.ibm.com/identity/token';

// Refresh the IAM token this many ms before its stated expiry so an in-flight
// request never races the hard expiry boundary.
const TOKEN_SKEW_MS = 5 * 60 * 1000;

// Module-scoped token cache. Vercel keeps a function instance warm across
// invocations, so caching the ~1h IAM token here saves a token round-trip on
// every chat request. Keyed by API key so multiple keys never cross-pollute.
const tokenCache = new Map(); // apiKey → { token, expiresAt }
const inflight = new Map(); // apiKey → Promise<string>

// Read and normalise watsonx configuration from the environment. `configured`
// is true only when an API key AND a project (or space) are both present —
// watsonx requires scoping on every inference request, so a key alone is not
// enough to serve a model.
export function watsonxConfig(env = process.env) {
	const apiKey = env.WATSONX_API_KEY?.trim();
	const projectId = env.WATSONX_PROJECT_ID?.trim();
	const spaceId = env.WATSONX_SPACE_ID?.trim();
	return {
		configured: Boolean(apiKey && (projectId || spaceId)),
		apiKey,
		projectId,
		spaceId,
		// us-south is the default deployment region; override per region host.
		url: (env.WATSONX_URL?.trim() || 'https://us-south.ml.cloud.ibm.com').replace(/\/$/, ''),
		iamUrl: env.WATSONX_IAM_URL?.trim() || IAM_TOKEN_URL,
		apiVersion: env.WATSONX_API_VERSION?.trim() || '2024-05-31',
		// The Time Series Forecasting API GA'd Feb 2025, so it needs a newer API
		// version contract than the chat endpoints. Overridable per account/region.
		tsApiVersion: env.WATSONX_TS_API_VERSION?.trim() || '2025-02-11',
		chatModel: env.WATSONX_MODEL_ID?.trim() || 'ibm/granite-3-8b-instruct',
		// Granite embedding model used by the semantic features (Agent Galaxy).
		// 278m-multilingual is the broad default; override per account/region.
		embedModel: env.WATSONX_EMBED_MODEL_ID?.trim() || 'ibm/granite-embedding-278m-multilingual',
	};
}

// Mint (or reuse) an IAM bearer token for the given config. Concurrent callers
// coalesce onto a single in-flight IAM round-trip per API key.
export async function watsonxToken(cfg) {
	if (!cfg.apiKey) throw new Error('WATSONX_API_KEY is not set');
	const now = Date.now();
	const cached = tokenCache.get(cfg.apiKey);
	if (cached && cached.expiresAt - TOKEN_SKEW_MS > now) return cached.token;
	if (inflight.has(cfg.apiKey)) return inflight.get(cfg.apiKey);

	const p = (async () => {
		const res = await fetch(cfg.iamUrl, {
			method: 'POST',
			headers: {
				'content-type': 'application/x-www-form-urlencoded',
				accept: 'application/json',
			},
			body: new URLSearchParams({
				grant_type: 'urn:ibm:params:oauth:grant-type:apikey',
				apikey: cfg.apiKey,
			}),
		});
		const data = await res.json().catch(() => ({}));
		if (!res.ok || !data.access_token) {
			throw new Error(
				`watsonx IAM auth failed (${res.status}): ${data.errorMessage || data.errorCode || 'no access_token'}`,
			);
		}
		tokenCache.set(cfg.apiKey, {
			token: data.access_token,
			expiresAt: now + (Number(data.expires_in) || 3600) * 1000,
		});
		return data.access_token;
	})();

	inflight.set(cfg.apiKey, p);
	try {
		return await p;
	} finally {
		inflight.delete(cfg.apiKey);
	}
}

// Authorization headers for a streaming chat request. Separated from the body
// so callers that build their own payload (api/chat.js) can resolve headers
// lazily inside their own fetch/failover loop.
export async function watsonxAuthHeaders(cfg) {
	return {
		Authorization: `Bearer ${await watsonxToken(cfg)}`,
		'Content-Type': 'application/json',
		Accept: 'text/event-stream',
	};
}

// A bearer-token Authorization header for a non-streaming JSON request
// (embeddings, one-shot chat). Accept is application/json, not event-stream.
async function jsonAuthHeaders(cfg) {
	return {
		Authorization: `Bearer ${await watsonxToken(cfg)}`,
		'Content-Type': 'application/json',
		Accept: 'application/json',
	};
}

// POST a body to a watsonx ml endpoint and return the parsed JSON. Adds the
// version query param and surfaces the real upstream status + message on
// failure so callers report the true cause (auth, quota, unsupported model).
async function watsonxPost(cfg, path, body, version) {
	const headers = await jsonAuthHeaders(cfg);
	const res = await fetch(`${cfg.url}${path}?version=${version || cfg.apiVersion}`, {
		method: 'POST',
		headers,
		body: JSON.stringify({ ...body, ...scope(cfg) }),
	});
	const text = await res.text();
	if (!res.ok) {
		let detail = text.slice(0, 300);
		try {
			const j = JSON.parse(text);
			detail = j.errors?.[0]?.message || j.message || detail;
		} catch {
			// non-JSON error body — keep the raw slice
		}
		throw new Error(`watsonx ${res.status}: ${detail}`);
	}
	return text ? JSON.parse(text) : {};
}

// The project/space scoping object every inference body requires.
function scope(cfg) {
	return cfg.projectId ? { project_id: cfg.projectId } : { space_id: cfg.spaceId };
}

// Embed one or more texts with a Granite embedding model. Returns one vector
// per input (order preserved) plus the model and dimensionality. watsonx caps
// inputs per call, so large sets must be chunked by the caller.
export async function watsonxEmbed(cfg, { inputs, model } = {}) {
	if (!Array.isArray(inputs) || inputs.length === 0) {
		throw new Error('watsonxEmbed: inputs must be a non-empty array');
	}
	const data = await watsonxPost(cfg, '/ml/v1/text/embeddings', {
		model_id: model || cfg.embedModel,
		inputs,
	});
	const vectors = (data.results || []).map((r) => r.embedding);
	return {
		model: model || cfg.embedModel,
		vectors,
		dimensions: vectors[0]?.length ?? 0,
		inputCount: inputs.length,
	};
}

// One-shot (non-streaming) chat completion. Used where we need a short, whole
// answer rather than a token stream — e.g. asking Granite to name a cluster of
// semantically-similar agents. Returns the assistant text and token usage.
export async function watsonxChatComplete(cfg, { messages, model, maxTokens, temperature } = {}) {
	const parameters = {};
	if (maxTokens != null) parameters.max_tokens = maxTokens;
	if (temperature != null) parameters.temperature = temperature;
	const data = await watsonxPost(cfg, '/ml/v1/text/chat', {
		model_id: model || cfg.chatModel,
		messages,
		...(Object.keys(parameters).length ? { parameters } : {}),
	});
	const choice = data.choices?.[0];
	return {
		text: choice?.message?.content ?? '',
		finishReason: choice?.finish_reason,
		usage: data.usage,
		model: data.model_id || model || cfg.chatModel,
	};
}

// ── Granite Time Series (TinyTimeMixer) forecasting ──────────────────────────
//
// IBM's Granite TS foundation models do zero-shot multivariate forecasting via
// the watsonx.ai Time Series Forecasting API (GA Feb 2025). Each model name
// encodes <context length>-<max horizon>: ttm-512-96 ingests 512 points and can
// predict up to 96 ahead. Input series must be at least `context` points long.

export const TS_MODELS = [
	{ id: 'ibm/granite-ttm-512-96-r2', context: 512, horizon: 96 },
	{ id: 'ibm/granite-ttm-1024-96-r2', context: 1024, horizon: 96 },
	{ id: 'ibm/granite-ttm-1536-96-r2', context: 1536, horizon: 96 },
];
export const DEFAULT_TS_MODEL = 'ibm/granite-ttm-512-96-r2';
const TS_MODEL_BY_ID = new Map(TS_MODELS.map((m) => [m.id, m]));

export function tsModelSpec(id) {
	return TS_MODEL_BY_ID.get(id) || null;
}

/**
 * Zero-shot univariate forecast with a Granite TS foundation model.
 *
 * @param {object} cfg watsonxConfig() result
 * @param {object} opts
 * @param {string[]} opts.timestamps  ISO-8601 timestamps, evenly spaced, ascending
 * @param {number[]} opts.values      target values, same length as timestamps
 * @param {string}   opts.freq        pandas offset alias for the spacing (e.g. "5min", "1h", "1D")
 * @param {number}  [opts.predictionLength]  steps to forecast (clamped to the model horizon)
 * @param {string}  [opts.model]      one of TS_MODELS ids
 * @returns {Promise<{ model:string, horizon:number, timestamps:string[], values:number[] }>}
 * @throws  {Error} with code 'insufficient_data' when fewer than `context` points are given.
 */
export async function watsonxForecast(
	cfg,
	{ timestamps, values, freq, predictionLength, model } = {},
) {
	const spec = TS_MODEL_BY_ID.get(model || DEFAULT_TS_MODEL);
	if (!spec) throw new Error(`unsupported time series model: ${model}`);
	if (!Array.isArray(timestamps) || !Array.isArray(values) || timestamps.length !== values.length)
		throw new Error('watsonxForecast: timestamps and values must be equal-length arrays');
	if (!freq) throw new Error('watsonxForecast: freq is required');
	if (timestamps.length < spec.context) {
		throw Object.assign(
			new Error(`need at least ${spec.context} points for ${spec.id} (got ${timestamps.length})`),
			{ code: 'insufficient_data', need: spec.context, got: timestamps.length },
		);
	}

	const horizon = Math.max(1, Math.min(Number(predictionLength) || spec.horizon, spec.horizon));
	// The model reads exactly its context window; send the most recent points.
	const ts = timestamps.slice(-spec.context);
	const vals = values.slice(-spec.context);

	const data = await watsonxPost(
		cfg,
		'/ml/v1/time_series/forecast',
		{
			model_id: spec.id,
			data: { date: ts, value: vals },
			schema: { timestamp_column: 'date', target_columns: ['value'], freq },
			parameters: { prediction_length: horizon },
		},
		cfg.tsApiVersion,
	);

	const result = data.results?.[0] || {};
	const outTimestamps = result.date || [];
	const outValues = (result.value || []).map(Number);
	if (!outValues.length) throw new Error('watsonx returned an empty forecast');
	return { model: spec.id, horizon, timestamps: outTimestamps, values: outValues };
}

// Build a ready-to-fetch streaming chat request. `messages` is the standard
// [{ role, content }] array (system messages allowed). The response body is an
// SSE stream of OpenAI-shaped chat completion chunks.
export async function watsonxChatRequest(cfg, { model, messages, maxTokens } = {}) {
	const headers = await watsonxAuthHeaders(cfg);
	return {
		url: `${cfg.url}/ml/v1/text/chat_stream?version=${cfg.apiVersion}`,
		headers,
		body: {
			model_id: model || cfg.chatModel,
			...(cfg.projectId ? { project_id: cfg.projectId } : { space_id: cfg.spaceId }),
			messages,
			...(maxTokens ? { max_tokens: maxTokens } : {}),
		},
	};
}
