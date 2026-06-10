// Exercise every paid x402 endpoint on three.ws end-to-end from a funded EVM
// wallet on Base. For each endpoint: GET the 402 challenge, sign the EIP-3009
// TransferWithAuthorization, retry with X-PAYMENT, capture the response +
// settlement receipt. Prints a summary table at the end.
//
// Costs are billed in USDC on Base (eip155:8453) — a funded payer wallet holds
// the USDC; the facilitator covers ETH gas. The handler runs BEFORE settle, so
// a 4xx from the route's validation logic means no USDC was moved.
//
// Provide the payer key via the X402_PAYER_PRIVATE_KEY env var — never hardcode
// it here (a committed key is a leaked key).

import { Wallet, randomBytes, hexlify } from 'ethers';

const PRIVATE_KEY = process.env.X402_PAYER_PRIVATE_KEY;
if (!PRIVATE_KEY) {
	console.error('Set X402_PAYER_PRIVATE_KEY to a funded Base wallet key before running.');
	process.exit(1);
}
const BASE = 'https://three.ws';
const wallet = new Wallet(PRIVATE_KEY);

const ENDPOINTS = [
	{ name: 'model-check',            path: '/api/x402/model-check?url=https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Duck/glTF-Binary/Duck.glb', method: 'GET' },
	{ name: 'dance-tip',              path: '/api/x402/dance-tip?dancer=1&dance=rumba', method: 'GET' },
	{ name: 'skill-marketplace',      path: '/api/x402/skill-marketplace?skill=inspect_model&limit=5', method: 'GET' },
	{ name: 'symbol-availability',    path: '/api/x402/symbol-availability?ticker=HELIO&network=mainnet', method: 'GET' },
	{ name: 'onchain-identity-verify',path: '/api/x402/onchain-identity-verify?address=0x33369135724F53521dF38e69262792a1EC068cd7', method: 'GET' },
	{ name: 'agent-reputation',       path: '/api/x402/agent-reputation?agent_id=7b9a4f30-2d11-4e2d-9d12-1cdb1f6a3a55', method: 'GET' },
	{ name: 'pump-agent-audit',       path: '/api/x402/pump-agent-audit?mint=C3vQABCDEFGHJKLMNopqrstuvwxyZ12345abcdefghi', method: 'GET' },
	{ name: 'mint-to-mesh',           path: '/api/x402/mint-to-mesh?mint=DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', method: 'GET' },
	{ name: 'mint-to-mesh-batch',     path: '/api/x402/mint-to-mesh-batch', method: 'POST', body: { mints: ['DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263'] } },
];

const results = [];

function fmtAmount(atomics) {
	return '$' + (Number(atomics) / 1_000_000).toFixed(3);
}

async function callOne({ name, path, method, body }) {
	const url = `${BASE}${path}`;
	// Step 1: 402 challenge.
	const headers0 = { accept: 'application/json' };
	if (method === 'POST') headers0['content-type'] = 'application/json';
	const init0 = { method, headers: headers0, cache: 'no-store' };
	if (body) init0.body = JSON.stringify(body);
	const r0 = await fetch(url, init0);
	if (r0.status !== 402) {
		return { name, ok: false, step: 'challenge', status: r0.status, detail: (await r0.text()).slice(0, 200) };
	}
	const challenge = JSON.parse(Buffer.from(r0.headers.get('payment-required'), 'base64').toString());
	const accept = challenge.accepts.find((a) => a.network === 'eip155:8453' && a.scheme === 'exact');
	if (!accept) return { name, ok: false, step: 'no-base-accept', detail: 'endpoint does not advertise Base mainnet exact' };

	// Step 2: sign EIP-3009.
	const now = Math.floor(Date.now() / 1000);
	const authorization = {
		from: wallet.address,
		to: accept.payTo,
		value: accept.amount,
		validAfter: String(now - 600),
		validBefore: String(now + Math.max(60, accept.maxTimeoutSeconds || 60)),
		nonce: hexlify(randomBytes(32)),
	};
	const domain = { name: accept.extra.name, version: accept.extra.version, chainId: 8453, verifyingContract: accept.asset };
	const types = {
		TransferWithAuthorization: [
			{ name: 'from', type: 'address' },
			{ name: 'to', type: 'address' },
			{ name: 'value', type: 'uint256' },
			{ name: 'validAfter', type: 'uint256' },
			{ name: 'validBefore', type: 'uint256' },
			{ name: 'nonce', type: 'bytes32' },
		],
	};
	const signature = await wallet.signTypedData(domain, types, authorization);
	const payment = {
		x402Version: 2,
		payload: { authorization, signature },
		extensions: challenge.extensions || {},
		resource: challenge.resource,
		accepted: accept,
	};
	const xPayment = Buffer.from(JSON.stringify(payment)).toString('base64');

	// Step 3: retry with X-PAYMENT.
	const init1 = { method, headers: { ...headers0, 'X-PAYMENT': xPayment }, cache: 'no-store' };
	if (body) init1.body = JSON.stringify(body);
	const r1 = await fetch(url, init1);
	const xpr = r1.headers.get('x-payment-response');
	let receipt = null;
	if (xpr) {
		try { receipt = JSON.parse(Buffer.from(xpr, 'base64').toString()); } catch {}
	}
	let respBody = null;
	const ct = r1.headers.get('content-type') || '';
	if (ct.includes('json')) {
		try { respBody = await r1.json(); } catch { respBody = null; }
	} else {
		respBody = (await r1.text()).slice(0, 200);
	}
	return {
		name,
		ok: r1.status === 200,
		status: r1.status,
		priceAtomics: accept.amount,
		priceUsd: fmtAmount(accept.amount),
		tx: receipt?.transaction || null,
		payer: receipt?.payer || null,
		body: respBody,
	};
}

console.log('Payer wallet :', wallet.address);
console.log('Network      : Base mainnet (eip155:8453)');
console.log('');

let totalCharged = 0n;
for (const ep of ENDPOINTS) {
	process.stdout.write(`→ ${ep.name.padEnd(28)} `);
	try {
		const r = await callOne(ep);
		results.push(r);
		const tag = r.ok ? 'OK  ' : 'FAIL';
		const tx = r.tx ? r.tx.slice(0, 10) + '…' : '(no settle)';
		console.log(`${tag} status=${r.status} price=${r.priceUsd ?? '-'} tx=${tx}`);
		if (r.ok && r.priceAtomics) totalCharged += BigInt(r.priceAtomics);
		if (!r.ok) {
			console.log(`     body: ${typeof r.body === 'object' ? JSON.stringify(r.body).slice(0, 240) : String(r.body).slice(0, 240)}`);
		}
	} catch (err) {
		results.push({ name: ep.name, ok: false, step: 'exception', detail: err.message });
		console.log(`EXCEPTION ${err.message}`);
	}
	await new Promise((r) => setTimeout(r, 800)); // gentle pacing
}

console.log('\n=== Summary ===');
console.log(`Endpoints tested  : ${ENDPOINTS.length}`);
console.log(`Successful (200)  : ${results.filter((r) => r.ok).length}`);
console.log(`Settled USDC      : $${(Number(totalCharged) / 1_000_000).toFixed(6)} (${totalCharged} atomic)`);
console.log('');
for (const r of results) {
	const status = r.ok ? '✓' : '✗';
	const summary = r.ok
		? (typeof r.body === 'object' ? Object.keys(r.body || {}).slice(0, 6).join(',') : '')
		: (r.step || `status=${r.status}`);
	console.log(`  ${status} ${r.name.padEnd(28)} ${r.priceUsd?.padStart(8) || '       -'}  ${summary}`);
}
