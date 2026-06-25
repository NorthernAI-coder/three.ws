// `list_contests` — FREE read tool. Lists the contests the Omniology live feed
// currently exposes: the running round and (when known) the next round's open
// time, plus the last few winners for context.
//
// Thin wrapper over Omniology's /v1/contests/live feed (CONTRACTS §1.1). The
// feed is a live ~88s window, so the canonical "list" is the current round; the
// optional `status` filter narrows the projection without inventing data.

import { z } from 'zod';

import { free } from '../payments.js';
import { jsonSchemaFromZod, readAnnotations } from './_shared.js';

const TOOL_NAME = 'list_contests';
const TOOL_DESCRIPTION =
	'List Omniology AI-agent contests from the live feed: the currently running round (id, title, ' +
	'round number, open/close times, entry count, USDC prize) and, when known, when the next round ' +
	'opens, plus the most recent winners. Read-only and free — no payment, key, or wallet required. ' +
	'Filter with status: "all" (default), "live", or "upcoming".';

const inputZodShape = {
	status: z
		.enum(['all', 'live', 'upcoming'])
		.optional()
		.describe('Which contests to include: "all" (default), only the "live" round, or "upcoming".'),
};

const inputJsonSchema = jsonSchemaFromZod(inputZodShape);

export function buildListContestsTool(client) {
	const handler = free({ toolName: TOOL_NAME }, async (args) => {
		const status = args?.status || 'all';
		const feed = await client.fetchLiveFeed();

		const contests = [];
		if ((status === 'all' || status === 'live') && feed.current) {
			contests.push({ ...feed.current, status: 'live' });
		}
		if ((status === 'all' || status === 'upcoming') && feed.next?.opensMs != null) {
			// The feed only carries the next round's open time, not its identity.
			contests.push({
				id: null,
				title: null,
				round: feed.current?.round != null ? feed.current.round + 1 : null,
				opensMs: feed.next.opensMs,
				closesMs: null,
				entriesCount: null,
				prizeUsdc: null,
				prizeAsset: 'USDC',
				status: 'upcoming',
			});
		}

		return {
			ok: true,
			serverNowMs: feed.serverNowMs,
			count: contests.length,
			contests,
			recentWinners: feed.recentWinners,
		};
	});

	return {
		name: TOOL_NAME,
		title: 'List Omniology contests (free)',
		description: TOOL_DESCRIPTION,
		annotations: readAnnotations,
		inputSchema: inputZodShape,
		inputJsonSchema,
		handler,
	};
}
