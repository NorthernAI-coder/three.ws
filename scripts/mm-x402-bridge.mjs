#!/usr/bin/env node
// mm-x402-bridge — local bridge between the /play/agent-wallet demo page and
// the MetaMask Agentic CLI (`mm`).
//
// The MetaMask agent wallet lives in the developer's shell session (server-
// wallet mode, authenticated via `mm login`), so a browser page can't reach it
// directly. This bridge exposes the three operations the demo needs over
// localhost HTTP:
//
//   GET  /status                 → wallet address/mode + balances (mm wallet show/balance)
//   GET  /quote?endpoint=<url>   → the endpoint's real 402 challenge, parsed
//   POST /pay {endpoint,method,body} → SSE stream of a REAL x402 payment:
//        challenge → signing → signed → submitting → done|error
//
// The payment is the standard x402 v2 EIP-3009 flow on Base mainnet
// (eip155:8453): the bridge fetches the 402 challenge, asks the mm CLI to sign
// the USDC TransferWithAuthorization typed data (`mm wallet sign-typed-data`),
// then retries the request with the X-PAYMENT header. Settlement happens
// server-side at the paid endpoint via its facilitator — real USDC moves.
//
// Safety rails (this listens on localhost, where any local page could reach it):
//   • Target endpoints must be on an allowlisted origin (three.ws + local dev).
//   • Per-payment cap, default $0.10 USDC (MM_BRIDGE_MAX_USDC_MICROS).
//   • CORS restricted to local dev origins + *.app.github.dev.
//
// Run: node scripts/mm-x402-bridge.mjs   (or: npm run demo:agent-wallet-bridge)

import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';

const PORT = Number(process.env.MM_BRIDGE_PORT) || 4402;
const MAX_USDC_MICROS = BigInt(process.env.MM_BRIDGE_MAX_USDC_MICROS || '100000'); // $0.10
const BASE_NETWORK = 'eip155:8453';
const BASE_CHAIN_ID = 8453;

// Origins a target paid endpoint may live on. The demo pays three.ws's own
// x402 endpoints; local dev lets you point at `vercel dev`/vite proxies.
const ALLOWED_ENDPOINT_ORIGINS = (
	process.env.MM_BRIDGE_ALLOWED_ENDPOINT_ORIGINS ||
	'https://three.ws,http://localhost:3000,http://127.0.0.1:3000'
)
	.split(',')
	.map((s) => s.trim())
	.filter(Boolean);

// Browser origins allowed to call the bridge (the demo page).
function corsOriginAllowed(origin) {
	if (!origin) return false;
	try {
		const u = new URL(origin);
		if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') return true;
		if (u.hostname.endsWith('.app.github.dev')) return true;
		if (origin === 'https://three.ws') return true;
		return false;
	} catch {
		return false;
	}
}

// ── mm CLI ────────────────────────────────────────────────────────────────

// Run an mm command with --json and parse the JSON object out of stdout.
// The CLI prints human lines (e.g. "Intent: …") before the JSON, so parse
// from the first `{`.
function mm(args, { timeoutMs = 120_000 } = {}) {
	return new Promise((resolvePromise, reject) => {
		execFile('mm', [...args, '--json'], { timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
			const raw = String(stdout || '');
			const jsonStart = raw.indexOf('{');
			if (jsonStart === -1) {
				return reject(new Error(`mm ${args[0]} produced no JSON output${err ? `: ${err.message}` : ''}${stderr ? ` — ${String(stderr).slice(0, 300)}` : ''}`));
			}
			let parsed;
			try {
				parsed = JSON.parse(raw.slice(jsonStart));
			} catch (parseErr) {
				return reject(new Error(`mm ${args[0]} output parse failed: ${parseErr.message}`));
			}
			if (parsed.ok === false) {
				return reject(new Error(`mm ${args[0]} failed: ${parsed.error?.message || parsed.error || 'unknown error'}`));
			}
			resolvePromise(parsed.data ?? parsed);
		});
	});
}

let statusCache = null; // { at, payload }
async function walletStatus() {
	if (statusCache && Date.now() - statusCache.at < 10_000) return statusCache.payload;
	const [show, balance] = await Promise.all([mm(['wallet', 'show']), mm(['wallet', 'balance'])]);
	const payload = {
		ok: true,
		wallet: {
			address: show.address,
			mode: show.mode,
			chainNamespace: show.chainNamespace,
			policies: show.policies || show['policies[2]'] || null,
		},
		balance: {
			currency: balance.currency,
			totalValue: balance.totalValue,
			chains: balance.chains || [],
		},
	};
	statusCache = { at: Date.now(), payload };
	return payload;
}

// ── x402 client flow (mirrors public/x402.js, the platform's browser payer) ──

function endpointAllowed(endpoint) {
	try {
		const u = new URL(endpoint);
		return ALLOWED_ENDPOINT_ORIGINS.includes(u.origin);
	} catch {
		return false;
	}
}

function isEip3009BaseAccept(a) {
	return (
		a &&
		a.scheme === 'exact' &&
		a.network === BASE_NETWORK &&
		(!a.extra?.assetTransferMethod || a.extra.assetTransferMethod === 'eip3009')
	);
}

async function fetch402(endpoint, method, body) {
	const res = await fetch(endpoint, {
		method,
		headers: { accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}) },
		body: body ? JSON.stringify(body) : undefined,
	});
	if (res.status !== 402) {
		const text = (await res.text()).slice(0, 300);
		throw new Error(`expected a 402 challenge from ${endpoint}, got ${res.status}: ${text}`);
	}
	const challenge = await res.json();
	if (!Array.isArray(challenge?.accepts) || !challenge.accepts.length) {
		throw new Error('402 challenge has no accepts[] entries');
	}
	const accept = challenge.accepts.find(isEip3009BaseAccept);
	if (!accept) {
		throw new Error(`endpoint does not accept EIP-3009 USDC on Base (${BASE_NETWORK})`);
	}
	return { challenge, accept };
}

// ERC-8021 builder-code echo — the server rejects payments that don't echo the
// declared app code. Self-attribute this bridge as the wallet/service pair.
const BUILDER_CODE_PATTERN = /^[a-z0-9_]{1,32}$/;
function builderCodeEcho(challenge) {
	const declaredA = challenge?.extensions?.['builder-code']?.info?.a;
	if (!declaredA || !BUILDER_CODE_PATTERN.test(declaredA)) return null;
	return { a: declaredA, w: 'metamask_agent', s: ['mm_x402_bridge'] };
}

function buildTypedData({ accept, payerAddress }) {
	const validAfter = 0;
	const validBefore = Math.floor(Date.now() / 1000) + (accept.maxTimeoutSeconds || 600);
	const nonce = '0x' + randomBytes(32).toString('hex');
	return {
		typedData: {
			primaryType: 'TransferWithAuthorization',
			types: {
				EIP712Domain: [
					{ name: 'name', type: 'string' },
					{ name: 'version', type: 'string' },
					{ name: 'chainId', type: 'uint256' },
					{ name: 'verifyingContract', type: 'address' },
				],
				TransferWithAuthorization: [
					{ name: 'from', type: 'address' },
					{ name: 'to', type: 'address' },
					{ name: 'value', type: 'uint256' },
					{ name: 'validAfter', type: 'uint256' },
					{ name: 'validBefore', type: 'uint256' },
					{ name: 'nonce', type: 'bytes32' },
				],
			},
			domain: {
				name: accept.extra?.name || 'USD Coin',
				version: accept.extra?.version || '2',
				chainId: BASE_CHAIN_ID,
				verifyingContract: accept.asset,
			},
			message: {
				from: payerAddress,
				to: accept.payTo,
				value: accept.amount,
				validAfter,
				validBefore,
				nonce,
			},
		},
		authorization: { validAfter, validBefore, nonce },
	};
}

function fmtUsdc(micros) {
	return '$' + (Number(micros) / 1e6).toFixed(2);
}

async function executePayment({ endpoint, method, body, emit }) {
	// 1. Real 402 challenge from the paid endpoint.
	const { challenge, accept } = await fetch402(endpoint, method, body);
	const amount = BigInt(accept.amount);
	if (amount > MAX_USDC_MICROS) {
		throw new Error(
			`endpoint asks for ${fmtUsdc(accept.amount)} USDC, above the bridge cap of ${fmtUsdc(MAX_USDC_MICROS.toString())} (raise MM_BRIDGE_MAX_USDC_MICROS to allow)`,
		);
	}
	emit({
		stage: 'challenge',
		amount: accept.amount,
		payTo: accept.payTo,
		asset: accept.asset,
		network: accept.network,
		resource: challenge.resource || null,
	});

	// 2. MetaMask agent wallet signs the USDC TransferWithAuthorization.
	const status = await walletStatus();
	const payerAddress = status.wallet.address;
	const { typedData } = buildTypedData({ accept, payerAddress });
	emit({
		stage: 'signing',
		signer: payerAddress,
		domain: typedData.domain,
		primaryType: typedData.primaryType,
		to: accept.payTo,
		value: accept.amount,
	});
	const intent = `Pay ${fmtUsdc(accept.amount)} USDC on Base to ${accept.payTo} for ${endpoint}`;
	const signed = await mm([
		'wallet',
		'sign-typed-data',
		'--chain-id',
		String(BASE_CHAIN_ID),
		'--payload',
		JSON.stringify(typedData),
		'--wait',
		'--intent',
		intent,
	]);
	if (!signed.signature) {
		throw new Error(`mm CLI returned no signature (status: ${signed.status || 'unknown'})`);
	}
	emit({ stage: 'signed', signature: signed.signature, signer: payerAddress });

	// 3. Retry the request with the X-PAYMENT header — the endpoint verifies and
	// settles via its facilitator, then does the paid work.
	const paymentPayload = {
		x402Version: 2,
		scheme: 'exact',
		network: accept.network,
		resource: { url: endpoint, mimeType: 'application/json' },
		accepted: accept,
		payload: { signature: signed.signature, authorization: typedData.message },
	};
	const echo = builderCodeEcho(challenge);
	if (echo) paymentPayload.extensions = { 'builder-code': echo };
	emit({ stage: 'submitting' });

	const paidRes = await fetch(endpoint, {
		method,
		headers: {
			accept: 'application/json',
			'x-payment': Buffer.from(JSON.stringify(paymentPayload), 'utf8').toString('base64'),
			...(body ? { 'content-type': 'application/json' } : {}),
		},
		body: body ? JSON.stringify(body) : undefined,
	});
	const resultText = await paidRes.text();
	let result = null;
	try {
		result = JSON.parse(resultText);
	} catch {
		result = { raw: resultText.slice(0, 1000) };
	}
	if (!paidRes.ok) {
		throw new Error(
			`payment rejected by endpoint (HTTP ${paidRes.status}): ${result?.error?.message || result?.error || resultText.slice(0, 300)}`,
		);
	}
	let settlement = null;
	const settleHeader = paidRes.headers.get('x-payment-response');
	if (settleHeader) {
		try {
			settlement = JSON.parse(Buffer.from(settleHeader, 'base64').toString('utf8'));
		} catch {
			settlement = null;
		}
	}
	emit({
		stage: 'done',
		amount: accept.amount,
		payer: payerAddress,
		payTo: accept.payTo,
		settlement,
		result,
	});
}

// ── HTTP server ───────────────────────────────────────────────────────────

function readBody(req) {
	return new Promise((resolvePromise, reject) => {
		let data = '';
		req.on('data', (c) => {
			data += c;
			if (data.length > 64 * 1024) reject(new Error('request body too large'));
		});
		req.on('end', () => resolvePromise(data));
		req.on('error', reject);
	});
}

function sendJson(res, status, obj) {
	res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
	res.end(JSON.stringify(obj));
}

const server = createServer(async (req, res) => {
	const origin = req.headers.origin;
	if (origin && corsOriginAllowed(origin)) {
		res.setHeader('access-control-allow-origin', origin);
		res.setHeader('vary', 'origin');
		res.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS');
		res.setHeader('access-control-allow-headers', 'content-type');
	}
	if (req.method === 'OPTIONS') {
		res.writeHead(204);
		return res.end();
	}

	const url = new URL(req.url, `http://localhost:${PORT}`);
	try {
		if (req.method === 'GET' && url.pathname === '/status') {
			return sendJson(res, 200, await walletStatus());
		}

		if (req.method === 'GET' && url.pathname === '/quote') {
			const endpoint = url.searchParams.get('endpoint') || '';
			const method = (url.searchParams.get('method') || 'POST').toUpperCase();
			if (!endpointAllowed(endpoint)) {
				return sendJson(res, 400, { ok: false, error: `endpoint origin not allowed (allowed: ${ALLOWED_ENDPOINT_ORIGINS.join(', ')})` });
			}
			const bodyParam = url.searchParams.get('body');
			const probeBody = bodyParam ? JSON.parse(bodyParam) : undefined;
			const { challenge, accept } = await fetch402(endpoint, method, probeBody);
			return sendJson(res, 200, {
				ok: true,
				amount: accept.amount,
				payTo: accept.payTo,
				asset: accept.asset,
				network: accept.network,
				maxTimeoutSeconds: accept.maxTimeoutSeconds,
				resource: challenge.resource || null,
				domainName: accept.extra?.name || 'USD Coin',
			});
		}

		if (req.method === 'POST' && url.pathname === '/pay') {
			const raw = await readBody(req);
			let parsed;
			try {
				parsed = JSON.parse(raw || '{}');
			} catch {
				return sendJson(res, 400, { ok: false, error: 'invalid JSON body' });
			}
			const endpoint = String(parsed.endpoint || '');
			const method = String(parsed.method || 'POST').toUpperCase();
			if (!['GET', 'POST'].includes(method)) {
				return sendJson(res, 400, { ok: false, error: 'method must be GET or POST' });
			}
			if (!endpointAllowed(endpoint)) {
				return sendJson(res, 400, { ok: false, error: `endpoint origin not allowed (allowed: ${ALLOWED_ENDPOINT_ORIGINS.join(', ')})` });
			}
			res.writeHead(200, {
				'content-type': 'text/event-stream; charset=utf-8',
				'cache-control': 'no-store',
				connection: 'keep-alive',
			});
			let lastStage = 'challenge';
			const emit = (evt) => {
				lastStage = evt.stage || lastStage;
				res.write(`data: ${JSON.stringify(evt)}\n\n`);
			};
			try {
				await executePayment({ endpoint, method, body: parsed.body, emit });
			} catch (err) {
				emit({ stage: 'error', failedStage: lastStage, message: err.message });
			}
			return res.end();
		}

		sendJson(res, 404, { ok: false, error: 'not found' });
	} catch (err) {
		if (!res.headersSent) sendJson(res, 500, { ok: false, error: err.message });
		else res.end();
	}
});

server.listen(PORT, '127.0.0.1', () => {
	console.log(`mm-x402 bridge listening on http://127.0.0.1:${PORT}`);
	console.log(`  allowed endpoint origins: ${ALLOWED_ENDPOINT_ORIGINS.join(', ')}`);
	console.log(`  per-payment cap: ${fmtUsdc(MAX_USDC_MICROS.toString())} USDC`);
	walletStatus()
		.then((s) => console.log(`  agent wallet: ${s.wallet.address} (${s.wallet.mode} mode, balance $${s.balance.totalValue})`))
		.catch((e) => console.warn(`  wallet status unavailable: ${e.message} — run \`mm login\``));
});
