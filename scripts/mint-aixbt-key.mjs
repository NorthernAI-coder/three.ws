// One-off: mint an aixbt.tech API key via x402 (USDC on Base), using the
// official @x402 client so the payload matches Coinbase CDP's facilitator
// schema exactly. Pays from A2A_PAYER_PRIVATE_KEY in .env.
//
//   node scripts/mint-aixbt-key.mjs [1d|1w|4w]
//
// stdout: the JSON key response (apiKey shown once). stderr: progress.

import { readFileSync } from 'node:fs';

import { createPublicClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';
import { wrapFetchWithPayment, x402Client } from '@x402/fetch';
import { ExactEvmScheme, toClientEvmSigner } from '@x402/evm';

const period = process.argv[2] || '1d';
const url = `https://api.aixbt.tech/x402/v2/api-keys/${period}`;
const BASE_RPC = process.env.BASE_RPC_URL || 'https://mainnet.base.org';

function loadEnv() {
	const raw = readFileSync(new URL('../.env', import.meta.url), 'utf8');
	for (const line of raw.split('\n')) {
		const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
		if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
	}
}

async function main() {
	loadEnv();
	const pk = process.env.A2A_PAYER_PRIVATE_KEY;
	if (!pk) throw new Error('A2A_PAYER_PRIVATE_KEY not set in .env');

	const account = privateKeyToAccount(pk.startsWith('0x') ? pk : `0x${pk}`);
	const publicClient = createPublicClient({ chain: base, transport: http(BASE_RPC) });
	const signer = toClientEvmSigner(account, publicClient);
	console.error(`payer: ${account.address}`);

	const client = new x402Client().register('eip155:8453', new ExactEvmScheme(signer));
	const fetchWithPay = wrapFetchWithPayment(globalThis.fetch, client);

	console.error(`minting ${period} key → ${url}`);
	const res = await fetchWithPay(url, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
	});
	const text = await res.text();
	if (!res.ok) throw new Error(`mint failed ${res.status}: ${text || '(empty)'}`);

	let data;
	try {
		data = JSON.parse(text);
	} catch {
		data = { raw: text };
	}
	process.stdout.write(JSON.stringify(data, null, 2) + '\n');
}

main().catch((err) => {
	console.error(`ERROR: ${err.message}`);
	process.exit(1);
});
