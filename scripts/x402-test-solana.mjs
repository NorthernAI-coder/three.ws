#!/usr/bin/env node
// scripts/x402-test-solana.mjs
// Drives a real x402 USDC payment from a local Solana keypair against
// three.ws x402 endpoints, using the PayAI Solana facilitator flow:
//
//   1. GET endpoint → 402 with PaymentRequirements (network=solana:..., feePayer=2wKupLR9...)
//   2. Build SPL TransferChecked with feePayer = PayAI; sign as source authority only.
//   3. Serialize partially-signed tx → base64 → X-PAYMENT payload `{ transaction }`.
//   4. Retry GET with X-PAYMENT header. Server /verifies and /settles via PayAI;
//      PayAI co-signs as fee payer and broadcasts.
//
// Usage:
//   node scripts/x402-test-solana.mjs            # canary only
//   node scripts/x402-test-solana.mjs --all      # every Solana-supporting endpoint
//   node scripts/x402-test-solana.mjs --only=skill-marketplace

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import bs58 from 'bs58';
import {
	ComputeBudgetProgram,
	Connection,
	Keypair,
	PublicKey,
	Transaction,
} from '@solana/web3.js';
import {
	getAssociatedTokenAddressSync,
	createAssociatedTokenAccountIdempotentInstruction,
	createTransferCheckedInstruction,
	getMint,
	TOKEN_PROGRAM_ID,
	ASSOCIATED_TOKEN_PROGRAM_ID,
} from '@solana/spl-token';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = process.env.X402_BASE_URL || 'https://three.ws';
const RPC = process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com';
const SECRET_PATH = path.join(__dirname, '.secrets', 'rider-vault.json');

const X402_VERSION = 2;
const SOLANA_MAINNET_CAIP2 = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';

// real agent_id from skill-marketplace listing
const REAL_AGENT_ID = '76bca598-103f-4e3a-8c95-b0d64993258a';
// USDC mint stands in as any tradeable Solana mint for audit endpoints
const SAMPLE_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

const ENDPOINTS = [
	{ name: 'symbol-availability', method: 'GET', url: '/api/x402/symbol-availability?ticker=WWWTEST' },
	{ name: 'skill-marketplace', method: 'GET', url: `/api/x402/skill-marketplace?agent_id=${REAL_AGENT_ID}` },
	{ name: 'agent-reputation', method: 'GET', url: `/api/x402/agent-reputation?agent_id=${REAL_AGENT_ID}` },
	{ name: 'pump-agent-audit', method: 'GET', url: `/api/x402/pump-agent-audit?mint=FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump` },
	{
		name: 'mint-to-mesh-batch',
		method: 'POST',
		url: '/api/x402/mint-to-mesh-batch',
		body: { mints: [SAMPLE_MINT] },
	},
	{
		name: 'onchain-identity-verify',
		method: 'GET',
		url: `/api/x402/onchain-identity-verify?agent_id=${REAL_AGENT_ID}&chain=solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp&contract_or_mint=FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`,
	},
];

function loadKeypair() {
	const raw = JSON.parse(fs.readFileSync(SECRET_PATH, 'utf8'));
	const kp = Keypair.fromSecretKey(bs58.decode(raw.secretKeyBase58));
	if (raw.address && raw.address !== kp.publicKey.toBase58()) {
		throw new Error(`secret file address mismatch: file=${raw.address} derived=${kp.publicKey.toBase58()}`);
	}
	return kp;
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

	const tx = new Transaction();
	const { blockhash } = await connection.getLatestBlockhash('confirmed');
	tx.recentBlockhash = blockhash;
	tx.feePayer = feePayer;

	// x402 SVM "exact" scheme V1 instruction layout (per x402-foundation
	// reference facilitator, github.com/x402-foundation/x402): exactly
	// [SetComputeUnitLimit, SetComputeUnitPrice, TransferChecked] (+ optional
	// Lighthouse/Memo trailers). No ATA-create allowed — receiver ATA must
	// already exist.
	const receiverInfo = await connection.getAccountInfo(receiverAta);
	if (!receiverInfo) {
		throw new Error(`receiver ATA ${receiverAta.toBase58()} does not exist; x402 SVM exact disallows ATA creation in the same tx`);
	}
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

function encodePaymentHeader(payload) {
	return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
}

async function runOne(endpoint, kp, connection) {
	const url = `${BASE_URL}${endpoint.url}`;
	const method = endpoint.method || 'GET';
	const bodyInit = endpoint.body
		? { body: JSON.stringify(endpoint.body), headers: { 'content-type': 'application/json' } }
		: {};
	process.stdout.write(`\n→ ${endpoint.name.padEnd(24)} ${method} ${url}\n`);
	const t0 = Date.now();

	// 1. Probe for 402.
	const probe = await fetch(url, { method, ...bodyInit });
	if (probe.status === 200) {
		console.log(`   ! 200 unprompted — endpoint not gated`);
		return { name: endpoint.name, ok: true, note: 'not gated' };
	}
	if (probe.status !== 402) {
		const body = await probe.text();
		console.log(`   ✗ unexpected ${probe.status}: ${body.slice(0, 200)}`);
		return { name: endpoint.name, ok: false, status: probe.status };
	}
	const envelope = await probe.json();
	const requirement = pickSolanaRequirement(envelope);
	if (!requirement) {
		console.log(`   ✗ envelope has no Solana accepts entry`);
		return { name: endpoint.name, ok: false, note: 'no solana accept' };
	}
	const usd = (Number(requirement.amount) / 1e6).toFixed(6);
	console.log(`   • 402 ok; price=${requirement.amount} atomics ($${usd}); feePayer=${requirement.extra.feePayer.slice(0, 8)}…`);

	// 2 + 3. Build, sign, encode.
	let txBase64;
	try {
		txBase64 = await buildAndSignTransferTx({ kp, connection, requirement });
	} catch (err) {
		console.log(`   ✗ build/sign failed: ${err.message}`);
		return { name: endpoint.name, ok: false, error: err.message };
	}

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

	// 4. Retry with X-PAYMENT.
	const retryHeaders = { 'X-PAYMENT': encodePaymentHeader(paymentPayload) };
	if (bodyInit.headers) Object.assign(retryHeaders, bodyInit.headers);
	const res = await fetch(url, {
		method,
		headers: retryHeaders,
		...(bodyInit.body ? { body: bodyInit.body } : {}),
	});
	const dt = Date.now() - t0;
	const body = await res.text();
	const short = body.length > 240 ? body.slice(0, 240) + '…' : body;

	if (res.status === 200) {
		const payTx = res.headers.get('x-payment-tx');
		const payNet = res.headers.get('x-payment-network');
		console.log(`   ✓ 200 in ${dt}ms  network=${payNet || '?'}  tx=${payTx || '?'}`);
		const respHeader = res.headers.get('x-payment-response');
		if (respHeader) {
			try {
				const decoded = JSON.parse(Buffer.from(respHeader, 'base64').toString('utf8'));
				console.log(`     settle: ${JSON.stringify(decoded).slice(0, 200)}`);
			} catch {}
		}
		console.log(`     body: ${short}`);
		return { name: endpoint.name, ok: true, tx: payTx };
	}
	console.log(`   ✗ ${res.status} in ${dt}ms`);
	console.log(`     body: ${short}`);
	return { name: endpoint.name, ok: false, status: res.status, body: short };
}

async function main() {
	const args = process.argv.slice(2);
	const runAll = args.includes('--all');
	const onlyName = args.find((a) => a.startsWith('--only='))?.slice('--only='.length);

	const kp = loadKeypair();
	const connection = new Connection(RPC, 'confirmed');

	console.log(`payer: ${kp.publicKey.toBase58()}`);
	console.log(`rpc:   ${RPC}`);
	console.log(`base:  ${BASE_URL}`);

	const list = onlyName
		? ENDPOINTS.filter((e) => e.name === onlyName)
		: runAll
			? ENDPOINTS
			: ENDPOINTS.slice(0, 1);
	if (list.length === 0) {
		console.error(`no endpoint matches --only=${onlyName}`);
		process.exit(1);
	}

	const results = [];
	for (const ep of list) {
		// eslint-disable-next-line no-await-in-loop
		results.push(await runOne(ep, kp, connection));
	}

	console.log('\n--- summary ---');
	for (const r of results) {
		console.log(`  ${r.ok ? '✓' : '✗'} ${r.name}${r.tx ? `  tx=${r.tx}` : ''}${r.status ? `  status=${r.status}` : ''}${r.note ? `  (${r.note})` : ''}`);
	}
	process.exit(results.every((r) => r.ok) ? 0 : 1);
}

main().catch((err) => {
	console.error('fatal:', err);
	process.exit(1);
});
