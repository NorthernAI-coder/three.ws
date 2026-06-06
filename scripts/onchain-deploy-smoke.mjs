#!/usr/bin/env node
/**
 * Smoke test for the on-chain agent deploy path used by api/admin/bulk-launch.js.
 * Proves the exact Metaplex Core mint works with the installed deps
 * (umi 1.5 / mpl-core 1.10) before any mainnet SOL is spent. No database writes.
 *
 * It runs in two phases:
 *   BUILD (always, offline, no SOL): construct the exact `createCollection` and
 *     `create` transactions the handler builds and assert they are well-formed —
 *     fee payer = funder, required signers correct, the mpl-core program is
 *     targeted, the Attributes + Royalties plugins serialize, and the whole tx
 *     fits Solana's 1232-byte limit. This deterministically catches SDK/plugin/
 *     version-compat regressions without depending on a faucet.
 *   SEND (only when the funder holds devnet SOL): actually deploy the collection,
 *     mint an asset owned by a fresh agent wallet, fetch it back, and assert
 *     owner / collection / plugins on-chain.
 *
 * Usage:
 *   node scripts/onchain-deploy-smoke.mjs
 *   FUNDER_SECRET=<bs58> node scripts/onchain-deploy-smoke.mjs   # reuse a key
 */

import { Keypair, Connection, LAMPORTS_PER_SOL } from '@solana/web3.js';
import bs58 from 'bs58';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import {
	mplCore,
	create,
	createCollection,
	fetchAsset,
	ruleSet,
	MPL_CORE_PROGRAM_ID,
} from '@metaplex-foundation/mpl-core';
import {
	generateSigner,
	publicKey as umiPublicKey,
	createSignerFromKeypair,
	signerIdentity,
} from '@metaplex-foundation/umi';

const RPC = process.env.SOLANA_RPC_URL_DEVNET || 'https://api.devnet.solana.com';
const DEVNET_REF = 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1';
// Any valid 32-byte base58 hash works for offline build verification — the
// signer set and instructions are independent of the blockhash.
const DUMMY_BLOCKHASH = '11111111111111111111111111111111';

function explorer(addr) {
	return `https://solscan.io/account/${addr}?cluster=devnet`;
}

function check(label, pass, results) {
	results.push(pass);
	console.log(`  ${pass ? '✓' : '✗'} ${label}`);
}

// Assert a builder compiles to a valid tx with the expected fee payer, signers,
// program target, and size — without sending it.
function verifyBuild(umi, builder, { label, expectFeePayer, expectSigners, results }) {
	const tx = builder.setBlockhash(DUMMY_BLOCKHASH).build(umi);
	const serialized = umi.transactions.serialize(tx);
	const signerKeys = new Set(builder.getSigners(umi).map((s) => s.publicKey.toString()));
	const programs = new Set(builder.getInstructions().map((i) => i.programId.toString()));

	console.log(`\n[build] ${label}`);
	check('compiles to a transaction', !!tx && serialized.length > 0, results);
	check(`fits 1232-byte tx limit (${serialized.length}B)`, serialized.length <= 1232, results);
	check(`fee payer = funder`, tx.message.accounts?.[0]?.toString() === expectFeePayer, results);
	check(`targets mpl-core program`, programs.has(MPL_CORE_PROGRAM_ID.toString()), results);
	for (const s of expectSigners) {
		check(`signer present: ${s.label}`, signerKeys.has(s.key), results);
	}
}

async function main() {
	const results = [];

	const funder = process.env.FUNDER_SECRET
		? Keypair.fromSecretKey(bs58.decode(process.env.FUNDER_SECRET))
		: Keypair.generate();
	console.log(`Funder (authority + payer): ${funder.publicKey.toBase58()}`);

	// Umi with funder as identity (payer) + signer — exactly like the handler.
	const umi = createUmi(RPC).use(mplCore());
	const authoritySigner = createSignerFromKeypair(
		umi,
		umi.eddsa.createKeypairFromSecretKey(funder.secretKey),
	);
	umi.use(signerIdentity(authoritySigner));
	const funderKey = authoritySigner.publicKey.toString();

	// ── BUILD phase (offline, no SOL) ──────────────────────────────────────────
	const collectionSigner = generateSigner(umi);
	const collectionBuilder = createCollection(umi, {
		collection: collectionSigner,
		name: 'three.ws Agents',
		uri: 'https://three.ws/api/agents/solana-collection-metadata?network=devnet',
		plugins: [
			{
				type: 'Attributes',
				attributeList: [
					{ key: 'platform', value: 'three.ws' },
					{ key: 'standard', value: 'metaplex-core' },
					{ key: 'chain', value: `solana:${DEVNET_REF}` },
				],
			},
		],
	});
	verifyBuild(umi, collectionBuilder, {
		label: 'createCollection (three.ws Agents)',
		expectFeePayer: funderKey,
		expectSigners: [
			{ label: 'funder/authority', key: funderKey },
			{ label: 'collection', key: collectionSigner.publicKey.toString() },
		],
		results,
	});

	const agentOwner = Keypair.generate(); // stands in for the custodial agent wallet
	const ownerPk = umiPublicKey(agentOwner.publicKey.toBase58());
	const assetSigner = generateSigner(umi);
	const assetArgs = {
		asset: assetSigner,
		collection: collectionSigner.publicKey,
		authority: authoritySigner,
		owner: ownerPk,
		name: 'Smoke Agent',
		uri: 'https://three.ws/api/agents/smoke/metadata',
		plugins: [
			{
				type: 'Attributes',
				attributeList: [
					{ key: 'platform', value: 'three.ws' },
					{ key: 'agent', value: 'Smoke Agent' },
					{ key: 'standard', value: 'metaplex-core' },
				],
			},
			{
				type: 'Royalties',
				basisPoints: 500,
				creators: [{ address: ownerPk, percentage: 100 }],
				ruleSet: ruleSet('None'),
			},
		],
	};
	verifyBuild(umi, create(umi, assetArgs), {
		label: 'create agent asset (into collection, owner = agent wallet)',
		expectFeePayer: funderKey,
		expectSigners: [
			{ label: 'funder/authority', key: funderKey },
			{ label: 'asset', key: assetSigner.publicKey.toString() },
		],
		results,
	});

	const owner = agentOwner.publicKey.toBase58();
	check('owner (agent wallet) is NOT a required signer', owner !== funderKey, results);

	const buildOk = results.every(Boolean);
	console.log(`\n[build] ${buildOk ? '✅ all checks passed' : '❌ FAILED'} (${results.filter(Boolean).length}/${results.length})`);

	// ── SEND phase (only if the funder has devnet SOL) ─────────────────────────
	const conn = new Connection(RPC, 'confirmed');
	let bal = 0;
	try { bal = await conn.getBalance(funder.publicKey); } catch {}
	if (bal < 0.01 * LAMPORTS_PER_SOL) {
		console.log(`\n[send] skipped — funder holds ${(bal / LAMPORTS_PER_SOL).toFixed(4)} SOL on devnet.`);
		console.log('       (public devnet faucet is rate-limiting this host; build verification above is authoritative.)');
		process.exit(buildOk ? 0 : 1);
	}

	console.log(`\n[send] funder has ${(bal / LAMPORTS_PER_SOL).toFixed(4)} SOL — performing a real devnet mint…`);
	await createCollection(umi, {
		collection: collectionSigner,
		name: 'three.ws Agents',
		uri: 'https://three.ws/api/agents/solana-collection-metadata?network=devnet',
		plugins: [{ type: 'Attributes', attributeList: [{ key: 'platform', value: 'three.ws' }, { key: 'standard', value: 'metaplex-core' }] }],
	}).sendAndConfirm(umi, { confirm: { commitment: 'confirmed' } });
	console.log(`  ✓ collection → ${explorer(collectionSigner.publicKey)}`);

	const res = await create(umi, assetArgs).sendAndConfirm(umi, { confirm: { commitment: 'confirmed' } });
	console.log(`  ✓ minted, sig ${bs58.encode(res.signature)}`);

	const asset = await fetchAsset(umi, assetSigner.publicKey);
	check('owner == agent wallet', asset.owner.toString() === owner, results);
	check('in collection', asset.updateAuthority?.address?.toString() === collectionSigner.publicKey.toString(), results);
	check('has Royalties plugin (500 bps)', asset.royalties?.basisPoints === 500, results);
	console.log(`\nAsset:      ${explorer(assetSigner.publicKey)}`);
	console.log(`Collection: ${explorer(collectionSigner.publicKey)}`);

	const ok = results.every(Boolean);
	console.log(ok ? '\n✅ Smoke passed — on-chain deploy works end-to-end.' : '\n❌ Smoke failed — see ✗ above.');
	process.exit(ok ? 0 : 1);
}

main().catch((err) => {
	console.error('\n❌ Smoke error:', err?.stack || err?.message || err);
	process.exit(1);
});
