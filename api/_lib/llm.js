// Canonical server-side text completion + the platform's LLM provider policy.
//
// Policy (do not re-implement per endpoint — that is how this drifted before):
//
//   • Groq and OpenRouter are PLATFORM-FUNDED. The server holds those keys and
//     callers use them for free. They are the default providers, tried in order.
//
//   • Anthropic is used when the caller passes an explicit BYOK `anthropicKey`
//     (e.g. an agent owner's own key), OR when the caller opts in with
//     `serverAnthropic: true` and a server `ANTHROPIC_API_KEY` is configured.
//     Both are OFF by default: a caller that passes neither never touches
//     Anthropic, and no flow hard-fails when the key is absent — every flow
//     still degrades to the free providers.
//
// Consolidated from the multi-provider fallback that already lived in
// api/persona/extract.js and api/persona/preview.js.

import { env } from './env.js';
import { recordEvent } from './usage.js';
import { costMicroUsd } from './llm-pricing.js';

const GROQ_MODEL = 'llama-3.3-70b-versatile';
const OPENROUTER_MODEL = 'meta-llama/llama-3.3-70b-instruct';
const ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001';

// Thrown when no provider is available at all (no free key configured and no
// BYOK key supplied). Carries an HTTP status so handlers can surface it as 503.
export class LlmUnavailableError extends Error {
	constructor(message = 'No LLM provider available. Configure GROQ_API_KEY or OPENROUTER_API_KEY, or supply a BYOK Anthropic key.') {
		super(message);
		this.name = 'LlmUnavailableError';
		this.code = 'llm_unavailable';
		this.status = 503;
	}
}

function anthropicProvider(key, model) {
	const m = model || ANTHROPIC_MODEL;
	return {
		name: 'anthropic',
		model: m,
		url: 'https://api.anthropic.com/v1/messages',
		headers: {
			'content-type': 'application/json',
			'x-api-key': key,
			'anthropic-version': '2023-06-01',
		},
		buildBody: (system, user, maxTokens) => ({
			model: m,
			max_tokens: maxTokens,
			system,
			messages: [{ role: 'user', content: user }],
		}),
		extractText: (r) => r.content?.[0]?.text || '',
		extractUsage: (r) => ({ input: r.usage?.input_tokens ?? 0, output: r.usage?.output_tokens ?? 0 }),
	};
}

function openaiCompatProvider({ name, key, url, model, extraHeaders = {} }) {
	return {
		name,
		model,
		url,
		headers: { 'content-type': 'application/json', authorization: `Bearer ${key}`, ...extraHeaders },
		buildBody: (system, user, maxTokens) => ({
			model,
			max_tokens: maxTokens,
			messages: [
				{ role: 'system', content: system },
				{ role: 'user', content: user },
			],
		}),
		extractText: (r) => r.choices?.[0]?.message?.content || '',
		extractUsage: (r) => ({ input: r.usage?.prompt_tokens ?? 0, output: r.usage?.completion_tokens ?? 0 }),
	};
}

// Build the ordered provider chain for a request. Anthropic leads when keyed —
// a caller-supplied BYOK key always, or the server `ANTHROPIC_API_KEY` when the
// caller opts in with `serverAnthropic: true`. After that come the free platform
// providers (Groq, then OpenRouter).
//
// `serverAnthropic` is opt-in (default off) so the historical BYOK-only policy
// is unchanged for existing callers: the platform never *depends* on a server
// Anthropic key and still degrades to the free providers when it's absent. The
// persona endpoints opt in to get Anthropic-first ordered failover.
function providerChain({ anthropicKey, anthropicModel, serverAnthropic = false } = {}) {
	const chain = [];
	if (anthropicKey) chain.push(anthropicProvider(anthropicKey, anthropicModel));
	else if (serverAnthropic && env.ANTHROPIC_API_KEY) chain.push(anthropicProvider(env.ANTHROPIC_API_KEY, anthropicModel));
	if (env.GROQ_API_KEY) {
		chain.push(openaiCompatProvider({
			name: 'groq',
			key: env.GROQ_API_KEY,
			url: 'https://api.groq.com/openai/v1/chat/completions',
			model: GROQ_MODEL,
		}));
	}
	if (env.OPENROUTER_API_KEY) {
		chain.push(openaiCompatProvider({
			name: 'openrouter',
			key: env.OPENROUTER_API_KEY,
			url: 'https://openrouter.ai/api/v1/chat/completions',
			model: OPENROUTER_MODEL,
			extraHeaders: { 'HTTP-Referer': 'https://three.ws', 'X-Title': 'three.ws' },
		}));
	}
	return chain;
}

// True when at least one provider can serve a completion for the given options.
// Use to gate a feature without making the doomed upstream call.
export function llmConfigured(opts = {}) {
	return providerChain(opts).length > 0;
}

// Run a single-shot system+user completion against the first available
// provider, falling over to the next on transport or non-2xx errors.
//
// `timeoutMs` bounds each provider attempt (the next provider is tried if one
// times out), so a hung upstream can't stall a serverless function or agent
// tick indefinitely.
//
// Returns { text, provider, model, usage:{input,output}, raw }.
// Throws LlmUnavailableError when no provider is configured, or the last
// upstream error (with .status = 502) when every provider failed.
//
// `track` is optional attribution for the spend ledger. When supplied, every
// successful completion records a kind:'llm' usage event carrying the provider,
// model, token counts, and computed cost (micro-USD) — this is what makes
// platform LLM spend visible on the admin dashboard. The fields it accepts —
// { userId, agentId, avatarId, clientId, apiKeyId, tool } — are all optional;
// pass whatever the call site knows. Recording is fire-and-forget (see
// recordEvent), so it never delays or fails the completion.
export async function llmComplete({ system, user, maxTokens = 1024, anthropicKey = null, anthropicModel = null, serverAnthropic = false, timeoutMs = 30_000, track = null }) {
	const chain = providerChain({ anthropicKey, anthropicModel, serverAnthropic });
	if (!chain.length) throw new LlmUnavailableError();

	let lastErr;
	for (const p of chain) {
		const startedAt = Date.now();
		let upstream;
		try {
			upstream = await fetch(p.url, {
				method: 'POST',
				headers: p.headers,
				body: JSON.stringify(p.buildBody(system, user, maxTokens)),
				signal: AbortSignal.timeout(timeoutMs),
			});
		} catch (e) {
			lastErr = Object.assign(new Error(`${p.name} unreachable: ${e.message}`), { status: 502, code: 'upstream_unreachable' });
			continue;
		}
		if (!upstream.ok) {
			const body = await upstream.text().catch(() => '');
			lastErr = Object.assign(new Error(`${p.name} ${upstream.status}: ${body.slice(0, 200)}`), { status: 502, code: 'upstream_error' });
			continue;
		}
		const data = await upstream.json();
		const usage = p.extractUsage(data);
		recordLlmSpend(p, usage, Date.now() - startedAt, track);
		return {
			text: (p.extractText(data) || '').trim(),
			provider: p.name,
			model: p.model,
			usage,
			raw: data,
		};
	}
	throw lastErr || new LlmUnavailableError();
}

// Fire-and-forget spend ledger write for one completion. Attribution comes from
// the caller's optional `track`; the cost is derived from the provider/model
// (free providers price to 0). Never throws — recordEvent swallows its own
// errors and the cost math is total.
function recordLlmSpend(provider, usage, latencyMs, track) {
	const input = usage?.input ?? 0;
	const output = usage?.output ?? 0;
	recordEvent({
		kind: 'llm',
		provider: provider.name,
		model: provider.model,
		inputTokens: input,
		outputTokens: output,
		costMicroUsd: costMicroUsd({ provider: provider.name, model: provider.model, input, output }),
		latencyMs,
		userId: track?.userId ?? null,
		agentId: track?.agentId ?? null,
		avatarId: track?.avatarId ?? null,
		clientId: track?.clientId ?? null,
		apiKeyId: track?.apiKeyId ?? null,
		tool: track?.tool ?? null,
	});
}
