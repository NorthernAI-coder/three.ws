// POST /api/brain/chat — Multi-LLM provider proxy for the /brain page.
//
// Body: { provider, messages, system?, maxTokens? }
// Response: SSE stream:
//   event: meta    → { provider, label, network, model, tier }
//   event: first   → { firstTokenMs }
//   (data-only)    → JSON-encoded text chunk
//   event: done    → { elapsedMs, firstTokenMs, usage }
//   event: error   → { message, elapsedMs }
//
// GET /api/brain/chat → returns available providers list

import { streamText } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createQwen } from 'qwen-ai-provider';
import { env } from '../_lib/env.js';
import { cors, method, readJson, error, wrap } from '../_lib/http.js';
import { watsonxConfig, watsonxChatRequest } from '../_lib/watsonx.js';

export const maxDuration = 120;

// Each spec declares its *native* provider model (built from a first-party key,
// or null when that key is absent) and the OpenRouter model id that mirrors it.
// buildPrimary() prefers the native model and falls back to routing through
// OpenRouter; buildFallback() reuses the OpenRouter id to route *around* a native
// provider outage (quota/billing/rate-limit) at request time.
const PROVIDERS = {
	'gpt-oss-120b': {
		label: 'GPT-OSS 120B',
		network: 'OpenAI · OpenRouter',
		tier: 'balanced',
		maxOutput: 8192,
		description: "OpenAI's open-weight 120B. Fast, capable, free tier. Platform default.",
		// OpenRouter-only — no first-party key for the free tier.
		openrouterModel: 'openai/gpt-oss-120b:free',
	},
	'claude-opus-4-7': {
		label: 'Claude Opus 4.7',
		network: 'Anthropic',
		tier: 'flagship',
		maxOutput: 16384,
		description: 'Most capable. Extended thinking, complex reasoning.',
		native: () => (env.ANTHROPIC_API_KEY ? createAnthropic({ apiKey: env.ANTHROPIC_API_KEY })('claude-opus-4-7') : null),
		openrouterModel: 'anthropic/claude-opus-4',
	},
	'claude-sonnet-4-6': {
		label: 'Claude Sonnet 4.6',
		network: 'Anthropic',
		tier: 'balanced',
		maxOutput: 16384,
		description: 'Balanced speed and intelligence. Best for most tasks.',
		native: () => (env.ANTHROPIC_API_KEY ? createAnthropic({ apiKey: env.ANTHROPIC_API_KEY })('claude-sonnet-4-6') : null),
		openrouterModel: 'anthropic/claude-sonnet-4',
	},
	'claude-haiku-4-5': {
		label: 'Claude Haiku 4.5',
		network: 'Anthropic',
		tier: 'fast',
		maxOutput: 8192,
		description: 'Fastest Claude. Low latency, high throughput.',
		native: () => (env.ANTHROPIC_API_KEY ? createAnthropic({ apiKey: env.ANTHROPIC_API_KEY })('claude-haiku-4-5-20251001') : null),
		openrouterModel: 'anthropic/claude-3.5-haiku',
	},
	'gpt-4o': {
		label: 'GPT-4o',
		network: 'OpenAI',
		tier: 'flagship',
		maxOutput: 16384,
		description: 'OpenAI flagship. Strong multimodal reasoning.',
		native: () => (env.OPENAI_API_KEY ? createOpenAI({ apiKey: env.OPENAI_API_KEY }).chat('gpt-4o') : null),
		openrouterModel: 'openai/gpt-4o',
	},
	'gpt-4o-mini': {
		label: 'GPT-4o-mini',
		network: 'OpenAI',
		tier: 'fast',
		maxOutput: 16384,
		description: 'Fast, affordable GPT. Great for simple tasks.',
		native: () => (env.OPENAI_API_KEY ? createOpenAI({ apiKey: env.OPENAI_API_KEY }).chat('gpt-4o-mini') : null),
		openrouterModel: 'openai/gpt-4o-mini',
	},
	'o3-mini': {
		label: 'o3-mini',
		network: 'OpenAI',
		tier: 'reasoning',
		maxOutput: 16384,
		description: 'Reasoning-optimized. Fast chain-of-thought.',
		native: () => (env.OPENAI_API_KEY ? createOpenAI({ apiKey: env.OPENAI_API_KEY }).chat('o3-mini') : null),
		openrouterModel: 'openai/o3-mini',
	},
	'groq-llama': {
		label: 'Llama 3.3 70B',
		network: 'Groq',
		tier: 'fast',
		maxOutput: 8192,
		description: 'Open-weight on Groq. Extremely fast inference.',
		native: () =>
			env.GROQ_API_KEY
				? createOpenAI({ apiKey: env.GROQ_API_KEY, baseURL: 'https://api.groq.com/openai/v1' }).chat('llama-3.3-70b-versatile')
				: null,
		openrouterModel: 'meta-llama/llama-3.3-70b-instruct',
	},
	'qwen-plus': {
		label: 'Qwen Plus',
		network: 'DashScope',
		tier: 'balanced',
		maxOutput: 8192,
		description: 'Qwen Plus on DashScope. Strong multilingual.',
		native: () => (env.DASHSCOPE_API_KEY ? createQwen({ apiKey: env.DASHSCOPE_API_KEY })('qwen-plus') : null),
		openrouterModel: 'qwen/qwen-2.5-72b-instruct',
	},
	'modelscope-qwen': {
		label: 'Qwen3-Coder 480B',
		network: 'ModelScope',
		tier: 'flagship',
		maxOutput: 16384,
		description: 'Largest Qwen coder. Exceptional code generation.',
		native: () =>
			env.MODELSCOPE_API_KEY
				? createOpenAI({ apiKey: env.MODELSCOPE_API_KEY, baseURL: 'https://api-inference.modelscope.cn/v1' }).chat('Qwen/Qwen3-Coder-480B-A35B-Instruct')
				: null,
		openrouterModel: 'qwen/qwen3-coder',
	},
	'deepseek-r1': {
		label: 'DeepSeek R1',
		network: 'DeepSeek',
		tier: 'reasoning',
		maxOutput: 8192,
		description: 'Open reasoning model. Strong at math and code.',
		native: () =>
			env.DEEPSEEK_API_KEY
				? createOpenAI({ apiKey: env.DEEPSEEK_API_KEY, baseURL: 'https://api.deepseek.com/v1' }).chat('deepseek-reasoner')
				: null,
		openrouterModel: 'deepseek/deepseek-r1',
	},
	// IBM watsonx.ai Granite. watsonx is not OpenAI-compatible at the API layer
	// (IAM bearer token, project scoping, version param), so it can't be a
	// Vercel AI SDK model object. The `watsonx` flag routes it to a dedicated
	// streaming path; buildPrimary() only reports availability.
	'ibm-granite': {
		label: 'IBM Granite 3.8B',
		network: 'IBM watsonx.ai',
		tier: 'balanced',
		maxOutput: 4096,
		description: 'IBM’s open, enterprise-governed foundation model on watsonx.ai.',
		watsonx: true,
	},
};

// Resolve the primary route for a spec: native first-party model when its key is
// present, otherwise the OpenRouter-routed equivalent, otherwise nothing. `via`
// records which path won so buildFallback() knows whether OpenRouter is a
// distinct escape hatch.
function buildPrimary(spec) {
	if (spec.watsonx) return watsonxConfig().configured ? { kind: 'watsonx' } : null;
	const native = spec.native?.();
	if (native) return { kind: 'model', model: native, via: 'native' };
	if (spec.openrouterModel && env.OPENROUTER_API_KEY) {
		return { kind: 'model', model: openrouter()(spec.openrouterModel), via: 'openrouter' };
	}
	return null;
}

// A distinct fallback exists only when the primary ran on a native provider key
// AND an OpenRouter key is configured — then OpenRouter routes around a native
// outage (quota exhausted, out of credits, rate-limited). When the primary was
// already OpenRouter there's nowhere better to retry.
function buildFallback(spec, primary) {
	if (primary?.via !== 'native' || !spec.openrouterModel || !env.OPENROUTER_API_KEY) return null;
	return openrouter()(spec.openrouterModel);
}

function openrouter() {
	const provider = createOpenAI({
		apiKey: env.OPENROUTER_API_KEY,
		baseURL: 'https://openrouter.ai/api/v1',
		headers: { 'HTTP-Referer': 'https://three.ws', 'X-Title': 'three.ws brain' },
	});
	// OpenRouter (like every OpenAI-*compatible* backend) implements the Chat
	// Completions API, NOT OpenAI's newer Responses API. The AI SDK's callable
	// default `provider(id)` builds a Responses-API model, which OpenRouter
	// rejects ("Invalid Responses API request" / "unsupported content types").
	// Force the chat-completions surface so every routed model actually answers.
	return (modelId) => provider.chat(modelId);
}

// Stream IBM Granite (watsonx.ai) to the page using the same SSE protocol as
// the AI SDK path. watsonx returns OpenAI-shaped chat completion chunks
// (choices[].delta.content) plus a usage block on the final chunk.
async function streamWatsonx(res, { messages, system, maxTokens, t0 }) {
	const cfg = watsonxConfig();
	const wxMessages = system ? [{ role: 'system', content: system }, ...messages] : messages;
	const { url, headers, body } = await watsonxChatRequest(cfg, {
		messages: wxMessages,
		maxTokens,
	});

	const upstream = await fetch(url, {
		method: 'POST',
		headers,
		body: JSON.stringify(body),
	});
	if (!upstream.ok || !upstream.body) {
		const detail = await upstream.text().catch(() => '');
		throw new Error(`watsonx ${upstream.status}: ${detail.slice(0, 200)}`);
	}

	const reader = upstream.body.getReader();
	const decoder = new TextDecoder();
	let buf = '';
	let firstTokenMs = null;
	let usage = null;

	while (true) {
		const { value, done } = await reader.read();
		if (done) break;
		buf += decoder.decode(value, { stream: true });
		const lines = buf.split('\n');
		buf = lines.pop();
		for (const line of lines) {
			if (!line.startsWith('data:')) continue;
			const raw = line.slice(5).trim();
			if (!raw || raw === '[DONE]') continue;
			let evt;
			try {
				evt = JSON.parse(raw);
			} catch {
				continue;
			}
			const delta = evt.choices?.[0]?.delta?.content;
			if (delta) {
				if (firstTokenMs === null) {
					firstTokenMs = Date.now() - t0;
					res.write(`event: first\ndata: ${JSON.stringify({ firstTokenMs })}\n\n`);
				}
				res.write(`data: ${JSON.stringify(delta)}\n\n`);
			}
			if (evt.usage) {
				usage = {
					inputTokens: evt.usage.prompt_tokens,
					outputTokens: evt.usage.completion_tokens,
					totalTokens: evt.usage.total_tokens,
				};
			}
		}
	}

	const elapsedMs = Date.now() - t0;
	res.write(`event: done\ndata: ${JSON.stringify({ elapsedMs, firstTokenMs, usage })}\n\n`);
	res.write('data: [DONE]\n\n');
	res.end();
}

function validateMessages(input) {
	if (!Array.isArray(input)) {
		throw Object.assign(new Error('messages must be an array'), { status: 400 });
	}
	if (input.length === 0 || input.length > 100) {
		throw Object.assign(new Error('messages length out of range'), { status: 400 });
	}
	const out = [];
	for (const m of input) {
		if (!m || typeof m !== 'object') throw Object.assign(new Error('bad message'), { status: 400 });
		const role = m.role;
		const content = typeof m.content === 'string' ? m.content.slice(0, 16000) : '';
		if (!['user', 'assistant'].includes(role)) {
			throw Object.assign(new Error('role must be user|assistant'), { status: 400 });
		}
		if (!content.trim()) throw Object.assign(new Error('empty content'), { status: 400 });
		out.push({ role, content });
	}
	return out;
}

function getAvailableProviders() {
	return Object.entries(PROVIDERS).map(([key, spec]) => {
		const available = Boolean(buildPrimary(spec));
		return {
			key,
			label: spec.label,
			network: spec.network,
			tier: spec.tier,
			maxOutput: spec.maxOutput,
			description: spec.description,
			available,
		};
	});
}

export default wrap(async function handler(req, res) {
	if (cors(req, res, { methods: 'GET,POST,OPTIONS' })) return;

	if (req.method === 'GET') {
		const providers = getAvailableProviders();
		res.setHeader('content-type', 'application/json');
		res.setHeader('cache-control', 'public, s-maxage=60, stale-while-revalidate=120');
		res.end(JSON.stringify({ providers }));
		return;
	}

	if (!method(req, res, ['POST'])) return;

	let body;
	try {
		body = await readJson(req, 200_000);
	} catch (e) {
		return error(res, e.status || 400, 'bad_request', e.message);
	}

	const providerKey = String(body.provider || 'gpt-oss-120b');
	const spec = PROVIDERS[providerKey];
	if (!spec) {
		return error(res, 400, 'unknown_provider', `unknown provider: ${providerKey}`, {
			available: Object.keys(PROVIDERS),
		});
	}

	const primary = buildPrimary(spec);
	if (!primary) {
		return error(res, 503, 'provider_not_configured',
			`No API key for ${spec.label}. Add your own key in Account → AI Provider Keys to unlock this model.`);
	}
	// OpenRouter escape hatch for a native-provider outage (quota/credits/rate).
	const fallbackModel = buildFallback(spec, primary);

	let messages;
	try {
		messages = validateMessages(body.messages);
	} catch (e) {
		return error(res, e.status || 400, 'bad_request', e.message);
	}

	const system = typeof body.system === 'string' ? body.system.slice(0, 8000) : undefined;
	const maxTokens = Math.min(Math.max(Number(body.maxTokens) || 4096, 64), spec.maxOutput);

	res.statusCode = 200;
	res.setHeader('content-type', 'text/event-stream; charset=utf-8');
	res.setHeader('cache-control', 'no-cache, no-transform');
	res.setHeader('connection', 'keep-alive');
	res.setHeader('x-accel-buffering', 'no');

	const t0 = Date.now();
	res.write(`event: meta\ndata: ${JSON.stringify({
		provider: providerKey,
		label: spec.label,
		network: spec.network,
		tier: spec.tier,
	})}\n\n`);

	// Per-attempt abort budget. A hung native provider must not silently consume
	// the whole maxDuration; cap each streamText attempt at the smaller of
	// PER_ATTEMPT_MS or the remaining wall-clock so it aborts fast and hands off
	// to the OpenRouter fallback while time remains. Mirrors the timeout-budget
	// pattern in api/chat.js. TOTAL_BUDGET_MS leaves headroom under maxDuration=120
	// so a primary-then-fallback pair both fit; PER_ATTEMPT_MS stays under the
	// ~30s hang that previously near-timed-out the function.
	const TOTAL_BUDGET_MS = 110_000;
	const PER_ATTEMPT_MS = 25_000;
	const deadline = t0 + TOTAL_BUDGET_MS;
	const attemptBudgetMs = () => Math.max(1_000, Math.min(PER_ATTEMPT_MS, deadline - Date.now()));

	let firstTokenMs = null;

	// Drains one streamText attempt to the SSE response. firstTokenMs is set on
	// the first delta; once tokens have been written we are committed and can no
	// longer transparently retry (the client already has partial output).
	const streamOnce = async (budget, model) => {
		// The SDK's default onError console.errors the entire provider error object
		// (the giant 402/429 dumps in the logs). We own error handling via the
		// retry/fallback chain below, so capture it here instead. Some providers
		// report a pre-stream failure through onError rather than by throwing from
		// textStream — surfacing the captured error keeps the chain working either way.
		let streamErr = null;
		const result = streamText({
			model,
			system,
			messages,
			maxOutputTokens: budget,
			// maxRetries: 0 — the outer retry/fallback chain owns retries. The SDK
			// default of 2 means a quota-exhausted or credits-depleted key burns
			// ~10–20s retrying before surfacing the error we already know to route around.
			maxRetries: 0,
			// Bound this attempt by the remaining wall-clock so a hung provider
			// aborts fast and the outer chain can fall back while time remains. The
			// abort surfaces as a thrown error (or via onError) handled below.
			abortSignal: AbortSignal.timeout(attemptBudgetMs()),
			onError: ({ error }) => {
				streamErr = error;
			},
		});

		for await (const delta of result.textStream) {
			if (firstTokenMs === null) {
				firstTokenMs = Date.now() - t0;
				res.write(`event: first\ndata: ${JSON.stringify({ firstTokenMs })}\n\n`);
			}
			res.write(`data: ${JSON.stringify(delta)}\n\n`);
		}

		// Failure before any token streamed → hand to the retry/fallback logic.
		// A failure *after* partial output isn't retryable, so we finish cleanly
		// with whatever was produced.
		if (streamErr && firstTokenMs === null) throw streamErr;

		const usage = await result.usage.catch(() => null);
		const elapsedMs = Date.now() - t0;
		res.write(`event: done\ndata: ${JSON.stringify({
			elapsedMs,
			firstTokenMs,
			usage: usage ? {
				inputTokens: usage.inputTokens,
				outputTokens: usage.outputTokens,
				totalTokens: usage.totalTokens,
			} : null,
		})}\n\n`);
		res.write('data: [DONE]\n\n');
		res.end();
	};

	try {
		// watsonx.ai isn't an AI SDK model — stream it through the shared client,
		// emitting the same first/chunk/done event protocol the page expects.
		if (primary.kind === 'watsonx') {
			await streamWatsonx(res, { messages, system, maxTokens, t0 });
			return;
		}

		try {
			await streamOnce(maxTokens, primary.model);
		} catch (err) {
			const canRetry = firstTokenMs === null && !res.writableEnded;
			const affordable = affordableBudget(err);
			if (affordable && canRetry) {
				// OpenRouter free tier: "requires more credits, or fewer max_tokens.
				// You requested up to 1024 tokens, but can only afford 788." Retry once
				// at the affordable ceiling instead of hard-failing.
				await streamOnce(affordable, primary.model);
			} else if (fallbackModel && canRetry && isProviderOutage(err)) {
				// Native provider is down (over quota, out of credits, rate-limited).
				// Route the same request through OpenRouter so the user still gets a reply.
				console.warn(`[brain:${providerKey}] native provider failed (${conciseReason(err)}); falling back to OpenRouter`);
				try {
					await streamOnce(maxTokens, fallbackModel);
				} catch (err2) {
					const affordable2 = affordableBudget(err2);
					if (affordable2 && firstTokenMs === null && !res.writableEnded) {
						await streamOnce(affordable2, fallbackModel);
					} else {
						throw err2;
					}
				}
			} else {
				throw err;
			}
		}
	} catch (err) {
		const elapsedMs = Date.now() - t0;
		// The SDK no longer logs for us (onError is captured), so emit one concise
		// server line for observability — not the multi-screen error object.
		console.warn(`[brain:${providerKey}] stream failed: ${conciseReason(err)}`);
		if (!res.writableEnded) {
			try {
				res.write(`event: error\ndata: ${JSON.stringify({
					message: err?.message || 'upstream error',
					elapsedMs,
				})}\n\n`);
				res.end();
			} catch {
				// connection already closed — swallow to prevent unhandled rejection
			}
		}
	}
});

// OpenRouter (and some OpenAI-compatible backends) reject a request whose
// max_tokens exceeds the caller's remaining credit, naming the affordable
// ceiling: "...but can only afford 788." Returns that ceiling (with a safety
// margin) so we can retry within budget, or null when the error isn't this.
function affordableBudget(err) {
	const m = /can only afford (\d+)/i.exec(err?.message || '');
	return m ? Math.max(64, Math.floor(Number(m[1]) * 0.9)) : null;
}

// A provider-side outage we can route around (vs a caller/content error that
// every provider would reject identically): rate-limit, quota exhaustion, out of
// credits, or an upstream 5xx.
function isProviderOutage(err) {
	const status = Number(err?.statusCode || err?.cause?.statusCode || 0);
	if (status === 429 || status === 402 || status >= 500) return true;
	// An aborted attempt — our per-attempt timeout budget firing on a hung
	// provider — is route-around-able: hand off to the OpenRouter fallback rather
	// than surfacing a dead-air error to the user.
	const name = err?.name || err?.cause?.name || '';
	if (name === 'AbortError' || name === 'TimeoutError') return true;
	const msg = `${err?.message || ''} ${err?.cause?.message || ''}`;
	return /quota|insufficient_quota|rate.?limit|too many requests|billing|exceeded your current|requires more credits|overloaded|temporarily unavailable|maxRetriesExceeded|abort|timed out|timeout/i.test(msg);
}

// One-line, length-capped error summary for server logs.
function conciseReason(err) {
	const msg = (err?.message || String(err)).replace(/\s+/g, ' ').trim();
	return msg.length > 160 ? `${msg.slice(0, 157)}…` : msg;
}
