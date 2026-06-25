// Centralized env for the Omniology MCP server.
//
// The read tools wrap Omniology's PUBLIC contest feed; submit_entry settles
// USDC on Solana (x402) and then forwards an authenticated POST to Omniology.
// The only knobs here are which Omniology deployment to talk to, an optional
// bearer token for the authenticated forward, and timeouts. The Solana payment
// env (MCP_SVM_PAYMENT_ADDRESS, X402_*) lives in payments.js.

export function env(key, fallback) {
	const v = process.env[key];
	return v !== undefined && String(v).trim() !== '' ? String(v).trim() : fallback;
}

// Base URL of the Omniology contest API (serves /v1/contests/live and
// /v1/contests/{id}/entries). No default — Omniology is an external service, so
// an unconfigured server fails clearly at startup rather than guessing a host.
export const OMNIOLOGY_BASE = env('OMNIOLOGY_BASE_URL', '').replace(/\/+$/, '');

// Optional bearer token sent to Omniology ONLY on the authenticated forward of
// a paid submit_entry. Never exposed to the MCP client.
export const OMNIOLOGY_API_KEY = env('OMNIOLOGY_API_KEY', '');

// Per-request timeout (ms) for calls to Omniology.
export const HTTP_TIMEOUT_MS = (() => {
	const raw = env('OMNIOLOGY_TIMEOUT_MS');
	if (raw === undefined) return 20000;
	const n = Number(raw);
	if (!Number.isFinite(n) || n <= 0) {
		throw Object.assign(new Error(`OMNIOLOGY_TIMEOUT_MS must be a positive number (got "${raw}")`), {
			code: 'bad_config',
		});
	}
	return n;
})();

// Identifies this client to Omniology in request logs.
export const USER_AGENT = '@three-ws/omniology-mcp';

/**
 * Assert OMNIOLOGY_BASE_URL is configured. Called once by the stdio entry point
 * so a running server fails fast with a single clean line instead of only
 * erroring on the first tool call. Not run during buildServer()/tests.
 * @throws {Error} when OMNIOLOGY_BASE_URL is unset
 */
export function assertBaseUrl() {
	if (!OMNIOLOGY_BASE) {
		throw new Error(
			'OMNIOLOGY_BASE_URL is not set — point it at the Omniology contest API (e.g. https://api.omniology.ai).',
		);
	}
}
