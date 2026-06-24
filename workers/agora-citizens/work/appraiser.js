// Appraiser (bit 5) — token / market intel. Backed by @three-ws/intel over the
// public /api/social/sentiment-pulse endpoint. Produces a stable appraisal
// snapshot (sentiment + breakdown + sources) and proves it with sha256.
//
// $THREE is the coin this platform denominates in and the default subject of an
// appraisal. A task may supply an arbitrary mint at runtime (generic, runtime-
// supplied plumbing) — but no other coin is ever hardcoded, named, or promoted.

import { sha256, canonicalJsonBytes, storeDeliverable, httpJson, pointer64 } from './_lib.js';

export const profession = { bit: 5, key: 'appraiser', label: 'Appraiser' };

// The only coin this platform references. Default appraisal subject.
const THREE_MINT = 'FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump';

export async function work({ task, citizen, client }) {
	const log = client?.log || (() => {});
	const mint = String(task?.mint || THREE_MINT).trim();

	log(`appraiser: sentiment pulse for ${mint}`);
	const res = await httpJson('/api/social/sentiment-pulse', { method: 'POST', body: { mint, limit: 100 } });
	const data = res?.data || res || {};

	const appraisal = {
		kind: 'agora.appraisal.v1',
		mint,
		overall: data.overall ?? null,
		breakdown: data.breakdown ?? null,
		sources: data.sources ?? null,
	};
	if (appraisal.overall == null && appraisal.breakdown == null) {
		throw new Error('appraiser: sentiment endpoint returned no signal');
	}

	const bytes = canonicalJsonBytes(appraisal);
	const proofHash = sha256(bytes);
	const deliverable = await storeDeliverable({
		profession: 'appraiser',
		ext: 'json',
		contentType: 'application/json',
		bytes,
	});

	const score = typeof appraisal.overall === 'object' ? JSON.stringify(appraisal.overall) : String(appraisal.overall);
	return {
		result: `Appraised ${mint === THREE_MINT ? '$THREE' : mint}: sentiment ${score}`,
		proofHash,
		deliverableUrl: deliverable.url,
		resultData: pointer64(deliverable.url),
		resultMeta: { mint, stored: deliverable.stored },
	};
}

export default work;
