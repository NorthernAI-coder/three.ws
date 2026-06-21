#!/usr/bin/env node
// Programmatic end-to-end test of @three-ws/x402-payment-modal, driving the
// package's own server helpers with the throwaway keypair as the signer.
//
//   Test A (live)  — USDC on Solana against https://three.ws/api/mcp ($0.001).
//                    Real PayAI facilitator settles; buyer needs only USDC.
//   Test B (local) — THREE on Solana against the local merchant+settler. No live
//                    endpoint advertises THREE, so we settle it ourselves. Self-
//                    transfer (payTo = buyer) → costs only the SOL network fee.
//
//   node scripts/x402-modal/merchant-server.mjs        # in another terminal (for B)
//   node scripts/x402-modal/run-programmatic.mjs        # both tests
//   node scripts/x402-modal/run-programmatic.mjs --live # only A
//   node scripts/x402-modal/run-programmatic.mjs --local # only B

import { VersionedTransaction } from '@solana/web3.js';
import {
	prepareSolanaCheckout, encodeX402Payment,
} from '../../x402-payment-modal/server/checkout.js';
import { loadBuyer, connection, readBalances, fmt, RPC_URL } from './_lib.mjs';

const args = new Set(process.argv.slice(2));
const runLive = !args.has('--local');
const runLocal = !args.has('--live');
const LOCAL = process.env.LOCAL_MERCHANT || 'http://localhost:8402';
const MCP = 'https://three.ws/api/mcp';

const buyer = loadBuyer();
const conn = connection();
const pub = buyer.publicKey.toBase58();

function signTx(txBase64) {
	const vtx = VersionedTransaction.deserialize(Buffer.from(txBase64, 'base64'));
	vtx.sign([buyer]);
	return Buffer.from(vtx.serialize()).toString('base64');
}

async function explorer(sig) {
	return `https://solscan.io/tx/${sig}`;
}

// ── Test A: live USDC via three.ws + PayAI facilitator ──────────────────────
async function testLiveUsdc() {
	console.log('\n=== Test A — live USDC on Solana via three.ws/api/mcp ===');
	const callBody = {
		jsonrpc: '2.0', id: 1, method: 'tools/call',
		params: { name: 'agent_reputation', arguments: { address: pub } },
	};

	const r1 = await fetch(MCP, {
		method: 'POST',
		headers: { 'content-type': 'application/json', accept: 'application/json' },
		body: JSON.stringify(callBody),
	});
	if (r1.status !== 402) throw new Error(`expected 402, got ${r1.status}`);
	const ch = await r1.json();
	const accept = ch.accepts.find((a) => String(a.network).startsWith('solana:'));
	if (!accept) throw new Error('no Solana accept in challenge');
	console.log(`  402 → pay ${accept.amount} ${accept.extra?.name} to ${accept.payTo}`);
	console.log(`  feePayer (sponsor): ${accept.extra.feePayer}`);

	// PACKAGE: build the unsigned tx the buyer should sign.
	const prepared = await prepareSolanaCheckout({ accept, buyer: pub, rpcUrl: RPC_URL });
	const signed = signTx(prepared.tx_base64); // buyer signs as transfer authority only
	// PACKAGE: wrap into the X-PAYMENT envelope.
	const { x_payment } = encodeX402Payment({ accept, signedTxBase64: signed, resourceUrl: MCP });

	const r2 = await fetch(MCP, {
		method: 'POST',
		headers: { 'content-type': 'application/json', accept: 'application/json', 'x-payment': x_payment },
		body: JSON.stringify(callBody),
	});
	console.log(`  retry with X-PAYMENT → ${r2.status}`);
	const settleHeader = r2.headers.get('x-payment-response');
	const out = await r2.json();
	if (r2.status !== 200) throw new Error(`paid call failed: ${JSON.stringify(out).slice(0, 300)}`);
	if (settleHeader) {
		const rec = JSON.parse(Buffer.from(settleHeader, 'base64').toString('utf8'));
		const sig = rec.transaction || rec.txHash || rec.signature;
		console.log(`  settled on-chain: ${sig}`);
		console.log(`  ${await explorer(sig)}`);
	}
	console.log('  ✓ live USDC payment succeeded; tool result received.');
}

// ── Test B: local THREE self-transfer, settled by the local merchant ─────────
async function testLocalThree() {
	console.log('\n=== Test B — THREE on Solana via local merchant+settler ===');
	const paid = `${LOCAL}/paid`;

	const r1 = await fetch(paid, { headers: { accept: 'application/json' } });
	if (r1.status !== 402) throw new Error(`expected 402 from local /paid, got ${r1.status} — is merchant-server running?`);
	const ch = await r1.json();
	const accept = ch.accepts.find((a) => a.extra?.name === 'THREE');
	if (!accept) throw new Error('no THREE accept advertised by local merchant');
	console.log(`  402 → pay ${accept.amount} THREE to ${accept.payTo} (self)`);

	// PACKAGE server core: prepare via the merchant's /api/x402-checkout.
	const pr = await fetch(`${LOCAL}/api/x402-checkout?action=prepare`, {
		method: 'POST', headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ accept, buyer: pub }),
	});
	const prepared = await pr.json();
	if (!prepared.tx_base64) throw new Error(`prepare failed: ${JSON.stringify(prepared)}`);
	const signed = signTx(prepared.tx_base64); // buyer == feePayer → fully signed

	const en = await fetch(`${LOCAL}/api/x402-checkout?action=encode`, {
		method: 'POST', headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ accept, signed_tx_base64: signed, resource_url: paid }),
	});
	const { x_payment } = await en.json();
	if (!x_payment) throw new Error('encode returned no x_payment');

	const r2 = await fetch(paid, { headers: { accept: 'application/json', 'x-payment': x_payment } });
	const out = await r2.json();
	console.log(`  retry with X-PAYMENT → ${r2.status}`);
	if (r2.status !== 200) throw new Error(`THREE settlement failed: ${JSON.stringify(out)}`);
	const sig = out.settled?.transaction;
	console.log(`  settled on-chain: ${sig}`);
	console.log(`  ${await explorer(sig)}`);
	console.log('  ✓ THREE payment built by the package settled on-chain.');
}

console.log('x402 modal — programmatic e2e');
console.log('  buyer:', pub);
const before = await readBalances(conn, buyer.publicKey);
console.log(`  balances: ${fmt(before.sol, 6)} SOL | ${fmt(before.usdc.ui)} USDC | ${fmt(before.three.ui)} THREE`);

let failed = false;
if (runLive) {
	try { await testLiveUsdc(); } catch (e) { failed = true; console.error('  ✗ Test A failed:', e.message); }
}
if (runLocal) {
	try { await testLocalThree(); } catch (e) { failed = true; console.error('  ✗ Test B failed:', e.message); }
}

const after = await readBalances(conn, buyer.publicKey);
console.log(`\n  balances after: ${fmt(after.sol, 6)} SOL | ${fmt(after.usdc.ui)} USDC | ${fmt(after.three.ui)} THREE`);
console.log(`  spent: ${fmt(before.sol - after.sol, 9)} SOL | ${fmt(before.usdc.ui - after.usdc.ui)} USDC`);
process.exit(failed ? 1 : 0);
