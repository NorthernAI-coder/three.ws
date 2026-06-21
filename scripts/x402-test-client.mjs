// x402 Solana test client — drives the platform's own production payment path
// (agent-payments-sdk `createX402Fetch`) against a live three.ws paid endpoint
// using a throwaway funded keypair.
//
// Flow: GET/POST the endpoint → 402 challenge → build + sign + broadcast an SPL
// TransferChecked (buyer is fee payer) → retry with the X-PAYMENT proof →
// print the paid result, the on-chain signature, and the settlement header.
//
// Usage:
//   node scripts/x402-test-client.mjs                         # model-check ($0.001), the cheapest
//   node scripts/x402-test-client.mjs agent-reputation       # $0.01
//   node scripts/x402-test-client.mjs https://three.ws/api/x402/fact-check '{"claim":"..."}'
//
// Env:
//   SOLANA_RPC_URL   mainnet RPC (defaults to the public endpoint; set a Helius
//                    URL to avoid the public rate limit on repeated runs)
//   X402_WALLET      path to the secret-key JSON array (defaults to the file
//                    written by the keypair generator)

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js';
import { getAssociatedTokenAddressSync, getAccount, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import pkg from '../agent-payments-sdk/dist/solana/index.cjs';
const { x402 } = pkg;

const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const HOST = process.env.X402_HOST || 'https://three.ws';
const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const WALLET_PATH = process.env.X402_WALLET || join(homedir(), '.config', 'three-ws', 'x402-test-wallet.json');

// ── resolve the target endpoint + optional POST body from argv ──────────────
function resolveTarget(argv) {
	const [arg, bodyArg] = argv;
	const url = !arg ? `${HOST}/api/x402/model-check`
		: arg.startsWith('http') ? arg
		: `${HOST}/api/x402/${arg}`;
	let body = null;
	if (bodyArg) {
		try { body = JSON.parse(bodyArg); }
		catch { throw new Error(`second arg must be a JSON body, got: ${bodyArg}`); }
	}
	return { url, body };
}

function loadKeypair() {
	let raw;
	try { raw = readFileSync(WALLET_PATH, 'utf8'); }
	catch { throw new Error(`wallet not found at ${WALLET_PATH} — set X402_WALLET or regenerate it`); }
	return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
}

async function reportBalances(connection, owner) {
	const sol = await connection.getBalance(owner, 'confirmed');
	console.log(`  SOL : ${(sol / 1e9).toFixed(6)} SOL  (${owner.toBase58()})`);
	const ata = getAssociatedTokenAddressSync(new PublicKey(USDC_MINT), owner, false, TOKEN_PROGRAM_ID);
	let usdc = 0n;
	try { usdc = (await getAccount(connection, ata)).amount; }
	catch { /* ATA not created yet — wallet has never received USDC */ }
	console.log(`  USDC: ${(Number(usdc) / 1e6).toFixed(6)} USDC (ata ${ata.toBase58()})`);
	return { sol, usdc };
}

async function main() {
	const { url, body } = resolveTarget(process.argv.slice(2));
	const kp = loadKeypair();
	const connection = new Connection(RPC_URL, 'confirmed');

	console.log(`\nx402 Solana test → ${url}`);
	console.log(`RPC: ${RPC_URL}\n`);
	console.log('Wallet balances:');
	const { sol, usdc } = await reportBalances(connection, kp.publicKey);

	if (sol === 0 || usdc === 0n) {
		console.log('\n⚠  Wallet underfunded — send a little SOL (gas) and USDC to the address above, then re-run.');
		process.exit(1);
	}

	// Wrap our keypair into the SDK's production x402 fetch. The buyer is the fee
	// payer: we sign locally and broadcast ourselves, then hand the confirmed
	// signature back as the payment proof.
	const x402fetch = x402.createX402Fetch({
		payer: kp.publicKey.toBase58(),
		connection,
		network: x402.SOLANA_MAINNET,
		signTransaction: async (txBase64) => {
			const tx = Transaction.from(Buffer.from(txBase64, 'base64'));
			tx.partialSign(kp);
			return Buffer.from(tx.serialize({ requireAllSignatures: false })).toString('base64');
		},
		sendTransaction: async (signedTxBase64) => {
			const sig = await connection.sendRawTransaction(Buffer.from(signedTxBase64, 'base64'));
			return sig;
		},
	});

	const init = body
		? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
		: { method: 'GET' };

	console.log('\nPaying + calling endpoint…');
	const res = await x402fetch(url, init);
	const settle = res.headers.get('x-payment-response');
	const text = await res.text();

	console.log(`\nHTTP ${res.status}`);
	if (settle) {
		try {
			const decoded = JSON.parse(Buffer.from(settle, 'base64').toString('utf8'));
			console.log(`Settlement: ${decoded.success ? 'OK' : 'FAILED'}` +
				(decoded.transaction ? `  tx=${decoded.transaction}` : '') +
				(decoded.payer ? `  payer=${decoded.payer}` : ''));
			if (decoded.transaction) console.log(`Explorer: https://solscan.io/tx/${decoded.transaction}`);
		} catch { console.log(`Settlement header (raw): ${settle}`); }
	}
	console.log('\nResponse body:');
	try { console.log(JSON.stringify(JSON.parse(text), null, 2)); }
	catch { console.log(text); }

	if (res.status === 402) {
		console.log('\n⚠  Still 402 after payment — check amount/recipient/RPC. Nothing was delivered.');
		process.exit(1);
	}
	console.log('\n✓ Paid call succeeded.');
}

main().catch((err) => { console.error('\n✗ Error:', err.message); process.exit(1); });
