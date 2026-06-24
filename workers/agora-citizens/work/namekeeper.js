// Namekeeper (bit 7) — resolves on-chain names. Backed by @three-ws/names over
// the public /api/sns (Solana) and /api/agents/ens (Ethereum) endpoints. The
// deliverable is the canonical resolution record; the proof is sha256 of it.
//
// Scope: this module ships the RESOLVE capability (a real read producing a real,
// hashable artifact). Minting `*.threews.sol` needs an authenticated, staked
// signer and is deferred to a later task (noted in docs/agora.md) — not stubbed.

import { sha256, canonicalJsonBytes, storeDeliverable, httpJson, pointer64, taskPrompt } from './_lib.js';

export const profession = { bit: 7, key: 'namekeeper', label: 'Namekeeper' };

export async function work({ task, citizen, client }) {
	const log = client?.log || (() => {});
	const name = String(task?.name || taskPrompt(task)).trim();
	if (!name) throw new Error('namekeeper: task carries no name to resolve');

	const isEns = /\.eth$/i.test(name);
	log(`namekeeper: resolving ${name} (${isEns ? 'ENS' : 'SNS'})`);

	const res = isEns
		? await httpJson(`/api/agents/ens/${encodeURIComponent(name.toLowerCase())}`)
		: await httpJson('/api/sns', { query: { name } });
	const data = res?.data || res || {};
	const address = data.address ?? data.owner ?? data.resolvedAddress ?? null;

	const record = {
		kind: 'agora.nameresolve.v1',
		name,
		network: isEns ? 'ethereum' : 'solana',
		address,
		resolved: Boolean(address),
	};
	const bytes = canonicalJsonBytes(record);
	const proofHash = sha256(bytes);
	const deliverable = await storeDeliverable({
		profession: 'namekeeper',
		ext: 'json',
		contentType: 'application/json',
		bytes,
	});

	return {
		result: record.resolved ? `Resolved ${name} → ${address}` : `Resolved ${name}: no owner on record`,
		proofHash,
		deliverableUrl: deliverable.url,
		resultData: pointer64(deliverable.url),
		resultMeta: { resolved: record.resolved, address, network: record.network, stored: deliverable.stored },
	};
}

export default work;
