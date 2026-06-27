// GET/POST /api/cron/custody-attest — Verifiable Proof-of-Custody snapshot+anchor.
//
// Runs one attestation epoch: snapshots every custodial wallet's public state
// (address, live on-chain balance, custody-ledger head), builds a Merkle tree,
// persists the epoch + leaves, and commits the root on-chain as a signed SPL-Memo
// (api/_lib/custody-proof.js). Owners then verify their own inclusion proof in the
// browser against the on-chain root.
//
// Best-effort anchoring, like the other on-chain lanes: with no funded attester
// key (ATTEST_AGENT_SECRET_KEY) the epoch is still recorded with anchor_status
// 'pending'/'anchor_failed' and can be re-anchored later — the snapshot never
// 500s on a missing key.

import { error, json, method, wrapCron } from '../_lib/http.js';
import { env } from '../_lib/env.js';
import { constantTimeEquals } from '../_lib/crypto.js';
import { runAttestationEpoch } from '../_lib/custody-proof.js';

function requireCron(req, res) {
	const secret = process.env.CRON_SECRET || env.CRON_SECRET;
	if (!secret) { error(res, 503, 'not_configured', 'CRON_SECRET unset'); return false; }
	const auth = req.headers['authorization'] || '';
	const presented = auth.startsWith('Bearer ') ? auth.slice(7) : '';
	if (!constantTimeEquals(presented, secret)) { error(res, 401, 'unauthorized', 'invalid cron secret'); return false; }
	return true;
}

export default wrapCron(async (req, res) => {
	if (!method(req, res, ['GET', 'POST'])) return;
	if (!requireCron(req, res)) return;

	const result = await runAttestationEpoch({ anchor: true });
	return json(res, 200, { ok: true, ...result });
});
