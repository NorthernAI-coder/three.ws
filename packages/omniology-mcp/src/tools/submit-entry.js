// `submit_entry` — PAID write tool. Settles USDC on Solana (x402, exact) and
// then forwards the entry to Omniology's submit endpoint (CONTRACTS §1.2).
//
// This server is the x402 FRONT DOOR for Omniology: the caller pays this MCP in
// USDC, the payment is verified by the shared x402 resource server, and only
// then does `submitEntryCore` POST the authenticated entry to Omniology. If the
// forward fails, the handler returns a toolError envelope (`ok:false`) which the
// payment wrapper treats as a failure and CANCELS the settlement — so a caller
// is never charged for an entry Omniology rejected.

import { z } from 'zod';

import { paid, toolError } from '../payments.js';
import { jsonSchemaFromZod, writeAnnotations } from './_shared.js';
import { SUBMIT_ENTRY_PRICE_USD } from '../pricing.js';
import { OmniologyError } from '../omniology.js';

const TOOL_NAME = 'submit_entry';
const TOOL_DESCRIPTION =
	`Submit an entry to an Omniology contest. Paid: ${SUBMIT_ENTRY_PRICE_USD} USDC settled on Solana via ` +
	'x402 — the call returns a PaymentRequired challenge until a signed payment is supplied, then the ' +
	'verified entry is forwarded to Omniology and the acceptance (entry_id, status, round, position) is ' +
	'returned. `entry` is the partner-defined submission payload; `agent` is an optional display name.';

// `entry` is partner-defined (CONTRACTS §1.2) — accept any JSON object and pass
// it through untouched. We only require it to be a non-null object.
const inputZodShape = {
	contestId: z
		.string()
		.min(1)
		.max(200)
		.describe('Id of the contest to enter (from list_contests).'),
	entry: z
		.record(z.any())
		.describe('Partner-defined entry payload, forwarded verbatim to Omniology.'),
	agent: z
		.string()
		.max(200)
		.nullish()
		.describe('Optional display name to attribute the entry to.'),
};

const inputJsonSchema = jsonSchemaFromZod(inputZodShape);

/**
 * Forward a (already-paid) entry to Omniology and shape the result. Exported so
 * the forward path is unit-testable with a DI'd client, independent of the x402
 * payment wrapper.
 *
 * @param {import('../omniology.js').OmniologyClient} client
 * @param {{ contestId: string, entry: object, agent?: string|null }} args
 */
export async function submitEntryCore(client, args) {
	const contestId = String(args?.contestId ?? '').trim();
	if (!contestId) return toolError('bad_input', 'contestId is required.');
	if (!args?.entry || typeof args.entry !== 'object' || Array.isArray(args.entry)) {
		return toolError('bad_input', 'entry must be a JSON object.');
	}
	try {
		const result = await client.submitEntry(contestId, {
			entry: args.entry,
			agent: args.agent ?? null,
		});
		return { ok: true, ...result };
	} catch (err) {
		if (err instanceof OmniologyError) {
			return toolError(err.code, err.message, err.status ? { status: err.status } : undefined);
		}
		return toolError('internal_error', err?.message || String(err));
	}
}

export function buildSubmitEntryTool(client) {
	const handler = paid(
		{
			toolName: TOOL_NAME,
			description: TOOL_DESCRIPTION,
			priceUsd: SUBMIT_ENTRY_PRICE_USD,
			inputSchema: inputJsonSchema,
			example: {
				contestId: 'rnd_1421',
				entry: { prompt: 'a neon koi swimming through circuitry', model: 'three.ws/forge' },
				agent: 'Reef',
			},
			outputExample: {
				ok: true,
				entryId: 'ent_8c12e0f9',
				status: 'accepted',
				round: 1421,
				position: 38,
			},
		},
		async (args) => submitEntryCore(client, args),
	);

	return {
		name: TOOL_NAME,
		title: `Submit a contest entry (${SUBMIT_ENTRY_PRICE_USD})`,
		description: TOOL_DESCRIPTION,
		annotations: writeAnnotations,
		inputSchema: inputZodShape,
		inputJsonSchema,
		handler,
	};
}
