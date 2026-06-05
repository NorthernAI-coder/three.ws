// GET /api/onramp/link?address=SOLANA_ADDR&amount=25
//
// Returns a URL the client should open (in a popup) to let the user buy USDC
// without leaving the app.  Tries Coinbase Pay (hosted checkout) first, then
// falls back to a direct Coinbase buy-USDC URL.
//
// Requires:
//   COINBASE_PAY_APP_ID  (optional) — Coinbase Pay SDK App ID from
//                         https://pay.coinbase.com → Projects.  When set, the
//                         returned URL is a pre-populated Coinbase Pay checkout
//                         targeting the user's Solana wallet.  When absent, the
//                         URL falls back to Coinbase's general USDC buy page.
//
// The address param is NOT a secret (it's a Solana public key) and is only
// used as the deposit destination — it is safe to pass in a query string.

import { cors, json, error } from '../_lib/http.js';

const COINBASE_PAY_APP_ID = process.env.COINBASE_PAY_APP_ID;

// Solana USDC on mainnet
const USDC_SOLANA_ASSET = 'USDC';
const SOLANA_BLOCKCHAIN  = 'solana';

// Length bounds for a Solana base58 public key
const SOL_ADDR_MIN = 32;
const SOL_ADDR_MAX = 44;
const BASE58_RE    = /^[1-9A-HJ-NP-Za-km-z]+$/;

function isValidSolanaAddress(addr) {
	if (!addr || typeof addr !== 'string') return false;
	if (addr.length < SOL_ADDR_MIN || addr.length > SOL_ADDR_MAX) return false;
	return BASE58_RE.test(addr);
}

/**
 * Build a Coinbase Pay hosted checkout URL.
 * Spec: https://docs.cdp.coinbase.com/onramp/docs/api-initializing
 *
 * @param {string} appId          Coinbase Pay App ID
 * @param {string} destinationAddress  Solana wallet address
 * @param {number} amount         preset fiat amount in USD
 * @returns {string}
 */
function buildCoinbasePayUrl(appId, destinationAddress, amount) {
	const destinationWallets = JSON.stringify([
		{
			address: destinationAddress,
			blockchains: [SOLANA_BLOCKCHAIN],
			assets: [USDC_SOLANA_ASSET],
		},
	]);
	const params = new URLSearchParams({
		appId,
		destinationWallets,
		presetFiatAmount: String(amount),
		fiatCurrency: 'USD',
	});
	return `https://pay.coinbase.com/buy/select-asset?${params}`;
}

/**
 * Fallback: Coinbase's general USDC buy page.  The user lands on Coinbase,
 * selects their amount, and sends USDC to their own address.  Still real;
 * not as frictionless as Coinbase Pay but 100% functional without an App ID.
 */
function buildCoinbaseFallbackUrl() {
	return 'https://www.coinbase.com/price/usd-coin';
}

export default function handler(req, res) {
	if (cors(req, res, { methods: 'GET,OPTIONS', credentials: true })) return;
	if (req.method !== 'GET') return error(res, 405, 'method_not_allowed', 'GET only');

	const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
	const address = url.searchParams.get('address') || '';
	const amountRaw = url.searchParams.get('amount');
	const amount = Math.max(10, Math.min(500, Number(amountRaw) || 25));

	if (!isValidSolanaAddress(address)) {
		return error(res, 400, 'invalid_address', 'address must be a valid Solana public key');
	}

	let onrampUrl;
	let mode;

	if (COINBASE_PAY_APP_ID) {
		onrampUrl = buildCoinbasePayUrl(COINBASE_PAY_APP_ID, address, amount);
		mode = 'coinbase-pay';
	} else {
		onrampUrl = buildCoinbaseFallbackUrl();
		mode = 'coinbase-fallback';
	}

	return json(res, 200, {
		url: onrampUrl,
		mode,
		address,
		amount,
	});
}
