/**
 * Metaplex Agent collection test run (no DB).
 * ---------------------------------------------------------------------------
 * Proves the production on-chain path end-to-end against mainnet:
 *   1. Deploy the "three.ws Agents" Core *collection* (so members group on
 *      Magic Eden — the gap the bare canaries hit).
 *   2. Mint N agents INTO the collection, each with the full plugin set:
 *      Attributes, Royalties, VerifiedCreators (authority-verified),
 *      ImmutableMetadata.
 *   3. Register each in the Metaplex Agent Registry pointing at the EIP-8004
 *      registration doc (active:true / x402Support:true / image) so the agent
 *      page renders Active + x402 Supported, not the canary's inactive state.
 *
 * Custody for the test: owner == the funding authority, so one key owns the
 * asset AND (via Core Execute) controls the asset-signer wallet — the "control
 * both under one" model. Production instead owns each asset with its own
 * custodial wallet; same control model, different key holder.
 *
 * Secrets are read from /tmp (never the repo): /tmp/funder.b58, /tmp/helius_rpc.txt.
 * Dry-run by default; pass --go to broadcast. --count=N (default 2).
 */

import fs from 'fs';
import {
	createUmi,
} from '@metaplex-foundation/umi-bundle-defaults';
import {
	generateSigner,
	publicKey as pk,
	createSignerFromKeypair,
	signerIdentity,
	sol,
} from '@metaplex-foundation/umi';
import {
	mplCore,
	create,
	createCollection,
	fetchCollection,
	ruleSet,
	findAssetSignerPda,
} from '@metaplex-foundation/mpl-core';
import {
	mplAgentIdentity,
	registerIdentityV1,
	findAgentIdentityV1Pda,
} from '@metaplex-foundation/mpl-agent-registry';
import { Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';
import bs58 from 'bs58';

const GO = process.argv.includes('--go');
const COUNT = Number((process.argv.find((a) => a.startsWith('--count=')) || '').split('=')[1] || 2);
const REUSE_COLLECTION = (process.argv.find((a) => a.startsWith('--collection=')) || '').split('=')[1] || null;

const REGISTRATION_URI = 'https://three.ws/.well-known/agent-registration.json';
const COLLECTION_URI = 'https://three.ws/api/agents/solana-collection-metadata?network=mainnet';
const ROYALTY_BPS = 500;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function readSecret() {
	const raw = fs.readFileSync('/tmp/funder.b58', 'utf8').trim();
	return Keypair.fromSecretKey(bs58.decode(raw));
}

function buildUmi(rpc, kp) {
	const umi = createUmi(rpc).use(mplCore()).use(mplAgentIdentity());
	const signer = createSignerFromKeypair(umi, umi.eddsa.createKeypairFromSecretKey(kp.secretKey));
	umi.use(signerIdentity(signer));
	return { umi, signer };
}

function brandAttributes(name) {
	return [
		{ key: 'platform', value: 'three.ws' },
		{ key: 'url', value: 'https://three.ws' },
		{ key: 'agent', value: name },
		{ key: 'x', value: 'https://x.com/trythreews' },
		{ key: 'github', value: 'https://github.com/nirholas/three.ws' },
		{ key: '$THREE', value: 'FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump' },
		{ key: 'standard', value: 'metaplex-core' },
		{ key: 'schema', value: 'agent-manifest/0.1' },
	];
}

async function confirmWithRetry(umi, label, builder) {
	for (let i = 0; ; i++) {
		try {
			return await builder().sendAndConfirm(umi, { confirm: { commitment: 'confirmed' } });
		} catch (err) {
			const racey = /Invalid Core Asset|custom program error: 0x4|was not confirmed|blockhash/i.test(err?.message || '');
			if (!racey || i >= 5) throw err;
			console.log(`   …retry ${label} (${err.message.slice(0, 60)})`);
			await sleep(2500);
		}
	}
}

async function main() {
	const rpc = fs.readFileSync('/tmp/helius_rpc.txt', 'utf8').trim();
	const kp = readSecret();
	const { umi, signer } = buildUmi(rpc, kp);
	const authority = signer.publicKey.toString();

	const bal = await umi.rpc.getBalance(signer.publicKey);
	const balSol = Number(bal.basisPoints) / LAMPORTS_PER_SOL;
	const est = 0.005 + COUNT * (0.004 + 0.003) + 0.005;

	console.log('── Metaplex Agent collection test ──');
	console.log('mode:        ', GO ? 'LIVE (broadcasting)' : 'DRY RUN (no broadcast)');
	console.log('authority:   ', authority);
	console.log('balance:     ', balSol.toFixed(6), 'SOL');
	console.log('agents:      ', COUNT);
	console.log('est. cost:   ', est.toFixed(4), 'SOL (collection + mints + registrations + fees)');
	console.log('reg URI:     ', REGISTRATION_URI);

	if (balSol < est) {
		console.log(`\n✗ insufficient balance — need ~${est.toFixed(4)} SOL, fund ${authority}`);
		process.exit(1);
	}
	if (!GO) {
		console.log('\nDry run OK. Re-run with --go to broadcast.');
		return;
	}

	// 1. Collection — reuse an existing one (resume) or deploy a fresh one.
	let collectionAddr;
	if (REUSE_COLLECTION) {
		collectionAddr = REUSE_COLLECTION;
		console.log('\n[1/3] reusing existing collection:', collectionAddr);
	} else {
		console.log('\n[1/3] deploying collection "three.ws Agents" …');
		const collectionSigner = generateSigner(umi);
		await confirmWithRetry(umi, 'createCollection', () =>
			createCollection(umi, {
				collection: collectionSigner,
				name: 'three.ws Agents',
				uri: COLLECTION_URI,
				plugins: [{ type: 'Attributes', attributeList: brandAttributes('three.ws Agents') }],
			}),
		);
		collectionAddr = collectionSigner.publicKey.toString();
		console.log('      collection:', collectionAddr);
	}
	const collectionPk = pk(collectionAddr);
	// Fetch the on-chain CollectionV1 (needed to bind asset → collection), with
	// retries for post-deploy propagation.
	let collectionAsset;
	for (let i = 0; ; i++) {
		try {
			collectionAsset = await fetchCollection(umi, collectionPk);
			break;
		} catch (err) {
			if (i >= 6) throw err;
			console.log('   …waiting for collection to propagate');
			await sleep(3000);
		}
	}

	// 2 + 3. Mint each agent into the collection, then register it.
	const results = [];
	for (let i = 1; i <= COUNT; i++) {
		const name = `three.ws Agent ${String(i).padStart(2, '0')}`;
		console.log(`\n[2/3] minting "${name}" into collection …`);
		const assetSigner = generateSigner(umi);
		await confirmWithRetry(umi, 'create', () =>
			create(umi, {
				asset: assetSigner,
				collection: collectionAsset,
				authority: signer,
				owner: signer.publicKey,
				name,
				uri: REGISTRATION_URI,
				plugins: [
					{ type: 'Attributes', attributeList: brandAttributes(name) },
					{
						type: 'Royalties',
						basisPoints: ROYALTY_BPS,
						creators: [{ address: signer.publicKey, percentage: 100 }],
						ruleSet: ruleSet('None'),
					},
					{ type: 'VerifiedCreators', signatures: [{ address: signer.publicKey, verified: true }] },
					{ type: 'ImmutableMetadata' },
				],
			}),
		);
		const asset = assetSigner.publicKey.toString();
		const [walletPda] = findAssetSignerPda(umi, { asset: assetSigner.publicKey });
		console.log(`      asset:  ${asset}`);
		console.log(`      wallet: ${walletPda.toString()}`);

		console.log(`[3/3] registering "${name}" in Agent Registry …`);
		await sleep(2500);
		await confirmWithRetry(umi, 'registerIdentityV1', () =>
			registerIdentityV1(umi, {
				asset: assetSigner.publicKey,
				collection: collectionPk,
				payer: signer,
				authority: signer,
				agentRegistrationUri: REGISTRATION_URI,
			}),
		);
		const [identityPda] = findAgentIdentityV1Pda(umi, { asset: assetSigner.publicKey });
		console.log(`      identity PDA: ${identityPda.toString()}`);
		results.push({ name, asset, wallet: walletPda.toString(), identityPda: identityPda.toString() });
	}

	console.log('\n── done ──');
	console.log('collection:', collectionAddr);
	console.log(`Magic Eden: https://magiceden.io/marketplace/${collectionAddr}`);
	for (const r of results) {
		console.log(`\n${r.name}`);
		console.log(`  asset:    ${r.asset}`);
		console.log(`  wallet:   ${r.wallet}`);
		console.log(`  identity: ${r.identityPda}`);
		console.log(`  agent pg: https://www.metaplex.com/agents/${r.asset}`);
		console.log(`  explorer: https://solscan.io/account/${r.asset}`);
	}
	const after = await umi.rpc.getBalance(signer.publicKey);
	console.log('\nspent:', (balSol - Number(after.basisPoints) / LAMPORTS_PER_SOL).toFixed(5), 'SOL');
}

main().catch((e) => {
	console.error('\n✗ failed:', e?.message || e);
	process.exit(1);
});
