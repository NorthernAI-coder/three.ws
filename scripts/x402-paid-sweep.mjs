// Drive ONE real, settled x402 USDC payment (Solana mainnet) through every
// paid /api/x402/* surface so the zauth Provider Hub auto-registers each
// endpoint. zauth creates directory entries only from telemetry of settled
// payments — bare 402 challenges and failed X-PAYMENT attempts are ingested
// but never register (verified 2026-06-11: vanity registered 2m47s after the
// on-chain settle at 06:33:55Z on 2026-06-09; 27 unpaid sweeps registered 0).
//
//   node scripts/x402-paid-sweep.mjs [--only model-check,tutor] [--dry]
//
// Wallet: WALLET_PATH env or .secrets/test-registry-wallet.json (needs USDC;
// PayAI is the tx fee payer, so no SOL is spent on the payment itself).
// Each call: bare request → 402 → pick the Solana `exact` requirement →
// partial-sign a TransferChecked with feePayer=PayAI → retry with X-PAYMENT.
// The handler runs BEFORE settle, so inputs must be valid or nothing is
// charged. POST bodies marked BAZAAR are taken from the endpoint's own 402
// bazaar input example — the documented known-good input.
//
// Deliberately excluded: pump-launch (would launch a coin), vanity (already
// registered), pay-by-name / skill-call (not currently 402-serving).
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { Connection, Keypair, PublicKey, Transaction, ComputeBudgetProgram } = require('@solana/web3.js');
const {
	getAssociatedTokenAddressSync, createTransferCheckedInstruction,
	getMint, getAccount, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID,
} = require('@solana/spl-token');
const bs58 = require('bs58');

const BASE = process.env.X402_BASE_URL || 'https://three.ws';
const RPC = process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com';
const WALLET_PATH = process.env.WALLET_PATH || new URL('../.secrets/test-registry-wallet.json', import.meta.url).pathname;
const SOLANA_CAIP2 = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';
const MAX_PRICE_USD = Number(process.env.X402_SWEEP_MAX_PRICE_USD) || 0.3;
const THREE_MINT = 'FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump';
const AGENT_ID = '76bca598-103f-4e3a-8c95-b0d64993258a';
const DUCK_GLB = 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Duck/glTF-Binary/Duck.glb';

const CATALOG = [
	{ name: 'model-check', method: 'GET', path: `/api/x402/model-check?url=${encodeURIComponent(DUCK_GLB)}` },
	{ name: 'dance-tip', method: 'GET', path: '/api/x402/dance-tip?dancer=1&dance=rumba' },
	{ name: 'skill-marketplace', method: 'GET', path: '/api/x402/skill-marketplace?skill=inspect_model&limit=5' },
	{ name: 'symbol-availability', method: 'GET', path: '/api/x402/symbol-availability?ticker=THREE&network=mainnet' },
	// Identity + audit need rows that exist in the production indexes
	// (agent_identities.meta.onchain, pump_agent_mints). Supply them at runtime:
	//   SWEEP_IDENTITY_AGENT / SWEEP_IDENTITY_CHAIN / SWEEP_IDENTITY_MINT
	//   SWEEP_PUMP_MINT
	{
		name: 'onchain-identity-verify', method: 'GET',
		path: process.env.SWEEP_IDENTITY_AGENT
			? `/api/x402/onchain-identity-verify?agent_id=${process.env.SWEEP_IDENTITY_AGENT}&chain=${encodeURIComponent(process.env.SWEEP_IDENTITY_CHAIN || SOLANA_CAIP2)}&contract_or_mint=${process.env.SWEEP_IDENTITY_MINT || ''}`
			: null,
	},
	{ name: 'agent-reputation', method: 'GET', path: `/api/x402/agent-reputation?agent_id=${AGENT_ID}` },
	{ name: 'pump-agent-audit', method: 'GET', path: `/api/x402/pump-agent-audit?mint=${process.env.SWEEP_PUMP_MINT || THREE_MINT}` },
	{ name: 'mint-to-mesh', method: 'GET', path: `/api/x402/mint-to-mesh?mint=${THREE_MINT}` },
	{ name: 'mint-to-mesh-batch', method: 'POST', path: '/api/x402/mint-to-mesh-batch', body: { mints: [THREE_MINT] } },
	{ name: 'asset-download', method: 'GET', path: '/api/x402/asset-download?slug=pole-dancer-rumba' },
	// skin-crimson is the cheapest premium SKU (rare tier); legendary SKUs cost
	// $3 and trip the price cap.
	{ name: 'cosmetic-purchase', method: 'GET', path: '/api/x402/cosmetic-purchase?id=skin-crimson&account=g_5f3c9a21b8' },
	{ name: 'permit2-paid-demo', method: 'GET', path: '/api/x402/permit2-paid-demo' },
	{ name: 'tutor', method: 'POST', path: '/api/x402/tutor', body: 'BAZAAR' },
	// fact-check needs a claim its web search can actually corroborate.
	{ name: 'fact-check', method: 'POST', path: '/api/x402/fact-check', body: { claim: 'The Eiffel Tower is located in Paris, France.' } },
	// crypto-intel reads body.topic (defaults exist, but be explicit).
	{ name: 'crypto-intel', method: 'POST', path: '/api/x402/crypto-intel', body: { topic: 'bitcoin' } },
	// image→3D path: skips the text→image stage (Vertex/Replicate), which is
	// currently failing in production — see report. Draft tier keeps it $0.05.
	{ name: 'forge', method: 'POST', path: '/api/x402/forge', body: { image_urls: ['https://three.ws/accessories/thumbs/hat-baseball.png'], tier: 'draft' } },
];

function loadKeypair() {
	const raw = JSON.parse(readFileSync(WALLET_PATH, 'utf8'));
	const dec = bs58.default ? bs58.default.decode : bs58.decode;
	if (Array.isArray(raw)) return Keypair.fromSecretKey(Uint8Array.from(raw));
	if (raw.secretKeyArray) return Keypair.fromSecretKey(Uint8Array.from(raw.secretKeyArray));
	if (raw.secretKeyBase58) return Keypair.fromSecretKey(dec(raw.secretKeyBase58));
	throw new Error('unrecognized wallet file shape');
}

function pickSolanaRequirement(envelope) {
	const accepts = envelope.accepts || [];
	return (
		accepts.find((a) => a.scheme === 'exact' && a.network === SOLANA_CAIP2) ||
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

	const acct = await getAccount(connection, senderAta);
	if (acct.amount < amount) {
		throw new Error(`insufficient USDC: have ${Number(acct.amount) / 1e6}, need ${Number(amount) / 1e6}`);
	}
	const receiverInfo = await connection.getAccountInfo(receiverAta);
	if (!receiverInfo) throw new Error(`receiver ATA ${receiverAta.toBase58()} does not exist`);

	const tx = new Transaction();
	const { blockhash } = await connection.getLatestBlockhash('confirmed');
	tx.recentBlockhash = blockhash;
	tx.feePayer = feePayer;
	tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 20_000 }));
	tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1 }));
	tx.add(createTransferCheckedInstruction(senderAta, mint, receiverAta, payer, amount, mintInfo.decimals, [], TOKEN_PROGRAM_ID));
	tx.partialSign(kp);
	return Buffer.from(tx.serialize({ requireAllSignatures: false, verifySignatures: false })).toString('base64');
}

async function payEndpoint({ kp, connection, entry }) {
	const url = BASE + entry.path;
	const baseHeaders = { 'user-agent': 'three.ws-x402-paid-sweep' };

	// 1. Draw the 402 (no cost) for requirements + the documented input example.
	// Probe with the REAL body when we have one — endpoints that price per
	// request shape (forge tiers) must see the same body in the challenge and
	// the paid call, or verify fails with amount_mismatch.
	const probeInit = { method: entry.method, headers: { ...baseHeaders } };
	if (entry.method === 'POST') {
		probeInit.headers['content-type'] = 'application/json';
		probeInit.body = entry.body && entry.body !== 'BAZAAR' ? JSON.stringify(entry.body) : '{}';
	}
	const probe = await fetch(url, { ...probeInit, signal: AbortSignal.timeout(30_000) });
	if (probe.status !== 402) {
		return { name: entry.name, status: 'skip', detail: `probe returned ${probe.status}, expected 402` };
	}
	const envelope = await probe.json();
	const requirement = pickSolanaRequirement(envelope);
	if (!requirement) return { name: entry.name, status: 'skip', detail: 'no Solana accepts entry' };
	const priceUsd = Number(requirement.amount) / 1e6;
	if (priceUsd > MAX_PRICE_USD) {
		return { name: entry.name, status: 'skip', detail: `price $${priceUsd} exceeds cap $${MAX_PRICE_USD}` };
	}

	let body = entry.body;
	if (body === 'BAZAAR') {
		body = envelope.extensions?.bazaar?.info?.input?.body;
		if (!body) return { name: entry.name, status: 'skip', detail: 'no bazaar example body in 402' };
	}

	// 2. Build + partial-sign the USDC transfer, retry with X-PAYMENT.
	const txBase64 = await buildAndSignTransferTx({ kp, connection, requirement });
	const paymentPayload = {
		x402Version: 2,
		scheme: 'exact',
		network: requirement.network,
		resource: {
			url: envelope.resource?.url || url,
			mimeType: envelope.resource?.mimeType || 'application/json',
		},
		accepted: requirement,
		payload: { transaction: txBase64 },
	};
	const headers = { ...baseHeaders, 'X-PAYMENT': Buffer.from(JSON.stringify(paymentPayload)).toString('base64') };
	const init = { method: entry.method, headers, signal: AbortSignal.timeout(180_000) };
	if (entry.method === 'POST') {
		headers['content-type'] = 'application/json';
		init.body = typeof body === 'string' ? body : JSON.stringify(body || {});
	}
	const t0 = Date.now();
	const res = await fetch(url, init);
	const dt = Date.now() - t0;
	const text = await res.text().catch(() => '');

	if (res.status !== 200) {
		return { name: entry.name, status: 'fail', detail: `${res.status} in ${dt}ms: ${text.slice(0, 160)}` };
	}
	let settleTx = null;
	const settleHeader = res.headers.get('x-payment-response');
	if (settleHeader) {
		try {
			const decoded = JSON.parse(Buffer.from(settleHeader, 'base64').toString('utf8'));
			settleTx = decoded.transaction || decoded.txHash || decoded.signature || null;
		} catch {}
	}
	return { name: entry.name, status: 'paid', priceUsd, ms: dt, settleTx };
}

const onlyArg = process.argv.indexOf('--only');
const only = onlyArg >= 0 ? new Set(process.argv[onlyArg + 1].split(',')) : null;
const dry = process.argv.includes('--dry');

const kp = loadKeypair();
const connection = new Connection(RPC, 'confirmed');
const senderAta = getAssociatedTokenAddressSync(
	new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'), kp.publicKey, false,
	TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID,
);
const startBal = Number((await getAccount(connection, senderAta)).amount) / 1e6;
console.log(`buyer ${kp.publicKey.toBase58()} — ${startBal} USDC\n`);

const results = [];
for (const entry of CATALOG) {
	if (!entry.path) { console.log(`· skip ${entry.name} — runtime inputs not provided`); continue; }
	if (only && !only.has(entry.name)) continue;
	if (dry) { console.log(`DRY ${entry.method} ${entry.path}`); continue; }
	try {
		const r = await payEndpoint({ kp, connection, entry });
		results.push(r);
		const tag = r.status === 'paid' ? `✓ paid $${r.priceUsd} in ${r.ms}ms` : `· ${r.status}: ${r.detail}`;
		console.log(`${tag}  ${entry.name}${r.settleTx ? `  tx:${r.settleTx.slice(0, 20)}…` : ''}`);
	} catch (err) {
		results.push({ name: entry.name, status: 'fail', detail: err.message });
		console.log(`✗ fail  ${entry.name} — ${err.message}`);
	}
	await new Promise((r) => setTimeout(r, 1500));
}

const paid = results.filter((r) => r.status === 'paid');
const endBal = Number((await getAccount(connection, senderAta)).amount) / 1e6;
console.log(`\npaid ${paid.length}/${results.length} — spent $${(startBal - endBal).toFixed(6)} USDC (balance ${endBal})`);
for (const r of results.filter((x) => x.status !== 'paid')) console.log(`  unpaid: ${r.name} — ${r.detail}`);
