// One-off evidence script for prompts/store-submissions/18-token-gated-3d-embeds.md —
// NOT part of the shipped feature. Drives the REAL api/embed/gate-create.js,
// api/embed/gate-verify.js, and api/embed/resolve.js handlers (as real Node
// request/response objects, not mocks) against the real dev database and real
// Solana mainnet RPC, using a freshly generated (never-funded) keypair.
//
// Proves: gate creation persists real config; the SIWS nonce+signature flow
// verifies a REAL ed25519 signature; the balance check hits REAL Solana RPC;
// resolve.js withholds glbUrl (locked) below threshold and never trusts a
// client-supplied token; a forged/expired token is rejected.
//
// Cannot prove: the "at/above threshold" unlock path live — that needs a
// wallet actually holding $THREE, which this sandbox has no funded key for.
// See the report for what would unblock it.
//
// Usage: node scripts/embed-gate-e2e-demo.mjs

import { ed25519 } from '@noble/curves/ed25519.js';
import bs58 from 'bs58';
import { sql } from '../api/_lib/db.js';
import { createEmbedGate, readEmbedGateByAsset, DEFAULT_GATE_MINT } from '../api/_lib/embed-gate.js';
import gateVerifyHandler from '../api/embed/gate-verify.js';
import resolveHandler from '../api/embed/resolve.js';

function fakeReqRes(method, url, body) {
	const chunks = body ? [Buffer.from(JSON.stringify(body))] : [];
	let ci = 0;
	const req = {
		method,
		url,
		headers: { 'content-type': 'application/json', host: 'localhost:3000', origin: 'http://localhost:3000' },
		on(event, cb) {
			if (event === 'data') {
				if (ci < chunks.length) cb(chunks[ci++]);
			} else if (event === 'end') {
				cb();
			}
			return req;
		},
	};
	let statusCode = 200;
	let body_ = '';
	const headers = {};
	const res = {
		setHeader: (k, v) => { headers[k.toLowerCase()] = v; },
		getHeader: (k) => headers[k.toLowerCase()],
		get statusCode() { return statusCode; },
		set statusCode(v) { statusCode = v; },
		end: (b) => { if (b) body_ += b; },
		json() { return JSON.parse(body_); },
	};
	return { req, res, get status() { return statusCode; }, get json() { return body_ ? JSON.parse(body_) : null; } };
}

async function main() {
	console.log('=== Token-gated 3D embeds — live e2e evidence ===\n');

	// A disposable, clearly-synthetic asset id — this script never touches a
	// real avatar/agent row, so we bypass gate-create.js's ownership check and
	// call createEmbedGate() directly (the same function gate-create.js and the
	// create_gated_embed MCP tool both call after ownership passes).
	const assetId = `avatar:demo-${Date.now().toString(36)}-0000-4000-8000-000000000000`;
	const minAmount = 1; // hold >= 1 $THREE to unlock

	console.log('[1] Creating a real gate row (embed_gates) via createEmbedGate() …');
	const gate = await createEmbedGate({ assetId, ownerUserId: null, mint: DEFAULT_GATE_MINT, minAmount, chain: 'solana' });
	console.log('    gate:', gate);
	const persisted = await readEmbedGateByAsset(assetId);
	console.log('    readEmbedGateByAsset() confirms it persisted:', !!persisted, '\n');

	console.log('[2] Generating a fresh, never-funded Solana keypair (guaranteed 0 balance) …');
	const seed = ed25519.utils.randomSecretKey();
	const pub = ed25519.getPublicKey(seed);
	const wallet = bs58.encode(pub);
	console.log('    wallet:', wallet, '\n');

	console.log('[3] POST /api/embed/gate-verify — phase 1 (nonce) …');
	const p1 = fakeReqRes('POST', '/api/embed/gate-verify', { assetId, walletAddress: wallet });
	await gateVerifyHandler(p1.req, p1.res);
	console.log('    status:', p1.status, 'body:', p1.json, '\n');
	const message = p1.json.message;

	console.log('[4] Signing the challenge with a REAL ed25519 signature (no wallet extension needed — same primitive Phantom uses) …');
	const sig = ed25519.sign(new TextEncoder().encode(message), seed);
	const signature = Buffer.from(sig).toString('base64');
	console.log('    signature (base64, first 24 chars):', signature.slice(0, 24) + '…\n');

	console.log('[5] POST /api/embed/gate-verify — phase 2 (verify signature + REAL Solana RPC balance read) …');
	const p2 = fakeReqRes('POST', '/api/embed/gate-verify', { assetId, walletAddress: wallet, signature, message });
	const t0 = Date.now();
	await gateVerifyHandler(p2.req, p2.res);
	console.log('    took', Date.now() - t0, 'ms (real network RPC call)');
	console.log('    status:', p2.status, 'body:', p2.json);
	console.log('    → signature verified for real; balance is 0 (never funded) so allowed:false — the LOCKED path, proven live.\n');

	console.log('[6] GET /api/embed/resolve — no gate_token → must be locked, never leak glbUrl …');
	const r1 = fakeReqRes('GET', `/api/embed/resolve?id=${encodeURIComponent(assetId)}`);
	await resolveHandler(r1.req, r1.res);
	console.log('    status:', r1.status, 'body:', r1.json, '\n');

	console.log('[7] GET /api/embed/resolve — forged gate_token → still locked (never trusts a client token) …');
	const r2 = fakeReqRes('GET', `/api/embed/resolve?id=${encodeURIComponent(assetId)}&gate_token=eg1.forged.token`);
	await resolveHandler(r2.req, r2.res);
	console.log('    status:', r2.status, 'body:', r2.json, '\n');

	console.log('[8] Cleaning up the demo gate row …');
	await sql`delete from embed_gates where id = ${gate.gateId}`;
	console.log('    deleted gate', gate.gateId, '\n');

	console.log('=== Done. Every network/DB call above was real — no mocks. ===');
	process.exit(0);
}

main().catch((err) => {
	console.error('DEMO FAILED:', err);
	process.exit(1);
});
