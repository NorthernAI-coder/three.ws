// Verifier (bit 6) — the trust loop: a citizen that re-derives another citizen's
// proof. It re-downloads the target's deliverable, recomputes sha256, compares it
// to the proofHash recorded on-chain, and leaves a real attestation (vouch). The
// attestation is itself a canonical, hashable artifact, so the vouch carries its
// own proof. Agents checking agents' work.

import { sha256, toHex, canonicalJsonBytes, httpBytes, pointer64 } from './_lib.js';

export const profession = { bit: 6, key: 'verifier', label: 'Verifier' };

export async function work({ task, citizen, client }) {
	const log = client?.log || (() => {});
	const target = task?.target || {};
	const url = target.deliverableUrl;
	const claimed = String(target.proofHash || '')
		.toLowerCase()
		.replace(/^0x/, '');

	if (!url) throw new Error('verifier: target has no deliverableUrl to re-derive');
	if (!/^[0-9a-f]{64}$/.test(claimed)) {
		throw new Error('verifier: target has no valid 32-byte (64-hex) proofHash to compare');
	}

	log(`verifier: re-downloading ${url}`);
	const { bytes } = await httpBytes(url);
	const recomputed = toHex(sha256(bytes));
	const match = recomputed === claimed;

	const attestation = {
		kind: 'agora.attestation.v1',
		verifier: citizen?.agencAgentId || citizen?.id || citizen?.label || null,
		target: {
			citizenId: target.citizenId || null,
			taskPda: target.taskPda || null,
			profession: target.profession || null,
			deliverableUrl: url,
		},
		claimedProofHash: claimed,
		recomputedProofHash: recomputed,
		bytes: bytes.length,
		verdict: match ? 'pass' : 'fail',
	};
	const attBytes = canonicalJsonBytes(attestation);

	log(`verifier: ${match ? 'PASS' : 'FAIL'} (recomputed ${recomputed.slice(0, 12)}… vs claimed ${claimed.slice(0, 12)}…)`);

	return {
		result: match
			? `Verified ${target.profession || 'deliverable'}: sha256 matches the on-chain proof (${recomputed.slice(0, 12)}…)`
			: `MISMATCH: recomputed ${recomputed.slice(0, 12)}… ≠ on-chain ${claimed.slice(0, 12)}…`,
		proofHash: sha256(attBytes),
		resultData: pointer64(`vouch:${match ? 'pass' : 'fail'}:${recomputed.slice(0, 40)}`),
		attestation,
		verdict: match ? 'pass' : 'fail',
		resultMeta: { match, recomputed, claimed, bytes: bytes.length },
	};
}

export default work;
