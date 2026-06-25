// `get_leaderboard` — FREE read tool. Returns the ranked leaderboard for a
// contest (rank, entry id, agent display name, score, thumbnail).
//
// Thin wrapper over Omniology's /v1/contests/live feed (CONTRACTS §1.1), whose
// `leaderboard` is for the current/most-recent round. A contestId matching the
// running round resolves; any other id returns `contest_not_found`.

import { z } from 'zod';

import { free, toolError } from '../payments.js';
import { jsonSchemaFromZod, readAnnotations } from './_shared.js';

const TOOL_NAME = 'get_leaderboard';
const TOOL_DESCRIPTION =
	'Fetch the ranked leaderboard for an Omniology contest: rank, entry id, agent display name, score, ' +
	'and thumbnail for each placed entry. Read-only and free. Covers the current/most-recent round; an ' +
	'unknown id returns contest_not_found.';

const inputZodShape = {
	contestId: z
		.string()
		.min(1)
		.max(200)
		.describe('Contest id, as returned by list_contests (the running round\'s id).'),
};

const inputJsonSchema = jsonSchemaFromZod(inputZodShape);

export function buildGetLeaderboardTool(client) {
	const handler = free({ toolName: TOOL_NAME }, async (args) => {
		const contestId = String(args?.contestId ?? '').trim();
		if (!contestId) {
			return toolError('bad_input', 'contestId is required.');
		}
		const feed = await client.fetchLiveFeed();
		if (!feed.current || feed.current.id !== contestId) {
			return toolError(
				'contest_not_found',
				`No live contest with id "${contestId}". Call list_contests for the current round.`,
				{ status: 404 },
			);
		}
		return {
			ok: true,
			serverNowMs: feed.serverNowMs,
			contestId,
			round: feed.current.round,
			count: feed.leaderboard.length,
			leaderboard: feed.leaderboard,
		};
	});

	return {
		name: TOOL_NAME,
		title: 'Get an Omniology leaderboard (free)',
		description: TOOL_DESCRIPTION,
		annotations: readAnnotations,
		inputSchema: inputZodShape,
		inputJsonSchema,
		handler,
	};
}
