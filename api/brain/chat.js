// POST /api/brain/chat — Multi-LLM provider proxy for the /demos/brain page.
//
// Body: { provider, messages, system?, maxTokens? }
// Response: SSE stream with `data: <text-chunk>\n\n` events, terminated by
// `data: [DONE]\n\n` (matching the OpenAI SSE convention the demo's client
// already parses).
//
// Providers:
//   - anthropic       → Claude Sonnet 4.6 via ANTHROPIC_API_KEY
//   - openai          → gpt-4o-mini via OPENAI_API_KEY
//   - qwen-plus       → Alibaba DashScope qwen-plus, falls back to OpenRouter
//   - qwen-vl-max     → Alibaba DashScope qwen-vl-max, falls back to OpenRouter
//   - modelscope-qwen → Qwen3-Coder-480B via ModelScope, falls back to OpenRouter
//   - groq-llama      → llama-3.3-70b on Groq via GROQ_API_KEY

import { streamText } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createQwen } from 'qwen-ai-provider';
import { env } from '../_lib/env.js';
import { cors, method, readJson, error, wrap } from '../_lib/http.js';

export const maxDuration = 60;

const PROVIDERS = {
	anthropic: {
		label: 'Claude Sonnet 4.6',
		network: 'Anthropic',
		build: () => {
			const key = env.ANTHROPIC_API_KEY;
			if (!key) return null;
			return createAnthropic({ apiKey: key })('claude-sonnet-4-6');
		},
	},
	openai: {
		label: 'GPT-4o-mini',
		network: 'OpenAI',
		build: () => {
			const key = env.OPENAI_API_KEY;
			if (!key) return null;
			return createOpenAI({ apiKey: key })('gpt-4o-mini');
		},
	},
	'qwen-plus': {
		label: 'Qwen Plus',
		network: 'Alibaba DashScope',
		build: () => {
			if (env.DASHSCOPE_API_KEY) {
				return createQwen({ apiKey: env.DASHSCOPE_API_KEY })('qwen-plus');
			}
			if (env.OPENROUTER_API_KEY) {
				return openrouter()('qwen/qwen-2.5-72b-instruct');
			}
			return null;
		},
	},
	'qwen-vl-max': {
		label: 'Qwen VL Max',
		network: 'Alibaba DashScope',
		build: () => {
			if (env.DASHSCOPE_API_KEY) {
				return createQwen({ apiKey: env.DASHSCOPE_API_KEY })('qwen-vl-max');
			}
			if (env.OPENROUTER_API_KEY) {
				return openrouter()('qwen/qwen-2.5-vl-72b-instruct');
			}
			return null;
		},
	},
	'modelscope-qwen': {
		label: 'Qwen3-Coder-480B',
		network: 'ModelScope',
		build: () => {
			if (env.MODELSCOPE_API_KEY) {
				return createOpenAI({
					apiKey: env.MODELSCOPE_API_KEY,
					baseURL: 'https://api-inference.modelscope.cn/v1',
				})('Qwen/Qwen3-Coder-480B-A35B-Instruct');
			}
			if (env.OPENROUTER_API_KEY) {
				return openrouter()('qwen/qwen3-coder');
			}
			return null;
		},
	},
	'groq-llama': {
		label: 'Llama 3.3 70B',
		network: 'Groq',
		build: () => {
			const key = env.GROQ_API_KEY;
			if (!key) return null;
			return createOpenAI({
				apiKey: key,
				baseURL: 'https://api.groq.com/openai/v1',
			})('llama-3.3-70b-versatile');
		},
	},
};

function openrouter() {
	return createOpenAI({
		apiKey: env.OPENROUTER_API_KEY,
		baseURL: 'https://openrouter.ai/api/v1',
		headers: { 'HTTP-Referer': 'https://three.ws', 'X-Title': 'three.ws brain demo' },
	});
}

function validateMessages(input) {
	if (!Array.isArray(input)) {
		throw Object.assign(new Error('messages must be an array'), { status: 400 });
	}
	if (input.length === 0 || input.length > 60) {
		throw Object.assign(new Error('messages length out of range'), { status: 400 });
	}
	const out = [];
	for (const m of input) {
		if (!m || typeof m !== 'object') throw Object.assign(new Error('bad message'), { status: 400 });
		const role = m.role;
		const content = typeof m.content === 'string' ? m.content.slice(0, 8000) : '';
		if (!['user', 'assistant'].includes(role)) {
			throw Object.assign(new Error('role must be user|assistant'), { status: 400 });
		}
		if (!content.trim()) throw Object.assign(new Error('empty content'), { status: 400 });
		out.push({ role, content });
	}
	return out;
}

export default wrap(async function handler(req, res) {
	if (cors(req, res, { methods: 'POST,OPTIONS' })) return;
	if (method(req, res, ['POST'])) return;

	let body;
	try {
		body = await readJson(req, 200_000);
	} catch (e) {
		return error(res, e.status || 400, 'bad_request', e.message);
	}

	const providerKey = String(body.provider || 'anthropic');
	const spec = PROVIDERS[providerKey];
	if (!spec) {
		return error(res, 400, 'unknown_provider', `unknown provider: ${providerKey}`, {
			available: Object.keys(PROVIDERS),
		});
	}

	const model = spec.build();
	if (!model) {
		return error(res, 503, 'provider_not_configured',
			`${spec.network} key not configured on this deployment`);
	}

	let messages;
	try {
		messages = validateMessages(body.messages);
	} catch (e) {
		return error(res, e.status || 400, 'bad_request', e.message);
	}

	const system = typeof body.system === 'string' ? body.system.slice(0, 4000) : undefined;
	const maxTokens = Math.min(Math.max(Number(body.maxTokens) || 1024, 32), 4096);

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
	})}\n\n`);

	try {
		const result = streamText({
			model,
			system,
			messages,
			maxOutputTokens: maxTokens,
		});

		for await (const delta of result.textStream) {
			res.write(`data: ${JSON.stringify(delta)}\n\n`);
		}

		const usage = await result.usage.catch(() => null);
		const elapsedMs = Date.now() - t0;
		res.write(`event: done\ndata: ${JSON.stringify({
			elapsedMs,
			usage: usage ? {
				inputTokens: usage.inputTokens,
				outputTokens: usage.outputTokens,
				totalTokens: usage.totalTokens,
			} : null,
		})}\n\n`);
		res.write('data: [DONE]\n\n');
		res.end();
	} catch (err) {
		const elapsedMs = Date.now() - t0;
		res.write(`event: error\ndata: ${JSON.stringify({
			message: err?.message || 'upstream error',
			elapsedMs,
		})}\n\n`);
		res.end();
	}
});
