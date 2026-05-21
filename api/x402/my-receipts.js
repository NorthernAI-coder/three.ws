// GET /api/x402/my-receipts?address=0x...&signature=0x...&issuedAt=<iso>&sinceUnix=<n>
//
// Buyer-side read endpoint for the x402 Offer & Receipt extension (USE-17).
// Returns every signed receipt we issued to the requested wallet so a buyer
// can re-fetch their proof-of-purchase artifacts long after the original
// payment-response header was dropped from their client.
//
// Authentication: the buyer signs a personal_sign message proving control of
// the wallet whose receipts they're requesting. We recover the signer with
// viem.verifyMessage; if the recovered address matches `address`, we return
// the receipt log entries. The signed message includes an `issuedAt` ISO
// timestamp so old signatures can't be replayed indefinitely (5-minute window).
//
// This is EVM-only for now. Solana-payer receipts ARE stored (the receipt log
// is network-agnostic) but querying them needs a Solana signature flow that
// isn't wired up here yet — a follow-up endpoint can hit the same storage
// helper with `payer=<solana-address>`.

import { createPublicClient, http } from 'viem';
import { mainnet } from 'viem/chains';

import { cors, error, json, method } from '../_lib/http.js';
import { limits, clientIp } from '../_lib/rate-limit.js';
import { listReceiptsForPayer } from '../_lib/x402/receipt-storage.js';

const MAX_AGE_SECONDS = 300;

// Lightweight viem client used purely for verifyMessage (which works for EOAs
// and EIP-1271 contract signatures). Mainnet RPC is fine — verifyMessage only
// hits the chain for contract-wallet sigs, and we use the public default.
let _client;
function getClient() {
	if (!_client) _client = createPublicClient({ chain: mainnet, transport: http() });
	return _client;
}

function buildExpectedMessage(address, issuedAt) {
	return `three.ws x402 receipts read\nAddress: ${address.toLowerCase()}\nIssued At: ${issuedAt}`;
}

function withinFreshnessWindow(issuedAt) {
	const ts = Date.parse(issuedAt);
	if (!Number.isFinite(ts)) return false;
	const ageSec = (Date.now() - ts) / 1000;
	return ageSec >= 0 && ageSec <= MAX_AGE_SECONDS;
}

export default async function handler(req, res) {
	if (cors(req, res, { methods: 'GET,OPTIONS', origins: '*' })) return;
	if (!method(req, res, ['GET'])) return;

	const rl = await limits.publicIp(clientIp(req));
	if (!rl.success) return error(res, 429, 'rate_limited', 'too many requests');

	const url = new URL(req.url, 'http://x');
	const address = String(url.searchParams.get('address') || '').trim();
	const signature = String(url.searchParams.get('signature') || '').trim();
	const issuedAt = String(url.searchParams.get('issuedAt') || '').trim();
	const sinceUnix = url.searchParams.get('sinceUnix');
	const limit = url.searchParams.get('limit');

	if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
		return error(res, 400, 'invalid_address', 'address must be an EVM 0x-hex address');
	}
	if (!/^0x[a-fA-F0-9]+$/.test(signature)) {
		return error(res, 400, 'invalid_signature', 'signature must be 0x-hex');
	}
	if (!issuedAt || !withinFreshnessWindow(issuedAt)) {
		return error(
			res,
			401,
			'stale_signature',
			`issuedAt must be a recent ISO timestamp (within ${MAX_AGE_SECONDS}s)`,
		);
	}

	const message = buildExpectedMessage(address, issuedAt);
	let valid;
	try {
		valid = await getClient().verifyMessage({ address, message, signature });
	} catch (err) {
		return error(res, 400, 'signature_check_failed', err.message);
	}
	if (!valid) {
		return error(
			res,
			401,
			'invalid_signature',
			'signature does not recover to the requested address',
		);
	}

	let rows;
	try {
		rows = await listReceiptsForPayer({ payer: address, sinceUnix, limit });
	} catch (err) {
		return error(res, 502, 'receipt_query_failed', err.message);
	}

	json(res, 200, {
		address: address.toLowerCase(),
		count: rows.length,
		receipts: rows,
	});
}
