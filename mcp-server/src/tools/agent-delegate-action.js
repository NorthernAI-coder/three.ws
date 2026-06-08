// `agent_delegate_action` — paid MCP tool that lets an external agent
// send a message to any three.ws-registered agent and get its reply.
//
// Pricing: $0.01 USDC, settled `exact` in USDC on Solana mainnet.
//
// Implementation: calls POST /api/agents/talk with the target agentId
// and message. The target's brain is driven by its embed_policy.brain
// settings on three.ws (which model, system prompt). Agents whose owner
// has set surfaces.mcp = false in their embed policy are refused.
//
// Recursion is prevented server-side via the x-delegate-depth header.

import { z } from 'zod';

import { paid, toolError } from '../payments.js';
import { jsonSchemaFromZod } from './_shared.js';
import { resilientFetch } from '../lib/resilient-fetch.js';

const TOOL_NAME = 'agent_delegate_action';
const TOOL_DESCRIPTION =
	'Send a message to a three.ws-registered agent and receive its response. The target agent uses its configured brain (Claude model and system prompt set via its embed policy). Agents that have opted out of MCP delegation are refused. Useful for agent-to-agent collaboration and tool composition. Paid: $0.01 USDC.';

function env(k, def) {
	const v = process.env[k];
	return v && String(v).trim() ? String(v).trim() : def;
}

// Single source of truth: Zod shape carries descriptions + bounds; JSON Schema
// derived. The prior hand-written JSON Schema left `model` with no bounds; the
// Zod (min 1, max 100) is stricter and now wins, surfacing those bounds in the
// advertised schema too.
const inputZodShape = {
	agentId: z.string().min(1).max(120).describe('three.ws agent id (UUID).'),
	message: z.string().min(1).max(4000),
	model: z
		.string()
		.min(1)
		.max(100)
		.describe('Optional Claude model override (e.g. claude-sonnet-4-6). Must be in the allowlist.')
		.optional(),
};

const inputJsonSchema = jsonSchemaFromZod(inputZodShape);

export async function buildAgentDelegateActionTool() {
	const handler = await paid(
		{
			toolName: TOOL_NAME,
			description: TOOL_DESCRIPTION,
			scheme: 'exact',
			priceUsd: '$0.01',
			inputSchema: inputJsonSchema,
			example: {
				agentId: '5a4b3c2d-1234-5678-90ab-cdef01234567',
				message: 'Summarise the latest pump.fun graduations in 3 bullets.',
			},
			outputExample: {
				ok: true,
				agentId: '5a4b3c2d-1234-5678-90ab-cdef01234567',
				agentName: 'Pump Sage',
				response: '...',
				model: 'claude-haiku-4-5-20251001',
				durationMs: 1840,
			},
		},
		async ({ agentId, message, model }) => {
			const endpoint = env('MCP_AGENT_TALK_ENDPOINT', 'https://three.ws/api/agents/talk');
			let res;
			try {
				// Bounded timeout but NO retry: delivering a message to an agent is
				// not idempotent, so a replay could double-send / double-bill the
				// target. A long brain response is expected, so the timeout is
				// generous.
				res = await resilientFetch(
					endpoint,
					{
						method: 'POST',
						headers: { 'content-type': 'application/json' },
						body: JSON.stringify({ agentId, message, model }),
					},
					{ timeoutMs: 60_000, retries: 0, label: 'agent-delegate' },
				);
			} catch (err) {
				return toolError('upstream_unreachable', err?.message || 'fetch failed');
			}
			const data = await res.json().catch(() => null);
			if (!res.ok || !data || data.ok === false) {
				return toolError(
					data?.code || data?.error || 'agent_delegate_failed',
					data?.message || `endpoint returned ${res.status}`,
				);
			}
			return data;
		},
	);
	return {
		name: TOOL_NAME,
		title: 'Agent delegate action ($0.01)',
		description: TOOL_DESCRIPTION,
		inputSchema: inputZodShape,
		handler,
	};
}
