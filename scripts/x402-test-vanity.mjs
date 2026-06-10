#!/usr/bin/env node
// scripts/x402-test-vanity.mjs
// Drives a real x402 USDC payment on Solana mainnet against the three.ws
// Vanity Grinder endpoint (GET /api/x402/vanity) from a locally generated
// keypair. Mirrors the PayAI SVM "exact" flow in x402-test-solana.mjs:
//
//   1. GET → 402 with PaymentRequirements (network=solana:…, feePayer=PayAI)
//   2. Build [SetCUlimit, SetCUprice, TransferChecked] with feePayer=PayAI;
//      sign ONLY as the source authority (buyer pays no SOL).
//   3. Serialize partially-signed tx → base64 → X-PAYMENT `{ transaction }`.
//   4. Retry GET with X-PAYMENT. Server /verifies + /settles via PayAI.
//
// Usage: node scripts/x402-test-vanity.mjs [prefix]   (default prefix "S")

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
	ComputeBudgetProgram,
	Connection,
	Keypair,
	PublicKey,
	Transaction,
} from '@solana/web3.js';
import {
	getAssociatedTokenAddressSync,
	createTransferCheckedInstruction,
	getMint,
	getAccount,
	TOKEN_PROGRAM_ID,
	ASSOCIATED_TOKEN_PROGRAM_ID,
} from '@solana/spl-token';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SECRET_PATH = process.env.WALLET_PATH || path.join(__dirname, '..', '.wallet-test.json');
const BASE_URL = process.env.X402_BASE_URL || 'https://three.ws';
const RPC = process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com';
const SOLANA_MAINNET_CAIP2 = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';
const X402_VERSION = 2;

function loadKeypair() {
	const raw = JSON.parse(fs.readFileSync(SECRET_PATH, 'utf8'));
	return Keypair.fromSecretKey(Uint8Array.from(raw));
}

function pickSolanaRequirement(envelope) {
	const accepts = envelope.accepts || [];
	return (
		accepts.find((a) => a.scheme === 'exact' && a.network === SOLANA_MAINNET_CAIP2) ||
		accepts.find((a) => a.scheme === 'exact' && String(a.network).startsWith('solana')) ||
		null
	);
}

async function buildAndSignTransferTx({ kp, connection, requirement }) {
	const payer = kp.publicKey;
	const mint = new PublicKey(requirement.asset);
	const payTo = new PublicKey(requirement.payTo);
	const feePayer = new PublicKey(requirement.extra.feePayer);
	const amount = BigInt(requirement.amount);

	const mintInfo = await getMint(connection, mint);
	const senderAta = getAssociatedTokenAddressSync(mint, payer, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
	const receiverAta = getAssociatedTokenAddressSync(mint, payTo, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);

	// Preflight: buyer's USDC account must exist and hold enough.
	let senderBal = 0n;
	try {
		const acct = await getAccount(connection, senderAta);
		senderBal = acct.amount;
	} catch {
		throw new Error(
			`buyer USDC account ${senderAta.toBase58()} not found — fund ${payer.toBase58()} with USDC on Solana first`,
		);
	}
	if (senderBal < amount) {
		throw new Error(
			`insufficient USDC: have ${(Number(senderBal) / 1e6).toFixed(6)}, need ${(Number(amount) / 1e6).toFixed(6)}`,
		);
	}
	const receiverInfo = await connection.getAccountInfo(receiverAta);
	if (!receiverInfo) throw new Error(`receiver ATA ${receiverAta.toBase58()} does not exist`);

	const tx = new Transaction();
	const { blockhash } = await connection.getLatestBlockhash('confirmed');
	tx.recentBlockhash = blockhash;
	tx.feePayer = feePayer;
	tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 20_000 }));
	tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1 }));
	tx.add(
		createTransferCheckedInstruction(
			senderAta, mint, receiverAta, payer,
			amount, mintInfo.decimals, [], TOKEN_PROGRAM_ID,
		),
	);
	tx.partialSign(kp);
	const serialized = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
	return Buffer.from(serialized).toString('base64');
}

async function main() {
	const prefix = process.argv[2] || 'S';
	const kp = loadKeypair();
	const connection = new Connection(RPC, 'confirmed');
	const url = process.env.X402_URL
		? `${BASE_URL}${process.env.X402_URL}`
		: `${BASE_URL}/api/x402/vanity?prefix=${encodeURIComponent(prefix)}`;

	console.log(`buyer:  ${kp.publicKey.toBase58()}`);
	console.log(`rpc:    ${RPC}`);
	console.log(`target: ${url}\n`);

	const probe = await fetch(url);
	if (probe.status !== 402) {
		console.log(`unexpected ${probe.status}: ${(await probe.text()).slice(0, 300)}`);
		process.exit(1);
	}
	const envelope = await probe.json();
	const requirement = pickSolanaRequirement(envelope);
	if (!requirement) {
		console.log('no Solana accepts entry in 402 envelope');
		process.exit(1);
	}
	console.log(`402 ok — price $${(Number(requirement.amount) / 1e6).toFixed(6)} USDC; feePayer=${requirement.extra.feePayer.slice(0, 8)}…`);

	const txBase64 = await buildAndSignTransferTx({ kp, connection, requirement });
	const paymentPayload = {
		x402Version: X402_VERSION,
		scheme: 'exact',
		network: requirement.network,
		resource: {
			url: envelope.resource?.url || url,
			mimeType: envelope.resource?.mimeType || 'application/json',
		},
		accepted: requirement,
		payload: { transaction: txBase64 },
	};
	const header = Buffer.from(JSON.stringify(paymentPayload), 'utf8').toString('base64');

	console.log('paying + retrying with X-PAYMENT…\n');
	const t0 = Date.now();
	const res = await fetch(url, { headers: { 'X-PAYMENT': header } });
	const dt = Date.now() - t0;
	const body = await res.text();

	if (res.status === 200) {
		const settleHeader = res.headers.get('x-payment-response');
		console.log(`✓ 200 in ${dt}ms`);
		if (settleHeader) {
			try {
				const decoded = JSON.parse(Buffer.from(settleHeader, 'base64').toString('utf8'));
				const tx = decoded.transaction || decoded.txHash || decoded.signature;
				if (tx) console.log(`  settlement tx: https://solscan.io/tx/${tx}`);
			} catch {}
		}
		try {
			const data = JSON.parse(body);
			if (data.address) {
				console.log(`  ground address: ${data.address}`);
				console.log(`  attempts: ${data.attempts}  durationMs: ${data.durationMs}`);
				console.log(`  explorer: ${data.explorerUrl}`);
			} else {
				console.log(`  body: ${body.slice(0, 300)}`);
			}
		} catch {
			console.log(`  body: ${body.slice(0, 300)}`);
		}
	} else {
		console.log(`✗ ${res.status} in ${dt}ms`);
		console.log(body.slice(0, 400));
		process.exit(1);
	}
}

main().catch((err) => {
	console.error('fatal:', err.message);
	process.exit(1);
});
