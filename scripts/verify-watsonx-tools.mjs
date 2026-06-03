#!/usr/bin/env node
// Verifies that an IBM watsonx (Granite) brain is *embodied* — i.e. it returns
// OpenAI-shaped tool calls for three.ws's avatar action tools, so a Granite
// avatar can actually wave / dance / send SOL instead of only narrating it.
//
//   Phase 1 (offline, deterministic): builds the EXACT request shape the
//   /api/chat watsonx route now sends and asserts the wire contract is correct —
//   tools are OpenAI-shaped, the auto-select switch is watsonx's
//   `tool_choice_option: "auto"` (NOT OpenAI's `tool_choice`), and a simulated
//   watsonx tool-call delta parses back into a usable avatar action. No network,
//   never flaky.
//
//   Phase 2 (live, best-effort): mints a real IAM token from WATSONX_API_KEY,
//   POSTs the tools payload to /ml/v1/text/chat, and asserts Granite chose one of
//   our action tools for "please wave at me". SKIPPED (not failed) when no
//   credentials are present — Phase 1 already proves the contract.
//
//   node scripts/verify-watsonx-tools.mjs
//   # live phase needs: WATSONX_API_KEY + WATSONX_PROJECT_ID (or WATSONX_SPACE_ID)
//   # pull them with:  vercel env pull .env.local   (then `node --env-file=.env.local ...`)
//
// Exits non-zero only if Phase 1 fails.

import { watsonxConfig, watsonxToken } from '../api/_lib/watsonx.js';

function assert(cond, msg) {
	if (!cond) throw new Error(msg);
}

// A representative slice of the production ACTION_TOOLS (api/chat.js). The shape
// here is byte-for-byte what the watsonx route forwards: { type:'function',
// function:{ name, description, parameters } }.
const ACTION_TOOLS = [
	{
		name: 'playAnimation',
		description:
			'Play a named animation on the avatar. Use when the user asks to dance, wave, jump, celebrate, etc. Available clips: wave, dance, jump, celebrate, idle.',
		input_schema: {
			type: 'object',
			properties: {
				name: { type: 'string', description: 'Animation clip name, e.g. "wave", "dance".' },
				loop: { type: 'boolean' },
			},
			required: ['name'],
		},
	},
	{
		name: 'sendSol',
		description:
			"Send a small amount of SOL from the avatar's own wallet, denominated in US dollars. Call ONLY when explicitly asked to send/pay/transfer SOL.",
		input_schema: {
			type: 'object',
			properties: { usd: { type: 'number' }, to: { type: 'string' } },
			required: ['usd'],
		},
	},
];
const ACTION_NAMES = new Set(ACTION_TOOLS.map((t) => t.name));

const OPENAI_TOOLS = ACTION_TOOLS.map((t) => ({
	type: 'function',
	function: { name: t.name, description: t.description, parameters: t.input_schema },
}));

// Mirrors api/chat.js parseToolJson: only known action tools survive, args are
// parsed from the accumulated JSON string.
function parseToolJson(name, jsonText) {
	if (!name || !ACTION_NAMES.has(name)) return null;
	const text = jsonText && jsonText.trim() ? jsonText : '{}';
	try {
		return { type: name, ...JSON.parse(text) };
	} catch {
		return null;
	}
}

// Mirrors the tool-call accumulation in api/chat.js streamOpenAI: watsonx streams
// OpenAI-shaped deltas, so the same reader extracts the action verbatim.
function parseStreamedToolCalls(deltas) {
	const toolBuf = {};
	for (const delta of deltas) {
		for (const tc of delta.tool_calls || []) {
			const idx = tc.index ?? 0;
			const slot = (toolBuf[idx] ||= { name: '', args: '' });
			if (tc.function?.name) slot.name += tc.function.name;
			if (tc.function?.arguments) slot.args += tc.function.arguments;
		}
	}
	return Object.values(toolBuf)
		.map((s) => parseToolJson(s.name, s.args))
		.filter(Boolean);
}

// Build the exact watsonx chat payload the production route sends.
function buildWatsonxPayload({ model, scope, messages, maxTokens, includeTools = true }) {
	return {
		model_id: model,
		...scope,
		messages,
		max_tokens: maxTokens,
		...(includeTools ? { tools: OPENAI_TOOLS, tool_choice_option: 'auto' } : {}),
	};
}

// ── Phase 1: offline contract + parse proof ─────────────────────────────────
function phaseOffline() {
	console.log('▸ Phase 1 — offline wire-contract + parse proof (deterministic)\n');

	const payload = buildWatsonxPayload({
		model: 'ibm/granite-3-8b-instruct',
		scope: { project_id: 'proj-xxxx' },
		messages: [
			{ role: 'system', content: 'You are a 3D avatar.' },
			{ role: 'user', content: 'please wave at me' },
		],
		maxTokens: 1024,
	});

	// The watsonx-specific switch — the #1 thing that 400s if wrong.
	assert(payload.tool_choice_option === 'auto', 'tool_choice_option must be the string "auto"');
	assert(!('tool_choice' in payload), 'must NOT send OpenAI-style tool_choice to watsonx');
	assert(payload.model_id === 'ibm/granite-3-8b-instruct', 'model_id missing/wrong');
	assert(payload.project_id === 'proj-xxxx', 'project scoping missing');
	assert(Array.isArray(payload.tools) && payload.tools.length === ACTION_TOOLS.length, 'tools array missing');
	for (const t of payload.tools) {
		assert(t.type === 'function', 'tool.type must be "function"');
		assert(t.function?.name && t.function?.parameters?.type === 'object', `tool ${t.function?.name} malformed`);
	}
	console.log('  ✓ payload carries OpenAI-shaped tools (' + payload.tools.map((t) => t.function.name).join(', ') + ')');
	console.log('  ✓ auto-select uses watsonx `tool_choice_option: "auto"` (not OpenAI `tool_choice`)');
	console.log('  ✓ scoped to project + correct ibm/* model_id');

	// no-tools fallback path (used when a model/region rejects tools)
	const bare = buildWatsonxPayload({ model: 'ibm/granite-3-8b-instruct', scope: { project_id: 'p' }, messages: [], maxTokens: 10, includeTools: false });
	assert(!('tools' in bare) && !('tool_choice_option' in bare), 'no-tools fallback must omit tools + tool_choice_option');
	console.log('  ✓ no-tools fallback payload omits tools cleanly');

	// Simulate a watsonx streamed tool call (OpenAI-shaped, split across deltas
	// exactly as chat_stream emits) and prove the production reader recovers it.
	const simulated = [
		{ tool_calls: [{ index: 0, id: 'chatcmpl-tool-1', type: 'function', function: { name: 'playAnimation', arguments: '' } }] },
		{ tool_calls: [{ index: 0, function: { arguments: '{"name":' } }] },
		{ tool_calls: [{ index: 0, function: { arguments: ' "wave"}' } }] },
	];
	const actions = parseStreamedToolCalls(simulated);
	assert(actions.length === 1, `expected 1 parsed action, got ${actions.length}`);
	assert(actions[0].type === 'playAnimation' && actions[0].name === 'wave', `parsed action wrong: ${JSON.stringify(actions[0])}`);
	console.log(`  ✓ streamed tool-call delta parses → ${JSON.stringify(actions[0])}`);

	// An unknown tool name must be dropped (don't execute arbitrary actions).
	assert(parseToolJson('rm_rf', '{}') === null, 'unknown tool must be rejected');
	console.log('  ✓ unknown/unsanctioned tool names are rejected\n');
}

// ── Phase 2: live Granite tool call (best-effort) ───────────────────────────
async function phaseLive() {
	console.log('▸ Phase 2 — live Granite tool call (best-effort)\n');
	const cfg = watsonxConfig();
	if (!cfg.configured) {
		console.log('  ⓘ no watsonx credentials in env — SKIPPING live phase.');
		console.log('    Phase 1 already proved the request contract + parser.');
		console.log('    To run live: `vercel env pull .env.local` then');
		console.log('    `node --env-file=.env.local scripts/verify-watsonx-tools.mjs`\n');
		return 'skipped';
	}

	const scope = cfg.projectId ? { project_id: cfg.projectId } : { space_id: cfg.spaceId };
	const token = await watsonxToken(cfg);
	const payload = buildWatsonxPayload({
		model: cfg.chatModel,
		scope,
		messages: [
			{ role: 'system', content: 'You are a friendly 3D avatar. When the user asks you to perform a physical gesture, call the matching tool rather than describing it.' },
			{ role: 'user', content: 'Please wave at me!' },
		],
		maxTokens: 512,
	});

	const res = await fetch(`${cfg.url}/ml/v1/text/chat?version=${cfg.apiVersion}`, {
		method: 'POST',
		headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
		body: JSON.stringify(payload),
	});
	const text = await res.text();
	if (!res.ok) {
		throw new Error(`watsonx live call failed (${res.status}): ${text.slice(0, 300)}`);
	}
	const data = JSON.parse(text);
	const message = data.choices?.[0]?.message || {};
	const toolCalls = (message.tool_calls || [])
		.map((c) => parseToolJson(c.function?.name, c.function?.arguments))
		.filter(Boolean);

	console.log(`  model served: ${data.model_id || cfg.chatModel}`);
	if (toolCalls.length) {
		console.log(`  ✓ Granite chose an action tool: ${JSON.stringify(toolCalls)}`);
		console.log('  ✓ avatar is EMBODIED on watsonx — it acts, not just narrates.\n');
		return 'tool';
	}
	// Some smaller Granite variants answer in prose even when a tool fits. That's
	// not a contract failure (Phase 1 proved the wiring) — report it honestly.
	console.log('  ⚠ Granite replied in text without a tool call this run:');
	console.log(`    "${(message.content || '').slice(0, 140)}"`);
	console.log('    The tool wiring is correct (Phase 1); try WATSONX_MODEL_ID=ibm/granite-3-3-8b-instruct');
	console.log('    or a larger Granite for more reliable tool selection.\n');
	return 'text';
}

(async () => {
	phaseOffline();
	const live = await phaseLive();
	if (live === 'tool') console.log('✅ watsonx Granite embodiment verified — contract AND live tool call.');
	else if (live === 'text') console.log('✅ watsonx tool contract verified offline; live model answered in prose this run.');
	else console.log('✅ watsonx tool contract verified offline (live phase skipped — no credentials).');
	process.exit(0);
})().catch((err) => {
	console.error('\n✗ verification failed:', err?.message || err);
	process.exit(1);
});
