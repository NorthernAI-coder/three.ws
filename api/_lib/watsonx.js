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
		chatModel: env.WATSONX_MODEL_ID?.trim() || 'ibm/granite-3-8b-instruct',
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
