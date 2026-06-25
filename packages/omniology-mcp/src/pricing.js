// Single source of truth for what submit_entry costs.
//
// Like the sibling x402 MCP servers, the price lives in one module so the tool
// description, getting-started catalog, and the x402 `accepts` requirement can
// never drift. The default is a flat per-submission fee; operators override it
// with OMNIOLOGY_SUBMIT_PRICE_USD (e.g. "$0.10"). This is the MCP front-door
// fee — distinct from any contest entry fee Omniology settles on its own side.

import { env } from './config.js';

function normalizePrice(raw) {
	const value = String(raw).trim();
	if (!/^\$\d+(\.\d+)?$/.test(value)) {
		throw Object.assign(
			new Error(`OMNIOLOGY_SUBMIT_PRICE_USD must look like "$0.05" (got "${raw}")`),
			{ code: 'bad_config' },
		);
	}
	return value;
}

// USDC price for one submit_entry call, settled `exact` on Solana mainnet.
export const SUBMIT_ENTRY_PRICE_USD = normalizePrice(env('OMNIOLOGY_SUBMIT_PRICE_USD', '$0.05'));
