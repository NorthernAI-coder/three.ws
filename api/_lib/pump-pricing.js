// Per-tool pricing for paid MCP tools, settled via pump-agent-payments.
//
// Today: a static map keyed by tool name → { amount_usdc, currency_mint?, recipient_mint? }.
//   - `amount_usdc` is the price per call (for one-shots) or per window (for subs).
//   - `recipient_mint` defaults to env.PUMP_DEFAULT_AGENT_MINT — the platform agent.
//   - Tools omitted from this map are free.
//
// Subscription bypass: if a payer has a confirmed `pump_agent_payments` row
// for the resolved mint whose end_time is in the future and tool_name matches
// (or is null = unrestricted access), the call is permitted without a fresh
// payment.
//
// We expose this map via the existing tools/list response so MCP clients see
// the price next to each tool.

import { sql } from './db.js';

export const TOOL_PRICING = Object.freeze({
	// Heavy compute or external calls — priced.
	optimize_model: { amount_usdc: 0.05, description: 'Per call' },
	segment_model: { amount_usdc: 0.04, description: 'Per call — split a mesh into named parts' },
	inspect_model: { amount_usdc: 0.01, description: 'Per call' },
	validate_model: { amount_usdc: 0.01, description: 'Per call' },
	render_avatar: { amount_usdc: 0.005, description: 'Per call' },
	apply_animation: {
		amount_usdc: 0.02,
		description: 'Per call — retarget + bake an animated GLB',
	},
	// 3D Studio generation tools — GPU-bound, priced per call. A full surface
	// retexture regenerates every viewpoint (minutes of GPU); the magic-brush
	// region edit only inpaints one masked patch, so it is priced well below it.
	retexture_model: { amount_usdc: 0.1, description: 'Per full retexture' },
	retexture_region: { amount_usdc: 0.03, description: 'Per region edit (magic brush)' },
	// Discovery / lookups (incl. list_animations) — free
});

export function priceFor(toolName) {
	return TOOL_PRICING[toolName] || null;
}

export function isFreeTool(toolName) {
	return !TOOL_PRICING[toolName];
}

// USDC (and our other supported stables) are 6-decimal. The x402 wire `amount`
// is an atomic-unit string; convert a human `amount_usdc` to that. Rounds to the
// nearest atomic unit so fractional-cent prices (e.g. 0.005) map exactly.
const USDC_DECIMALS = 6;
export function usdcToAtomicString(amountUsdc) {
	const atomic = Math.round(Number(amountUsdc) * 10 ** USDC_DECIMALS);
	return String(atomic);
}

/**
 * The x402 `amount` (atomic-unit string) to charge for a given MCP tools/call.
 * Derived from the advertised per-tool price so the 402 challenge and the
 * settled charge agree. Returns null for free tools (no charge).
 *
 * @param {string} toolName
 * @returns {string|null}
 */
export function x402AmountForTool(toolName) {
	const price = priceFor(toolName);
	if (!price || !(price.amount_usdc > 0)) return null;
	return usdcToAtomicString(price.amount_usdc);
}

/**
 * Returns the active subscription row for (mint, payerWallet, toolName) if one
 * exists and has not expired. `toolName=null` matches any unrestricted
 * subscription. Returns null otherwise.
 */
export async function findActiveSubscription({ mint, network = 'mainnet', payerWallet, toolName }) {
	if (!mint || !payerWallet) return null;
	const [row] = await sql`
		select p.id, p.invoice_id, p.amount_atomics, p.end_time, p.tool_name
		from pump_agent_payments p
		join pump_agent_mints m on m.id = p.mint_id
		where m.mint = ${mint}
		  and m.network = ${network}
		  and p.payer_wallet = ${payerWallet}
		  and p.status = 'confirmed'
		  and p.end_time > now()
		  and (p.tool_name is null or p.tool_name = ${toolName || null})
		order by p.end_time desc
		limit 1
	`;
	return row || null;
}

/**
 * Resolve the destination pump.fun mint for a tool call. Defaults to the
 * platform-wide agent (env.PUMP_DEFAULT_AGENT_MINT) when one is configured;
 * a future enhancement is per-resource (per agent_id) routing.
 */
export function resolveBillingMint() {
	return process.env.PUMP_DEFAULT_AGENT_MINT || null;
}
