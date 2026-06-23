// GET /api/ledger/:agentId — the Reasoning Ledger timeline + explainable
// reputation for one agent. Public read (a track record is meant to be audited).
//
// Query: ?limit=50&before=<seq>&kind=snipe&q=<text>&network=mainnet
//
// Returns the headline reputation (with its full formula + per-component
// breakdown + calibration curve), the latest on-chain anchor summary, and a
// paginated, filterable decision timeline where each entry carries its reasoning,
// prediction, and — once reconciled — the real outcome (right/wrong, by how much).

import { json, method, wrap, error } from '../_lib/http.js';
import { sql } from '../_lib/db.js';
import {
	getDecisionsWithOutcomes,
	getReputationRecords,
	computeReputation,
} from '../_lib/reasoning-ledger.js';
import { latestAnchor } from '../_lib/ledger-anchor.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function paramAgentId(req) {
	if (req.query?.agentId) return String(req.query.agentId);
	const m = String(req.url || '').match(/\/api\/ledger\/([^/?]+)/);
	return m ? decodeURIComponent(m[1]) : null;
}

function solscanUrl(sig, network) {
	if (!sig) return null;
	return network === 'devnet' ? `https://solscan.io/tx/${sig}?cluster=devnet` : `https://solscan.io/tx/${sig}`;
}

function shapeDecision(d) {
	const reconciled = d.outcome_status != null && d.was_correct != null;
	return {
		id: d.id,
		seq: Number(d.seq),
		kind: d.kind,
		subject_ref: d.subject_ref,
		action_ref: d.action_ref,
		inputs: d.inputs || {},
		rationale: d.rationale,
		prediction: d.prediction || {},
		confidence: d.confidence != null ? Number(d.confidence) : null,
		network: d.network,
		decided_at: d.decided_at,
		entry_hash: d.entry_hash,
		outcome: reconciled
			? {
					status: 'reconciled',
					was_correct: d.was_correct,
					pnl_sol: d.pnl_sol != null ? Number(d.pnl_sol) : null,
					impact: d.impact != null ? Number(d.impact) : null,
					observed: d.observed || {},
					reconciled_at: d.reconciled_at,
					proof_url: solscanUrl(d.observed?.sell_sig, d.network),
				}
			: { status: 'pending' },
	};
}

export default wrap(async (req, res) => {
	if (!method(req, res, ['GET'])) return;
	const agentId = paramAgentId(req);
	if (!agentId || !UUID_RE.test(agentId)) {
		return error(res, 400, 'bad_request', 'a valid agent id is required');
	}

	const url = new URL(req.url, 'http://localhost');
	const limit = Number(url.searchParams.get('limit')) || 50;
	const before = url.searchParams.get('before');
	const kind = url.searchParams.get('kind');
	const q = url.searchParams.get('q');

	const [identity, repRecords, decisions, anchor] = await Promise.all([
		sql`select id, name, profile_image_url, avatar_url, is_public from agent_identities where id = ${agentId} limit 1`
			.then((r) => r[0] || null)
			.catch(() => null),
		getReputationRecords(agentId),
		getDecisionsWithOutcomes(agentId, {
			limit,
			beforeSeq: before ? Number(before) : null,
			kind: kind || null,
			q: q || null,
		}),
		latestAnchor(agentId).catch(() => null),
	]);

	const reputation = computeReputation(repRecords);
	const shaped = decisions.map(shapeDecision);
	const nextBeforeSeq = shaped.length ? shaped[shaped.length - 1].seq : null;

	return json(res, 200, {
		agent: identity
			? { id: identity.id, name: identity.name, image: identity.profile_image_url || identity.avatar_url || null }
			: { id: agentId, name: null, image: null },
		reputation,
		anchor: anchor
			? {
					status: anchor.status,
					signature: anchor.signature,
					head_hash: anchor.head_hash,
					through_seq: Number(anchor.through_seq),
					entry_count: Number(anchor.entry_count),
					anchored_at: anchor.anchored_at,
					network: anchor.network,
					explorer_url: solscanUrl(anchor.signature, anchor.network),
					detail: anchor.detail || null,
				}
			: null,
		decisions: shaped,
		paging: { next_before_seq: shaped.length >= limit ? nextBeforeSeq : null },
		filters: { kind: kind || null, q: q || null },
	}, { 'cache-control': 'public, s-maxage=15, stale-while-revalidate=60' });
});
