// GET /api/coin/:mint/cohorts
//
// Holder cohorts for one agent token — named audience slices the /go bounty
// board, coin communities, and holder worlds can target. Two shapes:
//
//   …/cohorts                       → public: cohort definitions + live counts.
//   …/cohorts?cohort=whales&…       → creator-only: paginated member export,
//                                      with optional deterministic sampling.
//
// The holder set is already public on-chain, but a turnkey, sampled wallet
// export (built for airdrop/targeting) is gated to the coin's creator so it
// can't be casually scraped for someone else's token. Definitions and counts
// stay open so any surface can render the segmentation UI.

import { sql } from '../../_lib/db.js';
import { cors, json, error, method, wrap } from '../../_lib/http.js';
import { isValidSolanaAddress } from '../../_lib/validate.js';
import { getSessionUser } from '../../_lib/auth.js';
import {
	loadCoinByMint,
	listCohorts,
	isCohortId,
	cohortCounts,
	queryCohort,
} from '../../_lib/coin/index.js';

function mintFromReq(req) {
	const m = req.query?.mint;
	if (m) return m;
	// Fallback for runtimes that don't populate req.query for nested routes.
	const path = (req.url || '').split('?')[0].replace(/\/+$/, '');
	const parts = path.split('/');
	const i = parts.lastIndexOf('coin');
	return i >= 0 && parts[i + 1] ? decodeURIComponent(parts[i + 1]) : null;
}

/** True if the session user owns this coin (creator wallet linked, or admin). */
async function ownsCoin(user, coin) {
	if (!user) return false;
	if (user.is_admin) return true;
	const creator = coin.creator_wallet;
	if (!creator) return false;
	if (user.wallet_address === creator) return true;
	const rows = await sql`
		select 1 from user_wallets
		where user_id = ${user.id} and address = ${creator}
		limit 1
	`;
	return rows.length > 0;
}

function numParam(url, key) {
	const raw = url.searchParams.get(key);
	if (raw == null) return undefined;
	const n = parseFloat(raw);
	return Number.isFinite(n) ? n : undefined;
}

export default wrap(async (req, res) => {
	if (cors(req, res)) return;
	if (!method(req, res, ['GET'])) return;

	const mint = mintFromReq(req);
	if (!mint || !isValidSolanaAddress(mint)) {
		return error(res, 400, 'bad_request', 'a valid token mint is required');
	}

	const coin = await loadCoinByMint(mint);
	if (!coin) return error(res, 404, 'not_found', 'no launch found for this mint');

	const url = new URL(req.url, 'http://localhost');
	const cohortId = url.searchParams.get('cohort');

	const params = {
		topPct: numParam(url, 'topPct'),
		minHoldDays: numParam(url, 'minHoldDays'),
		windowDays: numParam(url, 'windowDays'),
		idleDays: numParam(url, 'idleDays'),
	};

	// ── Overview: definitions + counts (public) ──────────────────────────────
	if (!cohortId) {
		const counts = await cohortCounts({ coinId: coin.id, params });
		return json(res, 200, {
			coin: { mint: coin.mint, symbol: coin.symbol, name: coin.name },
			lastSnapshotAt: coin.last_snapshot_at || null,
			cohorts: listCohorts().map((c) => ({ ...c, count: counts[c.id] ?? 0 })),
		});
	}

	// ── Member export: creator-only ──────────────────────────────────────────
	if (!isCohortId(cohortId)) {
		return error(res, 404, 'not_found', `unknown cohort: ${cohortId}`);
	}

	const user = await getSessionUser(req, res).catch(() => null);
	if (!user) return error(res, 401, 'unauthenticated', 'sign in to export cohort members');
	if (!(await ownsCoin(user, coin))) {
		return error(res, 403, 'forbidden', 'only the coin creator can export holder cohorts');
	}

	const limit = numParam(url, 'limit') ?? 200;
	const cursor = url.searchParams.get('cursor') || undefined;
	const sampleRaw = numParam(url, 'sample');
	const sample = sampleRaw != null && sampleRaw > 0 && sampleRaw < 1 ? sampleRaw : undefined;
	const salt = url.searchParams.get('salt') || undefined;

	const { members, nextCursor, sampled } = await queryCohort({
		coinId: coin.id,
		cohortId,
		params,
		limit,
		cursor,
		sample,
		salt,
	});

	return json(res, 200, {
		coin: { mint: coin.mint, symbol: coin.symbol, name: coin.name },
		cohort: cohortId,
		sampled,
		sample: sample ?? null,
		count: members.length,
		members,
		nextCursor,
		lastSnapshotAt: coin.last_snapshot_at || null,
	});
});
