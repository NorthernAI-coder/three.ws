#!/usr/bin/env node
// demo-metamask-embedded-x402 — a user-generated MetaMask embedded wallet pays
// a three.ws x402 endpoint, settled in USDC on Solana mainnet.
//
// This is the hosted "generate your own MetaMask agent wallet" flow, end to
// end, using the path MetaMask points integrators at (the Embedded Wallets
// Node SDK — https://docs.metamask.io/embedded-wallets/sdk/node):
//
//   1. The platform mints a JWT for the signed-in user (here: a demo RS256
//      token for DEMO_USER_SUB — in production, three.ws's own JWKS-backed
//      token for the session user).
//   2. @web3auth/node-sdk connect() → MetaMask's network verifies the JWT and
//      derives the user's deterministic ed25519 key. Same sub → same wallet,
//      every time, on any host. Nothing is stored on three.ws.
//   3. The returned @solana/kit signer drives the standard x402 exact-scheme
//      payment (the same @x402/svm flow the agent-wallet bridge uses): 402
//      challenge → partially-signed SPL TransferChecked → X-PAYMENT → the
//      endpoint's facilitator co-signs and settles on Solana mainnet.
//
// If the wallet holds less USDC than the endpoint's price and
// A2A_PAYER_SOLANA_SECRET (or the dev keypair at
// ~/.config/x402-test-wallets/solana.json) is available, the script tops it
// up first so the demo is one command.
//
// Demo credentials: the clientId, authConnectionId (w3a-node-demo-sol), and
// RS256 signing key are Web3Auth's PUBLIC demo credentials from their
// official examples (Web3Auth/web3auth-node-examples, MIT). Anyone can mint
// any sub against them — fine for a demo wallet holding cents, never for
// production. Production needs a (free, self-serve) MetaMask Developer
// Dashboard project: our own clientId + an auth connection pointing at a
// three.ws JWKS endpoint.
//
// Run: node scripts/demo-metamask-embedded-x402.mjs [topic]
//   DEMO_USER_SUB     override the demo user id (default threews-demo-agent-001)
//   DEMO_ENDPOINT     override the paid endpoint (default prod crypto-intel)

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import jwt from 'jsonwebtoken';
import bs58 from 'bs58';

const TOPIC = process.argv[2] || 'solana';
const ENDPOINT = process.env.DEMO_ENDPOINT || 'https://three.ws/api/x402/crypto-intel';
const USER_SUB = process.env.DEMO_USER_SUB || 'threews-demo-agent-001';
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

// Web3Auth public demo credentials (official node examples, sapphire_devnet).
const DEMO_CLIENT_ID =
	'BFcLTVqWlTSpBBaELDPSz4_LFgG8Nf8hEltPlf3QeUG_88GDrQSw82fSjjYj5x4F3ys3ghMq8-InU7Azx7NbFSs';
const DEMO_AUTH_CONNECTION = 'w3a-node-demo-sol';
const DEMO_JWT_KID = '2ma4enu1kdvw5bo9xsfpi3gcjzrt6q78yl0h';
const DEMO_JWT_KEY_URL =
	'https://raw.githubusercontent.com/Web3Auth/web3auth-node-examples/main/solana-quick-start/privateKey.pem';

function log(step, msg) {
	console.log(`\x1b[35m[${step}]\x1b[0m ${msg}`);
}

// ── 1. "Platform login" — mint the user's JWT ───────────────────────────────

async function mintDemoIdToken() {
	const res = await fetch(DEMO_JWT_KEY_URL, { signal: AbortSignal.timeout(10_000) });
	if (!res.ok) throw new Error(`could not fetch the public demo JWT key (HTTP ${res.status})`);
	const pem = await res.text();
	return jwt.sign(
		{
			sub: USER_SUB,
			name: 'three.ws demo agent',
			email: 'demo@three.ws',
			aud: 'urn:api-web3auth-io',
			iss: 'https://web3auth.io',
			iat: Math.floor(Date.now() / 1000),
			exp: Math.floor(Date.now() / 1000) + 3600,
		},
		pem,
		{ algorithm: 'RS256', keyid: DEMO_JWT_KID },
	);
}

// ── 2. Derive the MetaMask embedded wallet from the JWT ─────────────────────

async function deriveEmbeddedWallet(idToken) {
	const { Web3Auth } = await import('@web3auth/node-sdk');
	const web3auth = new Web3Auth({ clientId: DEMO_CLIENT_ID, web3AuthNetwork: 'sapphire_devnet' });
	await web3auth.init();
	const result = await web3auth.connect({ authConnectionId: DEMO_AUTH_CONNECTION, idToken });
	if (result.chainNamespace !== 'solana' || !result.signer?.address) {
		throw new Error('embedded wallet connect did not return a Solana signer');
	}
	return result.signer; // @solana/kit TransactionSigner — address, signTransactions
}

// ── 3. Balances + auto top-up from the local dev payer ──────────────────────

async function usdcBalance(conn, ownerBase58) {
	const { PublicKey } = await import('@solana/web3.js');
	const { getAssociatedTokenAddressSync } = await import('@solana/spl-token');
	try {
		const ata = getAssociatedTokenAddressSync(new PublicKey(USDC_MINT), new PublicKey(ownerBase58));
		const bal = await conn.getTokenAccountBalance(ata);
		return BigInt(bal?.value?.amount || '0');
	} catch {
		return 0n; // no ATA yet
	}
}

function loadDevPayerKeypairBytes() {
	const envSecret = process.env.A2A_PAYER_SOLANA_SECRET || '';
	if (envSecret) {
		const trimmed = envSecret.trim();
		if (trimmed.startsWith('[')) return Uint8Array.from(JSON.parse(trimmed));
		try { return bs58.decode(trimmed); } catch { /* try base64 */ }
		return new Uint8Array(Buffer.from(trimmed, 'base64'));
	}
	const path = `${homedir()}/.config/x402-test-wallets/solana.json`;
	return Uint8Array.from(JSON.parse(readFileSync(path, 'utf8')));
}

async function topUpUsdc(conn, toBase58, atomics) {
	const { Keypair, PublicKey, Transaction, sendAndConfirmTransaction } = await import('@solana/web3.js');
	const {
		getAssociatedTokenAddressSync, createTransferCheckedInstruction,
		createAssociatedTokenAccountIdempotentInstruction,
	} = await import('@solana/spl-token');
	const payer = Keypair.fromSecretKey(loadDevPayerKeypairBytes());
	const mint = new PublicKey(USDC_MINT);
	const to = new PublicKey(toBase58);
	const fromAta = getAssociatedTokenAddressSync(mint, payer.publicKey);
	const toAta = getAssociatedTokenAddressSync(mint, to);
	const tx = new Transaction().add(
		createAssociatedTokenAccountIdempotentInstruction(payer.publicKey, toAta, to, mint),
		createTransferCheckedInstruction(fromAta, mint, toAta, payer.publicKey, atomics, 6),
	);
	const sig = await sendAndConfirmTransaction(conn, tx, [payer], { commitment: 'confirmed' });
	log('fund', `topped up ${Number(atomics) / 1e6} USDC from ${payer.publicKey.toBase58()} — tx ${sig}`);
}

// ── 4. The x402 payment (same exact-scheme flow as the agent-wallet bridge) ──

function isSolanaExactAccept(a) {
	return a && a.scheme === 'exact' && String(a.network || '').startsWith('solana:') && a.extra?.feePayer;
}

async function fetch402(endpoint, body) {
	const res = await fetch(endpoint, {
		method: 'POST',
		headers: { accept: 'application/json', 'content-type': 'application/json' },
		body: JSON.stringify(body),
	});
	if (res.status !== 402) {
		throw new Error(`expected a 402 challenge from ${endpoint}, got ${res.status}`);
	}
	const challenge = await res.json();
	const accept = (challenge.accepts || []).find(isSolanaExactAccept);
	if (!accept) throw new Error('endpoint does not accept exact-scheme USDC on Solana');
	return { challenge, accept };
}

async function payWithEmbeddedWallet(signer, endpoint, body) {
	const { challenge, accept } = await fetch402(endpoint, body);
	log('x402', `402 challenge: $${(Number(accept.amount) / 1e6).toFixed(2)} USDC to ${accept.payTo}`);

	const { ExactSvmScheme } = await import('@x402/svm');
	const scheme = new ExactSvmScheme(signer, { rpcUrl: SOLANA_RPC_URL });
	const built = await scheme.createPaymentPayload(2, accept);
	log('x402', `embedded wallet ${signer.address} signed the SPL transfer`);

	const paymentPayload = {
		x402Version: built.x402Version || 2,
		scheme: 'exact',
		network: accept.network,
		resource: { url: endpoint, mimeType: 'application/json' },
		accepted: accept,
		payload: built.payload,
	};
	const declaredA = challenge?.extensions?.['builder-code']?.info?.a;
	if (declaredA && /^[a-z0-9_]{1,32}$/.test(declaredA)) {
		paymentPayload.extensions = {
			'builder-code': { a: declaredA, w: 'metamask_embedded', s: ['embedded_wallet_demo'] },
		};
	}

	const paidRes = await fetch(endpoint, {
		method: 'POST',
		headers: {
			accept: 'application/json',
			'content-type': 'application/json',
			'x-payment': Buffer.from(JSON.stringify(paymentPayload), 'utf8').toString('base64'),
		},
		body: JSON.stringify(body),
	});
	const text = await paidRes.text();
	let result;
	try { result = JSON.parse(text); } catch { result = { raw: text.slice(0, 500) }; }
	if (!paidRes.ok) {
		throw new Error(`payment rejected (HTTP ${paidRes.status}): ${result?.error?.message || result?.error || text.slice(0, 200)}`);
	}
	let settlement = null;
	const header = paidRes.headers.get('x-payment-response');
	if (header) {
		try { settlement = JSON.parse(Buffer.from(header, 'base64').toString('utf8')); } catch { /* keep null */ }
	}
	return { result, settlement, amount: accept.amount };
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
	const { Connection } = await import('@solana/web3.js');
	const conn = new Connection(SOLANA_RPC_URL, 'confirmed');

	log('login', `minting platform JWT for user "${USER_SUB}"…`);
	const idToken = await mintDemoIdToken();

	log('wallet', 'deriving MetaMask embedded wallet from the JWT…');
	const signer = await deriveEmbeddedWallet(idToken);
	log('wallet', `address: ${signer.address} (deterministic for this user — re-run to get the same one)`);

	const { accept } = await fetch402(ENDPOINT, { topic: TOPIC });
	const price = BigInt(accept.amount);
	let balance = await usdcBalance(conn, signer.address);
	log('wallet', `USDC balance: $${(Number(balance) / 1e6).toFixed(2)} (price: $${(Number(price) / 1e6).toFixed(2)})`);

	if (balance < price) {
		const topUp = price * 5n > 50_000n ? price * 5n : 50_000n; // a few calls' worth, min $0.05
		log('fund', 'balance below price — topping up from the local dev payer…');
		await topUpUsdc(conn, signer.address, topUp);
		balance = await usdcBalance(conn, signer.address);
	}

	log('x402', `paying ${ENDPOINT} (topic: ${TOPIC})…`);
	const { result, settlement, amount } = await payWithEmbeddedWallet(signer, ENDPOINT, { topic: TOPIC });

	console.log('');
	log('done', `✓ $${(Number(amount) / 1e6).toFixed(2)} USDC settled on Solana mainnet`);
	if (settlement?.transaction) {
		log('done', `tx: https://solscan.io/tx/${settlement.transaction}`);
	}
	log('done', `paid intel: [${result.signal}] ${result.headline}`);
	console.log('\nFull paid response:\n' + JSON.stringify(result, null, 2));
}

main().catch((err) => {
	console.error(`\x1b[31mERROR:\x1b[0m ${err.message}`);
	process.exit(1);
});
