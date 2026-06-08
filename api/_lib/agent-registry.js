// Metaplex Agent Registry — on-chain agent identity for our Core assets.
// ---------------------------------------------------------------------------
// Minting a Core asset (api/_lib/onchain-deploy.js) makes the NFT, but it does
// NOT enrol the agent in Metaplex's Agent Registry. Registry membership is a
// separate on-chain step: `registerIdentityV1` creates an Agent Identity PDA
// (program 1DREGFgysWYxLnRnKQnwrxnJQeSMk2HmGaC6whw2B2p) for the asset and pins an
// `agentRegistrationUri` to it. This module owns that step.
//
// Custody: the PDA is created by the asset's UPDATE AUTHORITY — which for our
// collection-bound assets is the three.ws collection authority we already hold.
// The agent's owner wallet never signs, so this registers (and back-fills) every
// authority-managed mint with no owner SOL and no owner interaction, exactly like
// the mint itself.

import bs58 from 'bs58';
import { publicKey as umiPublicKey } from '@metaplex-foundation/umi';
import {
	mplAgentIdentity,
	registerIdentityV1,
	findAgentIdentityV1Pda,
	safeFetchAgentIdentityV1FromSeeds,
	MPL_AGENT_IDENTITY_PROGRAM_ID,
} from '@metaplex-foundation/mpl-agent-registry';

export { MPL_AGENT_IDENTITY_PROGRAM_ID };

// Register the Agent Identity program on a Umi instance once. The mint Umi is
// built with mplCore() only (buildAuthorityUmi), so registry callers must layer
// this plugin in before deriving PDAs or sending the instruction.
const _patched = new WeakSet();
export function ensureAgentIdentityPlugin(umi) {
	if (!_patched.has(umi)) {
		umi.use(mplAgentIdentity());
		_patched.add(umi);
	}
	return umi;
}

/** The Agent Identity PDA for a Core asset (one identity per asset). */
export function agentIdentityPda(umi, asset) {
	ensureAgentIdentityPlugin(umi);
	return findAgentIdentityV1Pda(umi, { asset: umiPublicKey(asset) });
}

/** True if `asset` already has an Agent Identity PDA on-chain (idempotency guard). */
export async function isAgentRegistered(umi, asset) {
	ensureAgentIdentityPlugin(umi);
	const identity = await safeFetchAgentIdentityV1FromSeeds(umi, {
		asset: umiPublicKey(asset),
	});
	return identity !== null;
}

/**
 * Register an already-minted Core asset into the Metaplex Agent Registry.
 * Idempotent: if the identity PDA already exists, returns it without sending a tx.
 *
 * @param {object} p
 * @param {import('@metaplex-foundation/umi').Umi} p.umi
 * @param {import('@metaplex-foundation/umi').Signer} p.authoritySigner  asset update authority + payer
 * @param {string} p.asset                base58 Core asset address
 * @param {string} [p.collectionAddr]     collection the asset belongs to (required for collection-bound assets)
 * @param {string} p.registrationUri      resolvable URI of the registration JSON
 * @returns {Promise<{ identityPda: string, signature: string|null, alreadyRegistered: boolean }>}
 */
export async function registerAgentIdentity({ umi, authoritySigner, asset, collectionAddr, registrationUri }) {
	ensureAgentIdentityPlugin(umi);
	const assetPk = umiPublicKey(asset);
	const [identityPda] = findAgentIdentityV1Pda(umi, { asset: assetPk });

	if (await isAgentRegistered(umi, asset)) {
		return { identityPda: identityPda.toString(), signature: null, alreadyRegistered: true };
	}

	const result = await registerIdentityV1(umi, {
		asset: assetPk,
		...(collectionAddr ? { collection: umiPublicKey(collectionAddr) } : {}),
		payer: authoritySigner,
		authority: authoritySigner,
		agentRegistrationUri: registrationUri,
	}).sendAndConfirm(umi, { confirm: { commitment: 'confirmed' } });

	return {
		identityPda: identityPda.toString(),
		signature: bs58.encode(result.signature),
		alreadyRegistered: false,
	};
}
