#!/usr/bin/env node
/**
 * Deploy the three.ws Agent Collection (Metaplex Core) on Solana.
 * ------------------------------------------------------------------------
 * This is the one-time deploy of our "flavor" of Metaplex: a Core Collection
 * account whose update authority is the three.ws collection-authority keypair.
 * Every agent minted afterwards joins this collection and becomes
 * authority-managed (three.ws can edit its on-chain metadata on the owner's
 * behalf — see api/_lib/solana-collection.js).
 *
 * Usage:
 *   # devnet (default — safe, free)
 *   SOLANA_AGENT_COLLECTION_AUTHORITY_KEY=<bs58 secret> \
 *     node scripts/deploy-solana-agent-collection.mjs
 *
 *   # mainnet (irreversible, costs real SOL — explicit double opt-in required)
 *   SOLANA_AGENT_COLLECTION_AUTHORITY_KEY=<bs58 secret> \
 *   SOLANA_RPC_URL=<mainnet rpc with api key> \
 *   CONFIRM_MAINNET_DEPLOY=yes \
 *     node scripts/deploy-solana-agent-collection.mjs --network mainnet
 *
 * After it prints the collection address, set it in the environment:
 *   SOLANA_AGENT_COLLECTION_DEVNET=<addr>   (or _MAINNET)
 * so the live mint/edit flows start using the collection.
 *
 * Prereqs: the authority keypair must hold a little SOL on the target network
 * (collection rent + fee). On devnet you can airdrop; on mainnet fund it first.
 */

import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import {
	mplCore,
	createCollection,
	fetchCollection,
} from '@metaplex-foundation/mpl-core';
import {
	createSignerFromKeypair,
	generateSigner,
	signerIdentity,
} from '@metaplex-foundation/umi';

const PUBLIC_RPC = {
	mainnet: 'https://api.mainnet-beta.solana.com',
	devnet: 'https://api.devnet.solana.com',
};

function arg(name) {
	const i = process.argv.indexOf(name);
	return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
	const network = arg('--network') === 'mainnet' ? 'mainnet' : 'devnet';

	if (network === 'mainnet' && process.env.CONFIRM_MAINNET_DEPLOY !== 'yes') {
		console.error(
			'Refusing mainnet deploy without CONFIRM_MAINNET_DEPLOY=yes.\n' +
				'Mainnet collection creation is irreversible and costs real SOL.',
		);
		process.exit(1);
	}

	const secret = process.env.SOLANA_AGENT_COLLECTION_AUTHORITY_KEY;
	if (!secret) {
		console.error('SOLANA_AGENT_COLLECTION_AUTHORITY_KEY (bs58 secret) is required.');
		process.exit(1);
	}

	const rpc =
		network === 'devnet'
			? process.env.SOLANA_RPC_URL_DEVNET || PUBLIC_RPC.devnet
			: process.env.SOLANA_RPC_URL || PUBLIC_RPC.mainnet;

	const appOrigin = process.env.APP_ORIGIN || 'https://three.ws';
	const collectionUri = `${appOrigin}/api/agents/solana-collection-metadata?network=${network}`;

	const umi = createUmi(rpc).use(mplCore());
	const web3Authority = Keypair.fromSecretKey(bs58.decode(secret));
	const authority = createSignerFromKeypair(
		umi,
		umi.eddsa.createKeypairFromSecretKey(web3Authority.secretKey),
	);
	umi.use(signerIdentity(authority));

	const collectionSigner = generateSigner(umi);

	console.log(`Network:           ${network}`);
	console.log(`RPC:               ${rpc.replace(/api-key=[^&]+/i, 'api-key=***')}`);
	console.log(`Authority:         ${authority.publicKey}`);
	console.log(`Collection (new):  ${collectionSigner.publicKey}`);
	console.log(`Collection URI:    ${collectionUri}`);
	console.log('Creating collection…');

	await createCollection(umi, {
		collection: collectionSigner,
		name: 'three.ws Agents',
		uri: collectionUri,
		// Authority-managed Attributes on the collection itself, so the brand and
		// $THREE linkage are real on-chain bytes at the collection level too.
		plugins: [
			{
				type: 'Attributes',
				attributeList: [
					{ key: 'platform', value: 'three.ws' },
					{ key: 'url', value: appOrigin },
					{ key: 'standard', value: 'metaplex-core' },
					{ key: 'schema', value: 'agent-manifest/0.1' },
				],
			},
		],
	}).sendAndConfirm(umi, { confirm: { commitment: 'confirmed' } });

	// Verify it landed.
	const collection = await fetchCollection(umi, collectionSigner.publicKey);

	const envKey =
		network === 'devnet'
			? 'SOLANA_AGENT_COLLECTION_DEVNET'
			: 'SOLANA_AGENT_COLLECTION_MAINNET';

	console.log('\n✅ Collection deployed.');
	console.log(`   name:      ${collection.name}`);
	console.log(`   address:   ${collectionSigner.publicKey}`);
	console.log(`   authority: ${authority.publicKey}`);
	console.log('\nSet this in your environment to activate authority-managed agent mints:');
	console.log(`   ${envKey}=${collectionSigner.publicKey}`);
}

main().catch((err) => {
	console.error('\n❌ Deploy failed:', err?.message || err);
	process.exit(1);
});
