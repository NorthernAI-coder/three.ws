import { hasScope } from '../_lib/auth.js';
import { recordEvent, logger } from '../_lib/usage.js';
import { priceFor, findActiveSubscription, resolveBillingMint } from '../_lib/pump-pricing.js';
import { declareMcpDiscovery } from '../_lib/x402/bazaar-helpers.js';
import { sanitizeToolError } from '../_lib/mcp-error-sanitize.js';
import { TOOL_CATALOG, TOOLS } from './catalog.js';

export const PROTOCOL_VERSION = '2025-06-18';
const SERVER_INFO = { name: '3d-agent-mcp', version: '1.0.0' };
const log = logger('mcp');

export function ok(id, result) {
	return { jsonrpc: '2.0', id, result };
}

export function rpcError(code, message, data) {
	const e = new Error(message);
	e.code = code;
	e.data = data;
	return e;
}

export async function dispatch(msg, auth, _req) {
	const started = Date.now();
	const id = msg.id;
	const isNotification = id === undefined;

	try {
		if (msg.jsonrpc !== '2.0') throw rpcError(-32600, 'invalid Request');
		const method = msg.method;

		if (method === 'initialize') return ok(id, await onInitialize(msg.params, auth));
		if (method === 'ping') return ok(id, {});
		if (method === 'notifications/initialized') return null;
		if (method === 'tools/list')
			return ok(id, {
				tools: TOOL_CATALOG.map((t) => {
					const price = priceFor(t.name);
					if (!price) return t;
					// USE-13: priced tools also surface a Bazaar discovery
					// extension so MCP clients reading tools/list see the same
					// catalog metadata facilitators index via
					// /discovery/resources. The extension carries the canonical
					// shape (transport, inputSchema, example) clients need to
					// pay-and-call without re-reading the tool description.
					const discovery = declareMcpDiscovery({
						toolName: t.name,
						description: t.description,
						transport: 'streamable-http',
						inputSchema: t.inputSchema,
					});
					return {
						...t,
						pricing: {
							amount_usdc: price.amount_usdc,
							currency: 'USDC',
							description: price.description,
							scheme: 'pump-agent-payments',
							prep_endpoint: '/api/pump/accept-payment-prep',
							confirm_endpoint: '/api/pump/accept-payment-confirm',
							recipient_mint: resolveBillingMint(),
						},
						extensions: { bazaar: discovery },
					};
				}),
			});
		if (method === 'tools/call') return ok(id, await onToolCall(msg.params, auth, started));
		if (method === 'resources/list') return ok(id, { resources: [] });
		if (method === 'resources/templates/list') return ok(id, { resourceTemplates: [] });
		if (method === 'prompts/list') return ok(id, { prompts: [] });
		if (method === 'logging/setLevel') return ok(id, {});

		throw rpcError(-32601, `method not found: ${method}`);
	} catch (err) {
		log.warn('rpc_error', { method: msg.method, code: err.code, message: err.message });
		if (isNotification) return null;
		return {
			jsonrpc: '2.0',
			id,
			error: {
				code: err.code || -32603,
				message: err.message || 'internal error',
				data: err.data,
			},
		};
	}
}

function summarize(args) {
	const o = {};
	for (const [k, v] of Object.entries(args || {})) {
		o[k] = typeof v === 'string' && v.length > 64 ? v.slice(0, 64) + '…' : v;
	}
	return o;
}

async function onInitialize(_params, _auth) {
	return {
		protocolVersion: PROTOCOL_VERSION,
		serverInfo: SERVER_INFO,
		capabilities: {
			tools: { listChanged: false },
			resources: { listChanged: false, subscribe: false },
			logging: {},
		},
		instructions: [
			'Render 3D avatars stored on three.ws as <model-viewer> HTML artifacts.',
			"Use list_my_avatars to see the user's avatars and render_avatar to get embeddable viewer HTML.",
			'Public avatars can be discovered via search_public_avatars.',
		].join(' '),
	};
}

async function onToolCall(params, auth, started) {
	const { name, arguments: args = {} } = params || {};
	const tool = TOOLS[name];
	if (!tool) throw rpcError(-32602, `unknown tool: ${name}`);
	if (tool.scope && !hasScope(auth.scope, tool.scope)) {
		throw rpcError(-32002, `insufficient scope, requires ${tool.scope}`);
	}
	// Defense-in-depth: validate args against the tool's inputSchema before
	// hitting the handler. Ajv mutates `args` to fill defaults + coerce types,
	// matching what the handlers used to expect from informal argv shaping
	// (`args.limit || 25`). When validation fails we surface the first error
	// as an `invalid params` (-32602) — same code MCP clients already handle.
	if (tool.validate && !tool.validate(args)) {
		const first = tool.validate.errors?.[0];
		const detail = first
			? `${first.instancePath || '(root)'} ${first.message || 'invalid'}`
			: 'invalid arguments';
		throw rpcError(-32602, `invalid params for ${name}: ${detail}`);
	}

	// Payment gate for priced tools called by anonymous x402 principals.
	//
	// An x402 principal reaches here only after the HTTP layer verified an
	// X-PAYMENT against this tool's per-tool price (auth.x402Paid). That single
	// pay-per-call payment satisfies the charge — we do NOT additionally demand a
	// pump-agent-payments subscription, which would double-bill a caller who just
	// paid. The subscription path stays as an ALTERNATIVE for x402 principals who
	// did not pay per-call (auth.x402Paid falsy): if they hold an active
	// pump-agent-payments window for this tool we honor it, otherwise we 402 with
	// the subscription challenge. This keeps advertised price == charged price.
	const price = priceFor(name);
	if (price && auth.source === 'x402' && !auth.x402Paid) {
		const billingMint = resolveBillingMint();
		const payerWallet = args.payer_wallet || auth.payer || null;
		if (billingMint && payerWallet) {
			const sub = await findActiveSubscription({
				mint: billingMint,
				network: process.env.PUMP_DEFAULT_NETWORK || 'mainnet',
				payerWallet,
				toolName: name,
			});
			if (!sub) {
				throw rpcError(-32402, 'payment required for this tool', {
					scheme: 'pump-agent-payments',
					tool: name,
					amount_usdc: price.amount_usdc,
					recipient_mint: billingMint,
					prep_endpoint: '/api/pump/accept-payment-prep',
					hint:
						'POST a confirmed acceptPayment whose end_time > now() and tool_name matches this tool, then retry.',
				});
			}
			auth.subscription = sub;
		} else if (billingMint) {
			// A price is advertised and billing is configured, but the caller gave
			// no wallet to match a subscription against and did not pay per-call.
			throw rpcError(-32402, 'payment required for this tool', {
				scheme: 'pump-agent-payments',
				tool: name,
				amount_usdc: price.amount_usdc,
				recipient_mint: billingMint,
				prep_endpoint: '/api/pump/accept-payment-prep',
			});
		}
	}

	try {
		const result = await tool.handler(args, auth);
		recordEvent({
			userId: auth.userId,
			apiKeyId: auth.apiKeyId,
			clientId: auth.clientId,
			kind: 'tool_call',
			tool: name,
			latencyMs: Date.now() - started,
			meta: { args_summary: summarize(args) },
		});
		return result;
	} catch (err) {
		recordEvent({
			userId: auth.userId,
			apiKeyId: auth.apiKeyId,
			clientId: auth.clientId,
			kind: 'tool_call',
			tool: name,
			status: 'error',
			latencyMs: Date.now() - started,
			meta: { error: err.message },
		});
		// Only re-throw intentional JSON-RPC errors (integer codes); string codes are
		// postgres SQL states (e.g. '42P01') — sanitize those rather than leaking them.
		if (err.code && typeof err.code === 'number') throw err;
		// Framework convention: tool errors go in result.isError, not rpc error.
		// Shared sanitizer suppresses pg/driver internals + internal hostnames,
		// logs full detail to stderr with a log id, and passes safe
		// handler-authored messages through unchanged.
		const { message } = sanitizeToolError(err, { tool: name, server: 'mcp', log });
		return {
			content: [{ type: 'text', text: `Error: ${message}` }],
			isError: true,
		};
	}
}
