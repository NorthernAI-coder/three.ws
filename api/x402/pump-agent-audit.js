// GET /api/x402/pump-agent-audit?mint=<base58-spl-mint>
//
// Paid endpoint cataloged by the CDP x402 Bazaar. For $0.02 USDC the server
// audits a pump.fun agent-payments token: total acceptPayment volume in,
// distribute/buyback success/failure history, recent failure errors, and
// risk flags (e.g. "no distribution ever run", "high distribute failure rate").
//
// Why this is defensible: three.ws is the canonical off-chain index for
// every acceptPayment + distributePayments + agentBuyback we built. The
// on-chain TokenAgentPaymentInCurrency PDA is the receipt, but the failure
// modes (distribute errors, buyback skips, expired claims) only live here.
// Token investors and counterparty agents need this before trading or
// trusting a pump-agent token; otherwise they're flying blind on op risk.

import { paidEndpoint } from '../_lib/x402-paid-endpoint.js';
import { buildBazaarSchema } from '../_lib/x402-spec.js';
import { installAccessControl } from '../_lib/x402/access-control.js';
import { withService } from '../_lib/x402/bazaar-helpers.js';
import { sql } from '../_lib/db.js';
import { priceFor } from '../_lib/x402-prices.js';
import { recentPumpLaunches } from '../_lib/pump-launch-feed.js';

const ROUTE = '/api/x402/pump-agent-audit';

const DESCRIPTION =
	'three.ws Pump-Agent Audit — two modes. SINGLE (pass ?mint=<spl-mint>): a ' +
	'full operational audit of one pump.fun agent-payments token — total USDC ' +
	'paid in, unique payer count, distribute run history with success/failure ' +
	'breakdown, buyback runs with burn totals, recent error reasons, and risk ' +
	'flags ("never distributed", "high failure rate"). LIST (omit mint, pass ' +
	'?limit=&sort=newest|liquidity): the N most-recently launched pump.fun ' +
	'tokens (live bonding-curve feed) with each one\'s initial SOL liquidity, ' +
	'market cap and whether it is a three.ws agent-payments token, plus the ' +
	'cohort\'s average/peak initial liquidity. Use SINGLE to evaluate ' +
	'counterparty risk before trading; use LIST to screen fresh launches for ' +
	'snipe candidates.';

const INPUT_EXAMPLE = { mint: 'C3vQABCDEFGHJKLMNopqrstuvwxyZ12345abcdefghi' };

const INPUT_SCHEMA = {
	$schema: 'https://json-schema.org/draft/2020-12/schema',
	type: 'object',
	// `mint` selects SINGLE mode; omitting it selects LIST mode. Neither field is
	// unconditionally required, so the schema documents both inputs without
	// forcing a mint on the list path.
	properties: {
		mint: {
			type: 'string',
			description: 'Solana SPL mint pubkey (base58). Present → single-mint audit.',
		},
		limit: {
			type: 'integer',
			minimum: 1,
			maximum: 25,
			description: 'LIST mode: number of recent launches to return (default 10).',
		},
		sort: {
			type: 'string',
			enum: ['newest', 'liquidity'],
			description: 'LIST mode: order — newest-first (default) or by initial liquidity.',
		},
	},
};

// LIST mode example (omit mint → recent launches)
const OUTPUT_EXAMPLE_LIST = {
	network: 'mainnet',
	sort: 'newest',
	count: 2,
	newest_mint: 'AbcDEFGHJKLMNopqrstuvwxyZ12345abcdefghi1234',
	newest_name: 'PepeGo',
	newest_symbol: 'PEPEGO',
	avg_initial_liquidity_sol: 28.4,
	max_initial_liquidity_sol: 45.1,
	launches: [
		{
			mint: 'AbcDEFGHJKLMNopqrstuvwxyZ12345abcdefghi1234',
			name: 'PepeGo',
			symbol: 'PEPEGO',
			created_at: 1748908800000,
			market_cap_usd: 6500,
			liquidity_sol: 45.1,
			creator: '5oo1g...',
			twitter: null,
			telegram: null,
			website: null,
			is_agent_token: false,
		},
	],
	queried_at: '2026-05-14T17:00:00Z',
};

// SINGLE mode example (pass ?mint=)
const OUTPUT_EXAMPLE = {
	mint: 'C3vQABCDEFGHJKLMNopqrstuvwxyZ12345abcdefghi',
	network: 'mainnet',
	name: 'Helios',
	symbol: 'HELIO',
	agent_id: '7b9a4f30-2d11-4e2d-9d12-1cdb1f6a3a55',
	pump_agent_pda: 'PdaABC...',
	deployed_at: '2026-04-30T14:08:22Z',
	payments: {
		total_in_atomics: '142000000',
		confirmed_count: 142,
		failed_count: 3,
		pending_count: 1,
		distinct_payers: 87,
		first_payment_at: '2026-04-30T14:30:00Z',
		latest_payment_at: '2026-05-14T16:45:00Z',
	},
	distributions: {
		confirmed: 12,
		failed: 1,
		pending: 0,
		latest_run_at: '2026-05-14T12:00:00Z',
		latest_status: 'confirmed',
		latest_error: null,
	},
	buybacks: {
		confirmed: 5,
		failed: 0,
		total_burn_atomics: '500000000',
		latest_run_at: '2026-05-13T22:00:00Z',
	},
	risk_flags: [],
	indexed_at: '2026-05-14T17:00:00Z',
};

const OUTPUT_SCHEMA = {
	$schema: 'https://json-schema.org/draft/2020-12/schema',
	oneOf: [
		{
			title: 'List mode',
			type: 'object',
			required: ['count', 'launches', 'queried_at'],
			properties: {
				network: { type: 'string' },
				sort: { type: 'string' },
				count: { type: 'integer' },
				newest_mint: { type: ['string', 'null'] },
				newest_name: { type: ['string', 'null'] },
				newest_symbol: { type: ['string', 'null'] },
				avg_initial_liquidity_sol: { type: ['number', 'null'] },
				max_initial_liquidity_sol: { type: ['number', 'null'] },
				launches: { type: 'array', items: { type: 'object' } },
				queried_at: { type: 'string', format: 'date-time' },
			},
		},
		{
			title: 'Single mode',
			type: 'object',
			required: ['mint', 'payments', 'distributions', 'buybacks', 'risk_flags'],
			properties: {
				mint: { type: 'string' },
				network: { type: ['string', 'null'] },
				name: { type: ['string', 'null'] },
				symbol: { type: ['string', 'null'] },
				agent_id: { type: ['string', 'null'] },
				pump_agent_pda: { type: ['string', 'null'] },
				deployed_at: { type: ['string', 'null'] },
				payments: { type: 'object' },
				distributions: { type: 'object' },
				buybacks: { type: 'object' },
				risk_flags: { type: 'array', items: { type: 'string' } },
				indexed_at: { type: 'string', format: 'date-time' },
			},
		},
	],
};

const BAZAAR = {
	discoverable: true,
	info: {
		input: {
			type: 'http',
			method: 'GET',
			// Show list-mode query params as the primary example (common caller path)
			queryParams: { limit: 10, sort: 'newest' },
		},
		output: { type: 'json', example: OUTPUT_EXAMPLE_LIST },
	},
	schema: buildBazaarSchema({
		method: 'GET',
		queryParamsSchema: INPUT_SCHEMA,
		outputSchema: OUTPUT_SCHEMA,
	}),
};

const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function deriveRiskFlags({ payments, distributions, buybacks }) {
	const flags = [];
	if (payments.confirmed_count >= 5 && distributions.confirmed === 0) {
		flags.push('never_distributed');
	}
	const distribTotal = distributions.confirmed + distributions.failed;
	if (distribTotal >= 3 && distributions.failed / distribTotal > 0.3) {
		flags.push('high_distribute_failure_rate');
	}
	const payTotal = payments.confirmed_count + payments.failed_count;
	if (payTotal >= 10 && payments.failed_count / payTotal > 0.2) {
		flags.push('high_payment_failure_rate');
	}
	if (payments.confirmed_count >= 20 && buybacks.confirmed === 0) {
		flags.push('no_buybacks_run');
	}
	return flags;
}

async function loadAudit(mint) {
	const [mintRow] = await sql`
		select id, mint, network, name, symbol, agent_id, pump_agent_pda, created_at
		  from pump_agent_mints
		 where mint = ${mint}
		 order by created_at desc
		 limit 1
	`;
	if (!mintRow) {
		const err = new Error('mint not found in pump_agent_mints index');
		err.status = 404;
		err.code = 'mint_not_found';
		throw err;
	}

	const mintId = mintRow.id;
	const [payRow] = await sql`
		select
			coalesce(sum(case when status = 'confirmed' then amount_atomics else 0 end), 0)::text
				as total_in,
			count(*) filter (where status = 'confirmed')::int as confirmed_count,
			count(*) filter (where status = 'failed')::int    as failed_count,
			count(*) filter (where status = 'pending')::int   as pending_count,
			count(distinct case when status = 'confirmed' then payer_wallet end)::int
				as distinct_payers,
			min(case when status = 'confirmed' then created_at end) as first_payment_at,
			max(case when status = 'confirmed' then created_at end) as latest_payment_at
		  from pump_agent_payments
		 where mint_id = ${mintId}
	`;

	const [distAggRow] = await sql`
		select
			count(*) filter (where status = 'confirmed')::int as confirmed,
			count(*) filter (where status = 'failed')::int    as failed,
			count(*) filter (where status = 'pending')::int   as pending
		  from pump_distribute_runs
		 where mint_id = ${mintId}
	`;
	const [distLatestRow] = await sql`
		select status, error, created_at
		  from pump_distribute_runs
		 where mint_id = ${mintId}
		 order by created_at desc
		 limit 1
	`;

	const [buyRow] = await sql`
		select
			count(*) filter (where status = 'confirmed')::int as confirmed,
			count(*) filter (where status = 'failed')::int    as failed,
			coalesce(sum(case when status = 'confirmed' then burn_amount else 0 end), 0)::text
				as total_burn,
			max(case when status = 'confirmed' then created_at end) as latest_run_at
		  from pump_buyback_runs
		 where mint_id = ${mintId}
	`;

	const payments = {
		total_in_atomics: payRow.total_in,
		confirmed_count: payRow.confirmed_count,
		failed_count: payRow.failed_count,
		pending_count: payRow.pending_count,
		distinct_payers: payRow.distinct_payers,
		first_payment_at: payRow.first_payment_at
			? new Date(payRow.first_payment_at).toISOString()
			: null,
		latest_payment_at: payRow.latest_payment_at
			? new Date(payRow.latest_payment_at).toISOString()
			: null,
	};
	const distributions = {
		confirmed: distAggRow.confirmed,
		failed: distAggRow.failed,
		pending: distAggRow.pending,
		latest_run_at: distLatestRow?.created_at
			? new Date(distLatestRow.created_at).toISOString()
			: null,
		latest_status: distLatestRow?.status || null,
		latest_error: distLatestRow?.error || null,
	};
	const buybacks = {
		confirmed: buyRow.confirmed,
		failed: buyRow.failed,
		total_burn_atomics: buyRow.total_burn,
		latest_run_at: buyRow.latest_run_at ? new Date(buyRow.latest_run_at).toISOString() : null,
	};

	return {
		mint: mintRow.mint,
		network: mintRow.network,
		name: mintRow.name,
		symbol: mintRow.symbol,
		agent_id: mintRow.agent_id,
		pump_agent_pda: mintRow.pump_agent_pda,
		deployed_at: new Date(mintRow.created_at).toISOString(),
		payments,
		distributions,
		buybacks,
		risk_flags: deriveRiskFlags({ payments, distributions, buybacks }),
		indexed_at: new Date().toISOString(),
	};
}

// Cross-reference the live pump.fun launches against pump_agent_mints so each
// list entry gains an `is_agent_token` flag without N per-launch DB queries.
async function markAgentTokens(launches) {
	if (!launches.length) return launches;
	const mints = launches.map((l) => l.mint).filter(Boolean);
	if (!mints.length) return launches;
	try {
		const rows = await sql`
			select mint from pump_agent_mints where mint = any(${mints})
		`;
		const agentSet = new Set(rows.map((r) => r.mint));
		return launches.map((l) => ({ ...l, is_agent_token: agentSet.has(l.mint) }));
	} catch {
		// Non-fatal — caller still gets the live launches, just without the flag.
		return launches.map((l) => ({ ...l, is_agent_token: false }));
	}
}

async function loadRecentLaunches({ limit, sort }) {
	const n = Math.min(25, Math.max(1, Number(limit) || 10));
	const raw = await recentPumpLaunches({ network: 'mainnet', limit: n });
	const launches = await markAgentTokens(raw);

	// sort='liquidity' re-ranks by initial bonding-curve SOL reserves, highest first.
	if (sort === 'liquidity') {
		launches.sort((a, b) => (b.liquidity_sol ?? 0) - (a.liquidity_sol ?? 0));
	}

	const liq = launches.map((l) => l.liquidity_sol).filter((v) => v != null && v > 0);
	const avgLiq = liq.length ? liq.reduce((a, b) => a + b, 0) / liq.length : null;
	const maxLiq = liq.length ? Math.max(...liq) : null;
	const newest = launches[sort === 'liquidity' ? 0 : 0]; // feed is newest-first from source

	return {
		network: 'mainnet',
		sort: sort || 'newest',
		count: launches.length,
		newest_mint: newest?.mint || null,
		newest_name: newest?.name || null,
		newest_symbol: newest?.symbol || null,
		avg_initial_liquidity_sol: avgLiq != null ? Math.round(avgLiq * 1e4) / 1e4 : null,
		max_initial_liquidity_sol: maxLiq != null ? Math.round(maxLiq * 1e4) / 1e4 : null,
		launches,
		queried_at: new Date().toISOString(),
	};
}

export default paidEndpoint({
	route: ROUTE,
	method: 'GET',
	priceAtomics: priceFor('pump-agent-audit', '20000'),
	networks: ['base', 'solana'],
	description: DESCRIPTION,
	bazaar: BAZAAR,
	service: withService({
		serviceName: 'three.ws Pump Audit',
		tags: ['pump.fun', 'audit', 'agent', 'risk', 'solana'],
	}),
	requiredScope: 'x402:bypass',
	accessControl: installAccessControl({ requiredScope: 'x402:bypass' }),
	async handler({ req }) {
		const mint = String(req.query?.mint || '').trim();

		// LIST MODE — no mint supplied
		if (!mint) {
			const limit = req.query?.limit;
			const sort = String(req.query?.sort || 'newest').trim();
			if (sort !== 'newest' && sort !== 'liquidity') {
				const err = new Error('sort must be "newest" or "liquidity"');
				err.status = 400;
				err.code = 'invalid_sort';
				throw err;
			}
			return loadRecentLaunches({ limit, sort });
		}

		// SINGLE MODE — validate mint then audit
		if (!BASE58_RE.test(mint)) {
			const err = new Error('mint must be a base58 Solana pubkey');
			err.status = 400;
			err.code = 'invalid_mint';
			throw err;
		}
		return loadAudit(mint);
	},
});
