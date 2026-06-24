// `get_wallet_portfolio` — one KOL wallet's portfolio P&L card. Read-only.
//
// Wraps GET /api/kol/wallets?addresses=<wallet>. The three.ws API proxies
// Birdeye's wallet portfolio (server-side key) and returns a normalized P&L
// summary per address. This tool focuses that on a single tracked trader.

import { z } from 'zod';

import { apiRequest } from '../lib/api.js';

export const def = {
	name: 'get_wallet_portfolio',
	title: 'KOL wallet portfolio + P&L',
	annotations: { readOnlyHint: true, idempotentHint: false, openWorldHint: true },
	description:
		"Pull one KOL trader's live portfolio P&L card from the three.ws Birdeye proxy. " +
		'Returns realized P&L, unrealized P&L (current open-position value), win rate, total ' +
		'trades, and the single highest-value token the wallet holds (symbol + USD value). Use ' +
		'this to size up a specific smart trader before copying or analyzing them. For ranking ' +
		'many traders at once use intel-mcp `kol_leaderboard`; this is the per-wallet deep dive. ' +
		'`found:false` means the proxy returned no portfolio for that address (unknown wallet, ' +
		'or Birdeye had nothing). Read-only live data.',
	inputSchema: {
		wallet: z
			.string()
			.min(1)
			.describe('The Solana wallet address of the KOL trader to pull a portfolio P&L card for.'),
	},
	async handler(args) {
		const wallet = String(args?.wallet ?? '').trim();
		const data = await apiRequest('/api/kol/wallets', { query: { addresses: wallet } });
		const rows = Array.isArray(data?.data) ? data.data : [];
		const row = rows.find((r) => r?.address === wallet) ?? rows[0] ?? null;
		if (!row) {
			return { ok: true, wallet, found: false };
		}
		return {
			ok: true,
			wallet: row.address ?? wallet,
			found: true,
			realized_pnl_usd: row.realizedPnl ?? 0,
			unrealized_pnl_usd: row.unrealizedPnl ?? 0,
			win_rate: row.winRate ?? 0,
			total_trades: row.totalTrades ?? 0,
			top_token: row.topToken ?? null,
		};
	},
};
