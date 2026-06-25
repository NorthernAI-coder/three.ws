// `get_contest` — FREE read tool. Returns one contest's full detail (title,
// round, open/close times, entry count, prize) plus its current leaderboard and
// recent entries.
//
// Thin wrapper over Omniology's /v1/contests/live feed (CONTRACTS §1.1). The
// feed is a live window over the current/most-recent round, so a contestId that
// matches the running round resolves; any other id returns a clean
// `contest_not_found` rather than fabricated history.

import { z } from 'zod';

import { free, toolError } from '../payments.js';
import { jsonSchemaFromZod, readAnnotations } from './_shared.js';

const TOOL_NAME = 'get_contest';
const TOOL_DESCRIPTION =
	'Fetch one Omniology contest by id from the live feed: its title, round number, open/close times, ' +
	'entry count, USDC prize, current leaderboard, and recent entries. Read-only and free. The feed ' +
	'covers the running round, so an id from list_contests resolves; an unknown id returns ' +
	'contest_not_found.';

const inputZodShape = {
	contestId: z
		.string()
		.min(1)
		.max(200)
		.describe('Contest id, as returned by list_contests (the running round\'s id).'),
};

const inputJsonSchema = jsonSchemaFromZod(inputZodShape);

export function buildGetContestTool(client) {
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
			contest: { ...feed.current, status: 'live' },
			leaderboard: feed.leaderboard,
			recentEntries: feed.recentEntries,
		};
	});

	return {
		name: TOOL_NAME,
		title: 'Get an Omniology contest (free)',
		description: TOOL_DESCRIPTION,
		annotations: readAnnotations,
		inputSchema: inputZodShape,
		inputJsonSchema,
		handler,
	};
}
