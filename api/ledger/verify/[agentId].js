// GET /api/ledger/verify/:agentId — independently re-verify an agent's reasoning
// ledger. Public. This is the whole point of the feature: anyone can prove the
// history wasn't backdated or quietly edited.
//
// It recomputes the per-agent hash chain from each entry's committed contents
// (trusting NO stored hash), checks every link, then checks the recomputed head
// against the latest ON-CHAIN anchor. A tampered entry breaks its own hash and the
// next entry's prev_hash link; a full rewrite changes the head, which no longer
// matches the anchored commitment — so either way the alteration is detectable and
// pinpointed.
//
// status:
//   empty                — no decisions recorded yet
//   verified             — chain intact AND head matches the on-chain anchor
//   verified_unanchored  — chain intact, no on-chain anchor yet (commitment pending)
//   verification_failed  — a tamper / inconsistency was detected (see `chain` / `anchor`)

import { json, method, wrap, error } from '../../_lib/http.js';
import { getChainEntries, verifyChain } from '../../_lib/reasoning-ledger.js';
import { latestAnchoredAnchor } from '../../_lib/ledger-anchor.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function paramAgentId(req) {
	if (req.query?.agentId) return String(req.query.agentId);
	const m = String(req.url || '').match(/\/api\/ledger\/verify\/([^/?]+)/);
	return m ? decodeURIComponent(m[1]) : null;
}

function solscanUrl(sig, network) {
	if (!sig) return null;
	return network === 'devnet' ? `https://solscan.io/tx/${sig}?cluster=devnet` : `https://solscan.io/tx/${sig}`;
}

export default wrap(async (req, res) => {
	if (!method(req, res, ['GET'])) return;
	const agentId = paramAgentId(req);
	if (!agentId || !UUID_RE.test(agentId)) {
		return error(res, 400, 'bad_request', 'a valid agent id is required');
	}

	const entries = await getChainEntries(agentId);
	const checkedAt = new Date().toISOString();

	if (!entries.length) {
		return json(res, 200, {
			agent_id: agentId,
			status: 'empty',
			chain: { ok: true, count: 0, head_hash: null, computed_head: null, broken_at: null, reason: null },
			anchor: null,
			checked_at: checkedAt,
		}, { 'cache-control': 'no-store' });
	}

	const chain = await verifyChain(agentId, entries);
	const anchorRow = await latestAnchoredAnchor(agentId).catch(() => null);

	let status;
	let anchor = null;
	if (!chain.ok) {
		status = 'verification_failed';
	} else if (anchorRow) {
		// The anchored head must equal the recomputed entry_hash at its seq.
		const atSeq = entries.find((e) => Number(e.seq) === Number(anchorRow.through_seq));
		const matches = !!atSeq && String(atSeq.entry_hash) === String(anchorRow.head_hash);
		status = matches ? 'verified' : 'verification_failed';
		anchor = {
			status: anchorRow.status,
			signature: anchorRow.signature,
			head_hash: anchorRow.head_hash,
			through_seq: Number(anchorRow.through_seq),
			entry_count: Number(anchorRow.entry_count),
			anchored_at: anchorRow.anchored_at,
			network: anchorRow.network,
			explorer_url: solscanUrl(anchorRow.signature, anchorRow.network),
			matches_chain: matches,
		};
	} else {
		status = 'verified_unanchored';
	}

	return json(res, 200, {
		agent_id: agentId,
		status,
		chain,
		anchor,
		checked_at: checkedAt,
	}, { 'cache-control': 'no-store' });
});
