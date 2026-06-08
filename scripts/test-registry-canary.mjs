#!/usr/bin/env node
/**
 * Self-contained canary for the Metaplex Agent Registry flow.
 * ---------------------------------------------------------------------------
 * Proves api/_lib/agent-registry.js end-to-end on a throwaway wallet that we
 * fully control: it mints its own standalone Core assets and then registers each
 * one via `registerIdentityV1`, so the wallet is the asset's update authority and
 * the registration is valid. NO database, NO production secrets, NO real agents —
 * purely a chain-level smoke test before the real back-fill (which must be signed
 * by the production collection authority, the only key that can register the
 * already-minted agents).
 *
 * Wallet: .secrets/test-registry-wallet.json (git-ignored). Override with
 * TEST_REGISTRY_SECRET (base58) if you want a different funded wallet.
 *
 * Usage:
 *   # devnet (free — airdrops if needed):
 *   node scripts/test-registry-canary.mjs --network devnet --count 2
 *
 *   # mainnet (fund the wallet first, ~0.01 SOL/asset):
 *   node scripts/test-registry-canary.mjs --network mainnet --count 2
 */

import { readFileSync } from 'node:fs';
import { Keypair, Connection, LAMPORTS_PER_SOL } from '@solana/web3.js';
import bs58 from 'bs58';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { mplCore, create } from '@metaplex-foundation/mpl-core';
import { createSignerFromKeypair, signerIdentity, generateSigner, publicKey as umiPublicKey } from '@metaplex-foundation/umi';
import { registerAgentIdentity } from '../api/_lib/agent-registry.js';

function arg(name, fallback) {
	const i = process.argv.indexOf(name);
	return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sol = (l) => (l / LAMPORTS_PER_SOL).toFixed(4);

function loadTestSecret() {
	if (process.env.TEST_REGISTRY_SECRET) return process.env.TEST_REGISTRY_SECRET;
	const j = JSON.parse(readFileSync(new URL('../.secrets/test-registry-wallet.json', import.meta.url)));
	return j.secretKeyBase58;
}

const RPC = {
	mainnet: 'https://api.mainnet-beta.solana.com',
	devnet: 'https://api.devnet.solana.com',
};
function explorer(addr, network) {
	return `https://solscan.io/account/${addr}${network === 'devnet' ? '?cluster=devnet' : ''}`;
}

async function main() {
	const network = arg('--network', 'devnet') === 'mainnet' ? 'mainnet' : 'devnet';
	const count = Math.min(5, Math.max(1, Number(arg('--count', '2'))));

	const kp = Keypair.fromSecretKey(bs58.decode(loadTestSecret()));
	const address = kp.publicKey.toString();
	console.log(`\nthree.ws — Agent Registry canary (${network})`);
	console.log(`  test wallet: ${address}`);

	const conn = new Connection(RPC[network], 'confirmed');
	let bal = await conn.getBalance(kp.publicKey);
	console.log(`  balance:     ${sol(bal)} SOL`);

	const needed = count * 0.012 * LAMPORTS_PER_SOL; // mint (~0.004) + register (~0.003) + fees, with headroom
	if (bal < needed) {
		if (network === 'devnet') {
			console.log(`  airdropping 1 SOL (devnet) …`);
			try {
				const sig = await conn.requestAirdrop(kp.publicKey, 1 * LAMPORTS_PER_SOL);
				await conn.confirmTransaction(sig, 'confirmed');
				bal = await conn.getBalance(kp.publicKey);
				console.log(`  balance:     ${sol(bal)} SOL`);
			} catch (e) {
				console.error(`\n✗ devnet airdrop failed (${e.message}). Fund ${address} manually and re-run.`);
				process.exit(1);
			}
		} else {
			console.error(`\n✗ Insufficient balance. Fund ${address} with ~${sol(needed)} SOL and re-run.`);
			process.exit(1);
		}
	}

	// Umi signed by the test wallet (mplCore for the mint; registry plugin is added
	// inside agent-registry.js).
	const umi = createUmi(RPC[network]).use(mplCore());
	const signer = createSignerFromKeypair(umi, umi.eddsa.createKeypairFromSecretKey(kp.secretKey));
	umi.use(signerIdentity(signer));

	let ok = 0, fail = 0;
	for (let i = 1; i <= count; i++) {
		console.log(`\n[${i}/${count}] minting test asset …`);
		try {
			const asset = generateSigner(umi);
			await create(umi, {
				asset,
				owner: signer.publicKey,
				name: `Registry Canary ${i}`,
				uri: 'https://three.ws/.well-known/agent-card.json',
			}).sendAndConfirm(umi, { confirm: { commitment: 'confirmed' } });
			const assetAddr = asset.publicKey.toString();
			console.log(`        asset:    ${assetAddr}`);
			console.log(`                  ${explorer(assetAddr, network)}`);

			console.log(`        registering identity …`);
			const r = await registerAgentIdentity({
				umi,
				authoritySigner: signer,
				asset: assetAddr,
				// standalone asset — no collection; the wallet is its own update authority
				registrationUri: 'https://three.ws/.well-known/agent-card.json',
			});
			ok++;
			console.log(`        ✓ identity PDA: ${r.identityPda}${r.alreadyRegistered ? ' (already)' : ''}`);
			console.log(`                  ${explorer(r.identityPda, network)}`);
			if (r.signature) console.log(`        register tx: ${r.signature}`);
		} catch (err) {
			fail++;
			console.log(`        ✗ ${err.message}`);
		}
		await sleep(400);
	}

	console.log(`\nDone — registered: ${ok}, failed: ${fail}.`);
	if (ok > 0) console.log('Open the identity PDA link above; an account owned by program 1DREG… confirms registry membership.');
}

main().catch((err) => {
	console.error('\n✗ Fatal:', err?.stack || err?.message || err);
	process.exit(1);
});
