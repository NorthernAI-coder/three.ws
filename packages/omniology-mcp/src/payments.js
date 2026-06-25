// x402 payment wiring for omniology-mcp — Solana USDC, exact scheme.
//
// Mirrors packages/ibm-x402-mcp/src/payments.js and mcp-server/src/payments.js.
// Builds a single shared x402ResourceServer per process that verifies + settles
// USDC on Solana mainnet via PayAI's facilitator. The one paid tool
// (submit_entry) wraps its handler in `paid(cfg, fn)`; the free read tools wrap
// theirs in `free(cfg, fn)` so every tool returns the same MCP CallToolResult
// envelope. This server is the x402 front door for Omniology: it settles the
// USDC payment here, then the tool forwards an authenticated entry to Omniology.
//
// Environment (server operator — NOT the end user):
//   MCP_SVM_PAYMENT_ADDRESS  — Solana wallet that receives USDC (required)
//   X402_PAY_TO_SOLANA       — fallback alias
//   X402_PAY_TO              — fallback alias
//   X402_FEE_PAYER_SOLANA    — transaction fee payer (optional, defaults to three.ws fee payer)
//   X402_FACILITATOR_URL     — PayAI facilitator URL (optional)
//   X402_FACILITATOR_TOKEN   — Bearer token for facilitator (optional)
//   X402_ASSET_MINT_SOLANA   — USDC mint override (optional)

import { HTTPFacilitatorClient, x402ResourceServer } from '@x402/core/server';
import { registerExactSvmScheme } from '@x402/svm/exact/server';
import { createPaymentWrapper, createToolResourceUrl } from '@x402/mcp';
import { declareDiscoveryExtension } from '@x402/extensions/bazaar';

// CAIP-2 id for Solana mainnet (mirrors api/_lib/x402-spec.js).
const NETWORK_SOLANA_MAINNET = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';
// Canonical Solana mainnet USDC mint (read from repo, never pasted from memory).
const DEFAULT_SOLANA_USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

const env = (key, fallback) => {
	const v = process.env[key];
	return v && v.trim() ? v.trim() : fallback;
};

function requireSvmPayTo() {
	const addr = env('MCP_SVM_PAYMENT_ADDRESS') || env('X402_PAY_TO_SOLANA') || env('X402_PAY_TO');
	if (!addr) {
		throw new Error(
			'set MCP_SVM_PAYMENT_ADDRESS to your Solana wallet address to receive USDC payments.',
		);
	}
	return addr;
}

/**
 * Assert the receiving Solana payment address is configured. Called once by the
 * stdio entry point so a running server fails fast with a single clean line.
 * Does NOT run during buildServer()/tests — tool registration stays secret-free.
 * @throws {Error} with a single actionable message when no pay-to is set
 */
export function assertPaymentEnv() {
	requireSvmPayTo();
}

function svmFeePayer() {
	return env('X402_FEE_PAYER_SOLANA', '2wKupLR9q6wXYppw8Gr2NvWxKBUqm4PPJKkQfoxHDBg4');
}

function buildFacilitator() {
	const url = env('X402_FACILITATOR_URL', 'https://facilitator.payai.network');
	const token = env('X402_FACILITATOR_TOKEN');
	return new HTTPFacilitatorClient({
		url,
		createAuthHeaders: token
			? async () => ({ headers: { Authorization: `Bearer ${token}` } })
			: undefined,
	});
}

let resourceServerPromise = null;
let lastInitError = null;

// Build a single shared x402ResourceServer, register the Solana `exact` scheme,
// and call .initialize() to fetch the facilitator's /supported. Memoized so
// concurrent tool calls don't race during startup.
export function getResourceServer() {
	if (resourceServerPromise) return resourceServerPromise;
	resourceServerPromise = (async () => {
		const server = new x402ResourceServer([buildFacilitator()]);
		registerExactSvmScheme(server, {});
		try {
			await server.initialize();
		} catch (err) {
			lastInitError = err;
			console.error(`[omniology-mcp] facilitator initialize() failed: ${err.message}`);
		}
		return server;
	})();
	return resourceServerPromise;
}

export function getLastFacilitatorInitError() {
	return lastInitError;
}

async function buildAccepts({ resourceServer, priceUsd, resourceUrl }) {
	return resourceServer.buildPaymentRequirementsFromOptions(
		[
			{
				scheme: 'exact',
				network: NETWORK_SOLANA_MAINNET,
				payTo: requireSvmPayTo(),
				price: priceUsd,
				maxTimeoutSeconds: 60,
				extra: {
					name: 'USDC',
					decimals: 6,
					asset: env('X402_ASSET_MINT_SOLANA', DEFAULT_SOLANA_USDC),
					feePayer: svmFeePayer(),
				},
			},
		],
		{ resourceUrl },
	);
}

/**
 * Wrap a tool handler with Solana USDC x402 payment (exact scheme).
 *
 * Payment wiring is built LAZILY on first invocation — tool registration stays
 * secret-free so buildServer() can enumerate tools without payment env. The
 * wrapper is memoized so the first call pays the init cost once.
 *
 * @param {object} cfg
 * @param {string} cfg.toolName
 * @param {string} cfg.description
 * @param {string} cfg.priceUsd         — e.g. "$0.05"
 * @param {object} cfg.inputSchema      — JSON Schema for tool args
 * @param {object} [cfg.example]
 * @param {object} [cfg.outputExample]
 * @param {Function} handler            — async (args, context) → any
 * @returns {Function} MCP tool callback
 */
export function paid(cfg, handler) {
	const { toolName, description, priceUsd, inputSchema, example, outputExample } = cfg;

	if (!toolName) throw new Error('paid(): toolName is required');
	if (!description) throw new Error('paid(): description is required');
	if (!priceUsd) throw new Error('paid(): priceUsd is required');
	if (!inputSchema) throw new Error('paid(): inputSchema is required');

	let wrapperPromise = null;

	async function getWrapper() {
		if (wrapperPromise) return wrapperPromise;
		wrapperPromise = (async () => {
			const resourceServer = await getResourceServer();
			const resourceUrl = createToolResourceUrl(toolName);
			const accepts = await buildAccepts({ resourceServer, priceUsd, resourceUrl });

			const bazaar = declareDiscoveryExtension({
				toolName,
				description,
				transport: 'stdio',
				inputSchema,
				example,
				output: outputExample ? { example: outputExample } : undefined,
			});

			const wrap = createPaymentWrapper(resourceServer, {
				accepts,
				resource: { url: resourceUrl, description, mimeType: 'application/json' },
				extensions: bazaar,
			});

			return wrap(async (args, context) => {
				const result = await handler(args, context);
				return buildToolResult(result);
			});
		})();
		return wrapperPromise;
	}

	return async function paidToolCallback(args, context) {
		const wrapped = await getWrapper();
		return wrapped(args, context);
	};
}

/**
 * Wrap a tool handler as a FREE (no-payment) MCP tool callback — the read
 * tools. Funnels the return value through the SAME envelope every paid tool
 * uses (text mirror + structuredContent + isError on `ok:false`), so a free
 * tool is indistinguishable from a paid one to the client EXCEPT it never emits
 * a 402 PaymentRequired challenge and never touches payment env. Errors thrown
 * by the handler are sanitized into a stable `{ ok:false, error, message }`.
 *
 * @param {object} cfg
 * @param {string} cfg.toolName  — used only in error messages
 * @param {Function} handler     — async (args, context) → any
 * @returns {Function} MCP tool callback
 */
export function free(cfg, handler) {
	const { toolName } = cfg || {};
	if (!toolName) throw new Error('free(): toolName is required');
	if (typeof handler !== 'function') throw new Error('free(): handler must be a function');
	return async function freeToolCallback(args, context) {
		try {
			const result = await handler(args, context);
			return buildToolResult(result);
		} catch (err) {
			return buildToolResult(
				toolError(err?.code || 'internal_error', err?.message || String(err), {
					...(err?.status ? { status: err.status } : {}),
				}),
			);
		}
	};
}

/**
 * Build the MCP CallToolResult envelope from a handler's return value.
 *   - content[0].text — JSON (or raw string) blob; always present.
 *   - structuredContent — plain objects surfaced as structured tool output.
 *   - isError:true — set ONLY for the `{ ok:false }` toolError envelope, which
 *     also cancels the x402 payment so a caller is never charged for an error.
 *
 * @param {unknown} result
 * @returns {{ content: Array<{type:'text',text:string}>, structuredContent?: object, isError?: true }}
 */
export function buildToolResult(result) {
	const text = typeof result === 'string' ? result : JSON.stringify(result);
	const envelope = { content: [{ type: 'text', text }] };
	const isPlainObject = result !== null && typeof result === 'object' && !Array.isArray(result);
	if (isPlainObject) {
		envelope.structuredContent = result;
		if (result.ok === false) envelope.isError = true;
	}
	return envelope;
}

/**
 * Standard tool error envelope. Every error path returns this shape so MCP
 * clients branch on a stable `{ ok:false, error:<code>, message }` contract.
 * @param {string} code
 * @param {string} message
 * @param {object} [extra]
 */
export function toolError(code, message, extra) {
	return { ok: false, error: code, message, ...(extra || {}) };
}

export { NETWORK_SOLANA_MAINNET };
