#!/usr/bin/env node
// Local x402 merchant + settler for exercising @three-ws/x402-payment-modal
// end to end against a real chain, including the $THREE path that no live
// three.ws endpoint advertises.
//
// It wires the PUBLISHED package code, not the repo's internal api/_lib:
//   • /api/x402-checkout  → the package's `handleCheckout` (prepare/encode)
//   • /paid               → a real x402 resource: 402 challenge built with the
//                           package's `solanaAccept`, then verify + settle.
//
// Settlement here submits the buyer-signed transaction to RPC itself (a local
// stand-in for the PayAI facilitator). To keep the throwaway wallet whole, the
// challenge sets payTo = feePayer = buyer, so each test is a self-transfer that
// only costs the SOL network fee (+ one-time ATA rent). Static verification
// (mint / amount / recipient / authority) runs before broadcast.
//
//   BUYER=<base58 pubkey> node scripts/x402-modal/merchant-server.mjs
//   # PORT (default 8402), THREE_UI / USDC_UI amounts, SOLANA_RPC_URL all honored

import http from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
	Connection, PublicKey, VersionedTransaction,
} from '@solana/web3.js';
import {
	getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID,
} from '@solana/spl-token';

// The actual published package source.
import {
	solanaAccept, handleCheckout, NETWORK_SOLANA_MAINNET,
} from '../../x402-payment-modal/server/checkout.js';

import { loadBuyer } from './_lib.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8402);
const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const USDC_UI = process.env.USDC_UI || '0.001';
const THREE_UI = process.env.THREE_UI || '1';

// payTo / feePayer = the buyer itself → self-transfer, value never leaves wallet.
const buyer = process.env.BUYER || loadBuyer().publicKey.toBase58();
const conn = new Connection(RPC_URL, 'confirmed');

const TRANSFER_CHECKED = 12; // SPL Token instruction discriminator

function send(res, status, body, headers = {}) {
	const json = Buffer.from(JSON.stringify(body));
	res.writeHead(status, {
		'content-type': 'application/json',
		'access-control-allow-origin': '*',
		'access-control-allow-headers': 'content-type, x-payment',
		'access-control-expose-headers': 'x-payment-response',
		'content-length': json.length,
		...headers,
	});
	res.end(json);
}

function readJson(req) {
	return new Promise((resolve) => {
		let raw = '';
		req.on('data', (c) => (raw += c));
		req.on('end', () => {
			try { resolve(raw ? JSON.parse(raw) : {}); } catch { resolve({}); }
		});
	});
}

function challenge(resourceUrl) {
	const common = { payTo: buyer, feePayer: buyer, maxTimeoutSeconds: 60 };
	return {
		x402Version: 2,
		error: 'Payment required',
		resource: {
			url: resourceUrl,
			description: 'Local x402 self-transfer test — pay in USDC or THREE.',
			mimeType: 'application/json',
		},
		accepts: [
			solanaAccept({ token: 'usdc', uiAmount: USDC_UI, ...common }),
			solanaAccept({ token: 'three', uiAmount: THREE_UI, ...common }),
		],
	};
}

// Decode the X-PAYMENT envelope, statically verify the SPL transfer matches one
// of the advertised accepts, broadcast it, and confirm. Returns the settlement
// record or throws with a human-readable reason.
async function verifyAndSettle(xPaymentB64, resourceUrl) {
	const env = JSON.parse(Buffer.from(xPaymentB64, 'base64').toString('utf8'));
	const accept = env.accepted;
	if (!accept || !accept.asset) throw new Error('envelope missing accepted terms');

	const txBuf = Buffer.from(env.payload.transaction, 'base64');
	const vtx = VersionedTransaction.deserialize(txBuf);
	const msg = vtx.message;
	const keys = msg.staticAccountKeys.map((k) => k.toBase58());

	const mint = new PublicKey(accept.asset);
	const payTo = new PublicKey(accept.payTo);
	// Resolve the owning token program so we derive the matching ATA — THREE is Token-2022.
	const mintInfo = await conn.getAccountInfo(mint, 'confirmed');
	const tokenProgramId = mintInfo?.owner?.equals(TOKEN_2022_PROGRAM_ID) ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
	const receiverAta = getAssociatedTokenAddressSync(
		mint, payTo, false, tokenProgramId, ASSOCIATED_TOKEN_PROGRAM_ID,
	).toBase58();

	let matched = null;
	for (const ix of msg.compiledInstructions) {
		if (keys[ix.programIdIndex] !== tokenProgramId.toBase58()) continue;
		const data = Buffer.from(ix.data);
		if (data.length < 10 || data[0] !== TRANSFER_CHECKED) continue;
		const amount = data.readBigUInt64LE(1);
		const acc = ix.accountKeyIndexes.map((i) => keys[i]);
		const [source, ixMint, dest, owner] = acc; // TransferChecked account order
		if (ixMint !== mint.toBase58()) continue;
		if (dest !== receiverAta) throw new Error(`recipient mismatch: ${dest} != ${receiverAta}`);
		if (amount.toString() !== accept.amount) throw new Error(`amount ${amount} != required ${accept.amount}`);
		matched = { source, dest, owner, amount: amount.toString() };
		break;
	}
	if (!matched) throw new Error('no matching TransferChecked instruction for the advertised accept');

	const signature = await conn.sendRawTransaction(txBuf, { skipPreflight: false, maxRetries: 3 });
	const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash('confirmed');
	await conn.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');

	return {
		success: true,
		network: accept.network || NETWORK_SOLANA_MAINNET,
		transaction: signature,
		payer: matched.owner,
		asset: accept.asset,
		amount: accept.amount,
	};
}

const server = http.createServer(async (req, res) => {
	const u = new URL(req.url, `http://localhost:${PORT}`);

	if (req.method === 'OPTIONS') {
		res.writeHead(204, {
			'access-control-allow-origin': '*',
			'access-control-allow-methods': 'GET,POST,OPTIONS',
			'access-control-allow-headers': 'content-type, x-payment',
		});
		return res.end();
	}

	// Package checkout core: prepare / encode.
	if (u.pathname === '/api/x402-checkout') {
		const body = await readJson(req);
		const out = await handleCheckout({
			action: u.searchParams.get('action'),
			body,
			options: { rpcUrl: RPC_URL },
		});
		return send(res, out.status, out.body);
	}

	// The paid resource.
	if (u.pathname === '/paid') {
		const resourceUrl = `http://localhost:${PORT}/paid`;
		const xPayment = req.headers['x-payment'];
		if (!xPayment) return send(res, 402, challenge(resourceUrl));
		try {
			const settlement = await verifyAndSettle(xPayment, resourceUrl);
			const receipt = Buffer.from(JSON.stringify(settlement)).toString('base64');
			return send(res, 200, {
				message: 'Paid on Solana — thanks!',
				settled: settlement,
			}, { 'x-payment-response': receipt });
		} catch (err) {
			return send(res, 402, { error: 'settlement_failed', error_description: String(err.message || err) });
		}
	}

	// Static test page for the browser modal harness.
	if (u.pathname === '/' || u.pathname === '/index.html') {
		const html = readFileSync(join(__dirname, 'page.html'), 'utf8');
		res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
		return res.end(html);
	}

	// Serve the published modal source so the page imports the real thing.
	if (u.pathname === '/x402.js') {
		const js = readFileSync(join(__dirname, '../../x402-payment-modal/src/index.js'), 'utf8');
		res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' });
		return res.end(js);
	}

	send(res, 404, { error: 'not_found' });
});

server.listen(PORT, () => {
	console.log(`x402 modal merchant+settler on http://localhost:${PORT}`);
	console.log(`  buyer / payTo / feePayer : ${buyer}`);
	console.log(`  checkout core            : /api/x402-checkout?action=prepare|encode`);
	console.log(`  paid resource            : /paid  (USDC ${USDC_UI} | THREE ${THREE_UI})`);
	console.log(`  RPC                      : ${RPC_URL}`);
});
