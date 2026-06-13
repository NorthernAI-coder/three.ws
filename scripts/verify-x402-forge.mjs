// End-to-end verification of the paid generation path: pays /api/x402/forge
// in USDC on Solana mainnet with the official @x402 client, then polls the
// returned job to a finished GLB and checks its binary glTF magic. This is the
// exact flow an autonomous agent buys, so nothing is mocked.
//
//   WALLET_PATH=~/.config/x402-test-wallets/solana.json \
//     node scripts/verify-x402-forge.mjs [--tier draft] [--prompt "..."]
//
// stdout: JSON result { job_id, glb_url, bytes, settle }. stderr: progress.

import { readFileSync } from 'node:fs';
import { createKeyPairSignerFromBytes } from '@solana/kit';
import { wrapFetchWithPayment, x402Client } from '@x402/fetch';
import { registerExactSvmScheme } from '@x402/svm/exact/client';
import bs58 from 'bs58';

const ORIGIN = process.env.FORGE_ORIGIN || 'https://three.ws';
const RPC = process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com';
const WALLET_PATH =
	process.env.WALLET_PATH ||
	`${process.env.HOME}/.config/x402-test-wallets/solana.json`;

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
	const i = argv.indexOf(`--${name}`);
	return i >= 0 ? argv[i + 1] : fallback;
};
const TIER = arg('tier', 'draft');
const PROMPT = arg('prompt', 'a small brass desk bell with a wooden base');
const POLL_INTERVAL_MS = 5_000;
const POLL_DEADLINE_MS = 5 * 60 * 1000;

function loadSecretKeyBytes() {
	const raw = readFileSync(WALLET_PATH, 'utf8').trim();
	const dec = bs58.default ? bs58.default.decode : bs58.decode;
	if (raw.startsWith('[')) return Uint8Array.from(JSON.parse(raw));
	return dec(raw);
}

const signer = await createKeyPairSignerFromBytes(loadSecretKeyBytes());
console.error(`payer: ${signer.address}`);

const client = new x402Client();
registerExactSvmScheme(client, { signer, config: { rpcUrl: RPC } });
const fetchWithPay = wrapFetchWithPayment(globalThis.fetch, client);

console.error(`paying ${TIER} generation → ${ORIGIN}/api/x402/forge`);
const t0 = Date.now();
const res = await fetchWithPay(`${ORIGIN}/api/x402/forge`, {
	method: 'POST',
	headers: { 'content-type': 'application/json' },
	body: JSON.stringify({ prompt: PROMPT, tier: TIER }),
});
const submitText = await res.text();
console.error(`paid submit: HTTP ${res.status} in ${Date.now() - t0}ms`);
let settle = null;
const settleHeader = res.headers.get('x-payment-response');
if (settleHeader) {
	try {
		settle = JSON.parse(Buffer.from(settleHeader, 'base64').toString('utf8'));
		console.error(`settle: ${JSON.stringify(settle)}`);
	} catch {
		// non-JSON settle header — keep going, the job result is the real proof
	}
}
if (res.status !== 200) {
	console.error(`FAIL: submit body: ${submitText.slice(0, 1500)}`);
	process.exit(1);
}
const submit = JSON.parse(submitText);

let { job_id: jobId, status, glb_url: glbUrl } = submit;
console.error(`job: ${jobId || '(synchronous)'} status: ${status}`);
const deadline = Date.now() + POLL_DEADLINE_MS;
while (status !== 'done' && jobId && Date.now() < deadline) {
	await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
	const poll = await fetch(`${ORIGIN}/api/forge?job=${encodeURIComponent(jobId)}`);
	const body = await poll.json().catch(() => ({}));
	status = body.status;
	glbUrl = body.glb_url || glbUrl;
	if (status === 'failed') {
		console.error(`FAIL: job failed: ${body.error || 'no detail'}`);
		process.exit(1);
	}
	console.error(`poll: ${status}`);
}
if (status !== 'done' || !glbUrl) {
	console.error(`FAIL: job did not finish (status: ${status})`);
	process.exit(1);
}

const glbRes = await fetch(glbUrl, { headers: { range: 'bytes=0-3' } });
const bytes = new Uint8Array(await glbRes.arrayBuffer());
const magic = String.fromCharCode(...bytes.slice(0, 4));
if (magic !== 'glTF') {
	console.error(`FAIL: GLB magic was "${magic}"`);
	process.exit(1);
}
const head = await fetch(glbUrl, { method: 'HEAD' });
const size = Number(head.headers.get('content-length') || 0);
console.error(`GLB verified: ${glbUrl} (${size} bytes)`);
process.stdout.write(
	JSON.stringify({ job_id: jobId || null, glb_url: glbUrl, bytes: size, settle }, null, 2) + '\n',
);
