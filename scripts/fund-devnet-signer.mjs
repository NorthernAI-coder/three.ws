#!/usr/bin/env node
// Fund a Solana signer on devnet via airdrop, then report its balance.
//
// Devnet SOL is free and airdroppable, so devnet signers should never block a
// smoke run. This script either funds an existing signer (decoded from its env
// var) or, with --new, generates a fresh throwaway devnet keypair and prints its
// secret so you can drop it into your local .env.local for devnet smokes. It
// NEVER writes a secret to disk and NEVER touches mainnet.
//
// Usage:
//   node scripts/fund-devnet-signer.mjs --env PUMP_CRON_RELAYER_SECRET_KEY_B64
//   node scripts/fund-devnet-signer.mjs --pubkey <base58>        # fund an address
//   node scripts/fund-devnet-signer.mjs --new                    # mint + fund a fresh one
//   SOL=2 node scripts/fund-devnet-signer.mjs --new              # request 2 SOL
//
// The public devnet faucet rate-limits aggressively from cloud IPs; if the
// airdrop 429s, the script says so and points at https://faucet.solana.com.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import w3 from '@solana/web3.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const envFile = path.join(ROOT, '.env.local');
if (fs.existsSync(envFile)) {
	for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
		const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
		if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
	}
}

const { decodeSecretKey } = await import(path.join(ROOT, 'api/_lib/solana-signers.js'));

function arg(name) {
	const i = process.argv.indexOf(name);
	return i >= 0 ? process.argv[i + 1] : null;
}

const rpcUrl = process.env.SOLANA_RPC_URL_DEVNET || w3.clusterApiUrl('devnet');
const conn = new w3.Connection(rpcUrl, 'confirmed');
const requestSol = Number(process.env.SOL || '2');

let pubkey;
let mintedSecretB64 = null;

if (process.argv.includes('--new')) {
	const kp = w3.Keypair.generate();
	pubkey = kp.publicKey;
	mintedSecretB64 = Buffer.from(kp.secretKey).toString('base64');
} else if (arg('--pubkey')) {
	pubkey = new w3.PublicKey(arg('--pubkey'));
} else if (arg('--env')) {
	const secret = process.env[arg('--env')];
	if (!secret) {
		console.error(`env ${arg('--env')} is not set — pass --new to mint a throwaway, or set it first`);
		process.exit(1);
	}
	const bytes = await decodeSecretKey(secret);
	if (!bytes) {
		console.error(`could not decode secret in ${arg('--env')}`);
		process.exit(1);
	}
	pubkey = w3.Keypair.fromSecretKey(bytes).publicKey;
} else {
	console.error('pass one of: --new | --pubkey <addr> | --env <VAR>');
	process.exit(1);
}

console.log(`network: devnet  rpc: ${rpcUrl}`);
console.log(`target:  ${pubkey.toBase58()}`);

const before = await conn.getBalance(pubkey).catch(() => 0);
console.log(`balance before: ${(before / 1e9).toFixed(6)} SOL`);

try {
	const sig = await conn.requestAirdrop(pubkey, requestSol * 1e9);
	console.log(`airdrop tx: ${sig}`);
	const bh = await conn.getLatestBlockhash('confirmed');
	await conn.confirmTransaction({ signature: sig, ...bh }, 'confirmed');
	const after = await conn.getBalance(pubkey);
	console.log(`balance after:  ${(after / 1e9).toFixed(6)} SOL`);
	console.log(`https://explorer.solana.com/tx/${sig}?cluster=devnet`);
} catch (e) {
	console.error(`\nairdrop failed: ${e.message}`);
	console.error('The public devnet faucet rate-limits cloud IPs. Use https://faucet.solana.com');
	console.error(`for ${pubkey.toBase58()} instead, then re-run with --pubkey to confirm.`);
	if (mintedSecretB64) printMinted();
	process.exit(1);
}

if (mintedSecretB64) printMinted();

function printMinted() {
	console.log('\n── fresh throwaway devnet keypair (DEVNET ONLY — never reuse on mainnet) ──');
	console.log(`pubkey: ${pubkey.toBase58()}`);
	console.log(`secret (base64, for a *_B64 env var): ${mintedSecretB64}`);
	console.log('Add it to .env.local yourself; this script never writes secrets to disk.');
}
