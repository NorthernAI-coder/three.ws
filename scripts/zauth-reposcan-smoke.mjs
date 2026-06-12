// One real, settled x402 USDC payment to zauth's RepoScan endpoint — the
// upstream behind /api/zauth-reposcan and the zauth security agent in /play.
//
//   node scripts/zauth-reposcan-smoke.mjs [--repo owner/repo] [--dry]
//   ZAUTH_SCAN_URL=https://three.ws/api/zauth-reposcan node scripts/zauth-reposcan-smoke.mjs
//
// Uses the official @x402 client (hand-rolled envelopes are rejected by
// zauth's facilitator — verified: sweep-style payloads bounce with an
// instant 402). Logs the exact request header + payload shape the official
// client sends so the pass-through route can stay faithful to it. Wallet:
// WALLET_PATH env or .secrets/test-registry-wallet.json (USDC on Solana
// mainnet; the facilitator pays the tx fee).

import { readFileSync } from 'node:fs';
import { createKeyPairSignerFromBytes } from '@solana/kit';
import { wrapFetchWithPayment, x402Client } from '@x402/fetch';
import { registerExactSvmScheme } from '@x402/svm/exact/client';
import bs58 from 'bs58';

const SCAN_URL = process.env.ZAUTH_SCAN_URL || 'https://api.zauth.inc/x402/reposcan';
const WALLET_PATH = process.env.WALLET_PATH || new URL('../.secrets/test-registry-wallet.json', import.meta.url).pathname;
const RPC = process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com';

const repoArg = process.argv.indexOf('--repo');
const REPO = repoArg >= 0 ? process.argv[repoArg + 1] : 'nirholas/three.ws';
const DRY = process.argv.includes('--dry');

function loadSecretKeyBytes() {
	const raw = JSON.parse(readFileSync(WALLET_PATH, 'utf8'));
	const dec = bs58.default ? bs58.default.decode : bs58.decode;
	if (Array.isArray(raw)) return Uint8Array.from(raw);
	if (raw.secretKeyArray) return Uint8Array.from(raw.secretKeyArray);
	if (raw.secretKeyBase58) return dec(raw.secretKeyBase58);
	throw new Error('unrecognized wallet file shape');
}

// Log every request the payment client makes — header names and (redacted)
// payment payload — so the wire format is documented for the proxy route.
// The wrapper passes Request objects, so read from those, not init.
function loggingFetch(input, init) {
	const req = typeof input === 'string' ? new Request(input, init) : input;
	const names = [...req.headers.keys()];
	console.error(`→ ${req.method} ${req.url} headers: [${names.join(', ')}]`);
	for (const name of names) {
		if (/payment/i.test(name)) {
			const value = req.headers.get(name);
			try {
				const decoded = JSON.parse(Buffer.from(value, 'base64').toString('utf8'));
				if (decoded?.payload?.transaction) decoded.payload.transaction = `<${decoded.payload.transaction.length} chars>`;
				console.error(`  ${name}: ${JSON.stringify(decoded)}`);
			} catch {
				console.error(`  ${name}: <unparsed, ${String(value).length} chars>`);
			}
		}
	}
	return fetch(input, init);
}

// Upstream's input field is repoUrl (a paid 400 told us: "repoUrl is
// required" — the `repo` shorthand bounces AFTER payment middleware).
const body = JSON.stringify({ repoUrl: `https://github.com/${REPO}` });
console.error(`scan target: ${REPO}\nendpoint: ${SCAN_URL}`);

if (DRY) {
	const probe = await fetch(SCAN_URL, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body,
		signal: AbortSignal.timeout(30_000),
	});
	const header = probe.headers.get('payment-required');
	const challenge = header ? JSON.parse(Buffer.from(header, 'base64').toString('utf8')) : await probe.json();
	console.error(`probe: HTTP ${probe.status}`);
	console.log(JSON.stringify(challenge, null, 2));
	process.exit(0);
}

const signer = await createKeyPairSignerFromBytes(loadSecretKeyBytes());
console.error(`payer: ${signer.address}`);

const client = new x402Client();
registerExactSvmScheme(client, { signer, config: { rpcUrl: RPC } });
const fetchWithPay = wrapFetchWithPayment(loggingFetch, client);

const t0 = Date.now();
const res = await fetchWithPay(SCAN_URL, {
	method: 'POST',
	headers: { 'content-type': 'application/json' },
	body,
});
const text = await res.text();
console.error(`\npaid call: HTTP ${res.status} in ${Date.now() - t0}ms`);
const settleHeader = res.headers.get('x-payment-response');
if (settleHeader) {
	try { console.error('settle:', Buffer.from(settleHeader, 'base64').toString('utf8')); } catch {}
}
console.log('body:', text.slice(0, 4000));
if (res.status !== 200) process.exit(1);

// If the scan came back as a polling session, follow it so the full response
// shape (the one the in-game panel renders) is captured in one run.
let parsed = null;
try { parsed = JSON.parse(text); } catch {}
const session = parsed?.sessionToken || parsed?.session_token || parsed?.session || parsed?.token;
if (typeof session === 'string') {
	console.error(`\npolling session ${session.slice(0, 12)}…`);
	const pollBase = SCAN_URL.includes('/api/zauth-reposcan')
		? `${SCAN_URL}?session=${encodeURIComponent(session)}`
		: `${SCAN_URL}/${encodeURIComponent(session)}`;
	for (let i = 0; i < 60; i++) {
		await new Promise((r) => setTimeout(r, 5000));
		const poll = await fetch(pollBase, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(20_000) });
		const pollText = await poll.text();
		let pollBody = null;
		try { pollBody = JSON.parse(pollText); } catch {}
		const status = pollBody?.status || pollBody?.state || `http_${poll.status}`;
		console.error(`  [${i}] ${status}`);
		if (poll.status !== 200 || !pollBody || !/pending|running|processing|queued|scanning|in_progress|analyzing/i.test(String(status))) {
			console.log('final:', pollText.slice(0, 8000));
			break;
		}
	}
}
