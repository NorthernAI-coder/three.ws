// Canonical server-side text completion + the platform's LLM provider policy.
//
// Policy (do not re-implement per endpoint — that is how this drifted before):
//
//   • FREE PROVIDERS FIRST, ALWAYS. Groq, OpenRouter, and NVIDIA NIM are
//     platform-funded free tiers — the server holds those keys and callers use
//     them at zero marginal cost. They form the default chain, tried in order,
//     and every flow must survive on them alone: the paid keys in prod are
//     routinely invalid or out of quota, so a chain that depends on them fails.
//
//   • Paid server keys are the LAST-RESORT tier, automatically. When
//     ANTHROPIC_API_KEY or OPENAI_API_KEY is configured, those providers are
//     appended to the tail of EVERY chain so a request that exhausted the
//     free providers still succeeds instead of erroring. They never lead, and
//     no flow hard-fails when they are absent or out of quota.
//
//   • BYOK is the one exception to free-first: a caller-supplied
//     `anthropicKey` (e.g. an agent owner's own key) leads the chain — that's
//     the caller's explicit model choice on the caller's own billing — still
//     degrading to the free chain on failure.
//
// Consolidated from the multi-provider fallback that already lived in
// api/persona/extract.js and api/persona/preview.js.

import { env } from './env.js';
import { recordEvent } from './usage.js';
import { costMicroUsd } from './llm-pricing.js';

const GROQ_MODEL = 'llama-3.3-70b-versatile';
const OPENROUTER_MODEL = 'meta-llama/llama-3.3-70b-instruct';
// Same Llama 3.3 70B family on NVIDIA NIM (build.nvidia.com) — one free nvapi
// key, OpenAI-compatible, so the chain degrades across providers without
// changing model behavior.
const NVIDIA_MODEL = 'meta/llama-3.3-70b-instruct';
const ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001';
// Paid last-resort tail (see policy above). Mini keeps the backstop cheap; the
// repo-wide OpenAI default (api/_lib/chat-models.js) uses the same model.
const OPENAI_MODEL = 'gpt-4o-mini';

// Thrown when no provider is available at all (no free key configured and no
// BYOK key supplied). Carries an HTTP status so handlers can surface it as 503.
export class LlmUnavailableError extends Error {
	constructor(message = 'No LLM provider available. Configure GROQ_API_KEY, OPENROUTER_API_KEY, or NVIDIA_API_KEY (free), or ANTHROPIC_API_KEY / OPENAI_API_KEY (paid backstop), or supply a BYOK Anthropic key.') {
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

// Build the ordered provider chain for a request: free platform providers
// first (Groq → OpenRouter keys → NVIDIA NIM), paid providers only at the
// edges. A caller-supplied BYOK `anthropicKey` leads the chain — that's the
// caller's explicit model choice on the caller's own billing — and still
// degrades to the free chain on failure. The server ANTHROPIC_API_KEY and
// OPENAI_API_KEY are appended LAST, automatically, as backstops after every
// free provider: the prod paid keys are routinely invalid or out of quota, so
// platform spend never leads and nothing depends on it — but when a key does
// work, a request that exhausted the free tier still succeeds.
function providerChain({ anthropicKey, anthropicModel } = {}) {
	const chain = [];
	if (anthropicKey) chain.push(anthropicProvider(anthropicKey, anthropicModel));
	if (env.GROQ_API_KEY) {
		chain.push(openaiCompatProvider({
			name: 'groq',
			key: env.GROQ_API_KEY,
			url: 'https://api.groq.com/openai/v1/chat/completions',
			model: GROQ_MODEL,
		}));
	}
	// One provider entry per OpenRouter key: when the primary account runs out
	// of credits (402) or hits a rate limit, the next key takes over. Fallback
	// keys are typically unfunded free-tier accounts, so they get the model's
	// :free variant — the paid model would 402 on them unconditionally.
	const openrouterKeys = [...new Set([env.OPENROUTER_API_KEY, ...env.OPENROUTER_FALLBACK_KEYS].filter(Boolean))];
	openrouterKeys.forEach((key, i) => {
		chain.push(openaiCompatProvider({
			name: i === 0 ? 'openrouter' : `openrouter#${i + 1}`,
			key,
			url: 'https://openrouter.ai/api/v1/chat/completions',
			model: i === 0 ? OPENROUTER_MODEL : `${OPENROUTER_MODEL}:free`,
			extraHeaders: { 'HTTP-Referer': 'https://three.ws', 'X-Title': 'three.ws' },
		}));
	});
	if (env.NVIDIA_API_KEY) {
		chain.push(openaiCompatProvider({
			name: 'nvidia',
			key: env.NVIDIA_API_KEY,
			url: 'https://integrate.api.nvidia.com/v1/chat/completions',
			model: NVIDIA_MODEL,
		}));
	}
	// Paid backstops — always appended, never leading. Server Anthropic is
	// skipped when a BYOK key already leads the chain (the caller chose their
	// own Claude billing; the platform doesn't re-buy the same model for them).
	if (!anthropicKey && env.ANTHROPIC_API_KEY) {
		chain.push(anthropicProvider(env.ANTHROPIC_API_KEY, anthropicModel));
	}
	if (env.OPENAI_API_KEY) {
		chain.push(openaiCompatProvider({
			name: 'openai',
			key: env.OPENAI_API_KEY,
			url: 'https://api.openai.com/v1/chat/completions',
			model: OPENAI_MODEL,
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
export async function llmComplete({ system, user, maxTokens = 1024, anthropicKey = null, anthropicModel = null, timeoutMs = 30_000, track = null }) {
	const chain = providerChain({ anthropicKey, anthropicModel });
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
