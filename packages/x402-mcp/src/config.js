// Centralized env for the x402 buyer MCP.
//
// This server is user-keyed: outgoing payments are signed by a Solana keypair
// the operator supplies (SOLANA_SECRET_KEY) or a per-call `secret` overrides.
// We never bake in a key. The core self-custodial pay_and_call works with only a
// Solana RPC + key — no external API base required. inspect_endpoint and the
// explicit-address x402_wallet need no key either. Only find_services and the
// optional session-governed pay path need X402_API_BASE (a discovery endpoint).

export function env(key, fallback) {
	const v = process.env[key];
	return v !== undefined && String(v).trim() !== '' ? String(v).trim() : fallback;
}

// Optional base URL of an x402 discovery / bazaar API. Powers find_services
// (GET /api/bazaar/search) and the optional session-governed pay path. There is
// NO default — the core self-custodial pay_and_call needs only a Solana RPC + key.
// Set X402_API_BASE to any compatible discovery endpoint (e.g. https://three.ws).
// The legacy THREE_WS_BASE name is still honoured as a fallback.
export const X402_API_BASE = env('X402_API_BASE', env('THREE_WS_BASE', '')).replace(/\/+$/, '');

/** Throw a clear, actionable error when a feature needs X402_API_BASE but it's unset. */
export function requireApiBase(feature) {
	if (!X402_API_BASE) {
		throw Object.assign(
			new Error(
				`${feature} needs a discovery endpoint — set X402_API_BASE to an x402 bazaar/discovery URL (e.g. https://three.ws).`,
			),
			{ code: 'no_api_base' },
		);
	}
	return X402_API_BASE;
}

// Per-request timeout (ms). Paid calls settle on-chain, so the default is roomy.
export const HTTP_TIMEOUT_MS = (() => {
	const raw = env('X402_HTTP_TIMEOUT_MS', env('THREE_WS_TIMEOUT_MS'));
	if (raw === undefined) return 60000;
	const n = Number(raw);
	if (!Number.isFinite(n) || n <= 0) {
		throw Object.assign(new Error(`X402_HTTP_TIMEOUT_MS must be a positive number (got "${raw}")`), {
			code: 'bad_config',
		});
	}
	return n;
})();

// Validate the Solana RPC endpoint at load. Payments are signed + broadcast over
// this URL, so a plaintext-http endpoint (outside localhost) is a MITM risk.
function validateRpcUrl(raw) {
	let u;
	try {
		u = new URL(raw);
	} catch {
		throw Object.assign(new Error(`SOLANA_RPC_URL is not a valid URL: "${raw}"`), { code: 'bad_rpc_url' });
	}
	if (u.protocol === 'https:') return raw;
	const isLocal = ['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(u.hostname);
	if (u.protocol === 'http:' && isLocal) return raw;
	throw Object.assign(
		new Error(
			`SOLANA_RPC_URL must be https (got "${u.protocol}//${u.hostname}"). Only http://localhost is allowed for local dev.`,
		),
		{ code: 'insecure_rpc_url' },
	);
}

// Solana mainnet RPC. Bring your own (Helius / QuickNode / Triton) for production.
export const SOLANA_RPC_URL = validateRpcUrl(env('SOLANA_RPC_URL', 'https://api.mainnet-beta.solana.com'));

// Optional default signer (base58 secret key, or a JSON byte array). pay_and_call
// accepts a per-call `secret` that overrides this.
export const SOLANA_DEFAULT_SECRET = env('SOLANA_SECRET_KEY') || env('FUNDER_SECRET') || '';

// Max USD a single pay_and_call may spend. Default $1 — bounds a runaway/injected
// payment. Raise MAX_PAY_USD to allow larger calls.
export const MAX_PAY_USD = (() => {
	const raw = env('MAX_PAY_USD');
	if (raw === undefined) return 1;
	const n = Number(raw);
	if (!Number.isFinite(n) || n <= 0) {
		throw Object.assign(new Error(`MAX_PAY_USD must be a positive number (got "${raw}")`), { code: 'bad_policy_config' });
	}
	return n;
})();

// Spending money requires an explicit confirm:true unless opted out.
export const REQUIRE_CONFIRM = (() => {
	const raw = env('REQUIRE_CONFIRM');
	if (raw === undefined) return true;
	return !['0', 'false', 'no', 'off'].includes(String(raw).toLowerCase());
})();

// Canonical Solana mainnet USDC mint (6 decimals) — for balance reads.
export const USDC_MAINNET_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

export const USER_AGENT = 'x402-mcp';
