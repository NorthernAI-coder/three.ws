// GET /api/agents/:id/economy — the owner-facing economy summary for one agent.
//
// "Your avatar has a job." This is the single read behind the wallet hub's Earn
// tab: every dollar the agent has earned (skill sales + tips) and every dollar
// it has spent paying other services over x402, plus the live spend policy that
// keeps autonomous spending safe, and a unified receipts statement. Every number
// traces to a real ledger row — agent_custody_events, agent_revenue_events,
// skill_purchases — never a mock.
//
// Owner-only: these are the agent owner's private financials. Ownership is
// asserted the same way as the rest of the owner-gated wallet surface
// (agent_identities.user_id === auth.userId). A public "earned $X" brag uses the
// public pulse agent-summary instead; this endpoint never leaks to a visitor.
//
//   earnings : skill sales + tips, windowed today / 7d / lifetime (USD)
//   spending : x402 agent-to-agent payments, windowed (USD)
//   policy   : daily/per-tx caps, allowlist size, frozen, today's spend
//   receipts : recent in + out movements as a clean statement
//   peers    : top counterparties the agent has paid (the A2A network edge)

import { getSessionUser, authenticateBearer, extractBearer } from '../../_lib/auth.js';
import { cors, json, method, wrap, error } from '../../_lib/http.js';
import { sql } from '../../_lib/db.js';
import { getSpendLimits, getDailySpendUsd } from '../../_lib/agent-trade-guards.js';
import { env } from '../../_lib/env.js';

// Skill prices are denominated in USDC (6 decimals) across the platform — the
// pricing UI bills in USDC and net_amount is stored in that mint's atomic units.
// We surface USDC earnings as USD 1:1 (the dominant, priceable case) and report
// any non-USDC sales as a count so nothing is silently dropped or mis-priced.
const USDC_MINT = env.X402_ASSET_MINT_SOLANA || 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

const RECEIPTS_LIMIT = 40;
const PEERS_LIMIT = 8;

async function resolveAuth(req) {
	const session = await getSessionUser(req).catch(() => null);
	if (session) return { userId: session.id };
	const bearer = await authenticateBearer(extractBearer(req)).catch(() => null);
	if (bearer) return { userId: bearer.userId };
	return null;
}

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'GET,OPTIONS', credentials: true })) return;
	if (!method(req, res, ['GET'])) return;

	const url = new URL(req.url, 'http://x');
	const id = url.searchParams.get('id') || url.pathname.split('/').filter(Boolean)[2];
	const network = url.searchParams.get('network') === 'devnet' ? 'devnet' : 'mainnet';

	const auth = await resolveAuth(req);
	if (!auth) return error(res, 401, 'unauthorized', 'sign in required');

	// Ownership gate — private financials are owner-only, enforced server-side.
	const [agent] = await sql`
		SELECT id, user_id, name, skills, meta FROM agent_identities
		WHERE id = ${id} AND deleted_at IS NULL
	`;
	if (!agent) return error(res, 404, 'not_found', 'agent not found');
	if (agent.user_id !== auth.userId) return error(res, 403, 'forbidden', 'not your agent');

	try {
		const [
			skillEarn,
			tips,
			spend,
			pricedSkills,
			tipReceipts,
			saleReceipts,
			spendReceipts,
			peers,
			spentTodayUsd,
		] = await Promise.all([
			// Skill sales (creator net), windowed. USDC atomic → USD (1:1, 6dp).
			// agent_revenue_events is the real, written-on-confirm revenue ledger
			// (marketplace purchases + x402 skill invocations both land here); the
			// non-USDC tail is counted, never silently dropped.
			sql`
				SELECT
					COALESCE(SUM(net_amount) FILTER (WHERE currency_mint = ${USDC_MINT} AND created_at >= date_trunc('day', now())), 0)::text AS today,
					COALESCE(SUM(net_amount) FILTER (WHERE currency_mint = ${USDC_MINT} AND created_at >= now() - interval '7 days'), 0)::text AS week,
					COALESCE(SUM(net_amount) FILTER (WHERE currency_mint = ${USDC_MINT}), 0)::text AS lifetime,
					COUNT(*) FILTER (WHERE currency_mint = ${USDC_MINT})::int AS count,
					COUNT(*) FILTER (WHERE currency_mint <> ${USDC_MINT})::int AS non_usdc_count
				FROM agent_revenue_events
				WHERE agent_id = ${id}
			`,
			// Tips received (already USD-priced on the custody row).
			sql`
				SELECT
					COALESCE(SUM(usd) FILTER (WHERE created_at >= date_trunc('day', now())), 0)::float8 AS today,
					COALESCE(SUM(usd) FILTER (WHERE created_at >= now() - interval '7 days'), 0)::float8 AS week,
					COALESCE(SUM(usd), 0)::float8 AS lifetime,
					COUNT(*)::int AS count
				FROM agent_custody_events
				WHERE agent_id = ${id} AND network = ${network}
				  AND event_type = 'tip' AND status IN ('ok', 'confirmed')
			`,
			// Outbound agent-to-agent payments over x402 (USD-priced).
			sql`
				SELECT
					COALESCE(SUM(usd) FILTER (WHERE created_at >= date_trunc('day', now())), 0)::float8 AS today,
					COALESCE(SUM(usd) FILTER (WHERE created_at >= now() - interval '7 days'), 0)::float8 AS week,
					COALESCE(SUM(usd), 0)::float8 AS lifetime,
					COUNT(*)::int AS count
				FROM agent_custody_events
				WHERE agent_id = ${id} AND network = ${network}
				  AND event_type = 'spend' AND category = 'x402'
				  AND status IN ('ok', 'confirmed', 'pending')
			`,
			// The earning engine: active priced skills.
			sql`
				SELECT skill, amount, currency_mint, pricing_type
				FROM agent_skill_prices
				WHERE agent_id = ${id} AND is_active = true
				ORDER BY amount DESC
			`,
			// Inbound receipts — tips.
			sql`
				SELECT id, usd, amount_lamports, signature, created_at, meta
				FROM agent_custody_events
				WHERE agent_id = ${id} AND network = ${network}
				  AND event_type = 'tip' AND status IN ('ok', 'confirmed')
				ORDER BY created_at DESC
				LIMIT ${RECEIPTS_LIMIT}
			`,
			// Inbound receipts — skill sales. agent_revenue_events carries the
			// skill + net itself; we LEFT JOIN the originating marketplace purchase
			// (intent_id is `sp_<purchase_id>`) for the buyer + on-chain tx when the
			// sale came through the marketplace. x402 skill invocations have no
			// purchase row and simply show without a buyer/tx — still a real receipt.
			sql`
				SELECT e.id, e.net_amount, e.gross_amount, e.currency_mint, e.created_at,
				       e.skill, sp.tx_signature, sp.user_id AS buyer_user_id
				FROM agent_revenue_events e
				LEFT JOIN skill_purchases sp ON ('sp_' || sp.id::text) = e.intent_id
				WHERE e.agent_id = ${id}
				ORDER BY e.created_at DESC
				LIMIT ${RECEIPTS_LIMIT}
			`,
			// Outbound receipts — x402 payments.
			sql`
				SELECT id, usd, signature, destination, status, created_at, meta
				FROM agent_custody_events
				WHERE agent_id = ${id} AND network = ${network}
				  AND event_type = 'spend' AND category = 'x402'
				  AND status IN ('ok', 'confirmed', 'pending')
				ORDER BY created_at DESC
				LIMIT ${RECEIPTS_LIMIT}
			`,
			// Top counterparties the agent has paid — the A2A network edge.
			sql`
				SELECT destination, COUNT(*)::int AS count,
				       COALESCE(SUM(usd), 0)::float8 AS usd,
				       MAX(created_at) AS last_at
				FROM agent_custody_events
				WHERE agent_id = ${id} AND network = ${network}
				  AND event_type = 'spend' AND category = 'x402'
				  AND status IN ('ok', 'confirmed') AND destination IS NOT NULL
				GROUP BY destination
				ORDER BY usd DESC
				LIMIT ${PEERS_LIMIT}
			`,
			getDailySpendUsd(id, network).catch(() => null),
		]);

		const usdc = (atomic) => Number(BigInt(atomic || '0')) / 1e6;
		const se = skillEarn[0] || {};
		const tp = tips[0] || {};
		const sp = spend[0] || {};

		const earnings = {
			skill_sales: {
				today: usdc(se.today),
				week: usdc(se.week),
				lifetime: usdc(se.lifetime),
				count: Number(se.count || 0),
				non_usdc_count: Number(se.non_usdc_count || 0),
			},
			tips: {
				today: Number(tp.today || 0),
				week: Number(tp.week || 0),
				lifetime: Number(tp.lifetime || 0),
				count: Number(tp.count || 0),
			},
		};
		earnings.total = {
			today: earnings.skill_sales.today + earnings.tips.today,
			week: earnings.skill_sales.week + earnings.tips.week,
			lifetime: earnings.skill_sales.lifetime + earnings.tips.lifetime,
			count: earnings.skill_sales.count + earnings.tips.count,
		};

		const spending = {
			x402: {
				today: Number(sp.today || 0),
				week: Number(sp.week || 0),
				lifetime: Number(sp.lifetime || 0),
				count: Number(sp.count || 0),
			},
		};

		const lim = getSpendLimits(agent.meta);
		const policy = {
			daily_usd: lim.daily_usd,
			per_tx_usd: lim.per_tx_usd,
			allowlist_count: lim.withdraw_allowlist.length,
			frozen: lim.frozen === true,
			spent_today_usd: spentTodayUsd == null ? null : Number(spentTodayUsd),
		};

		// Merge inbound + outbound into one statement, newest first.
		const receipts = [];
		for (const r of tipReceipts) {
			receipts.push({
				id: `tip-${r.id}`,
				direction: 'in',
				kind: 'tip',
				usd: r.usd != null ? Number(r.usd) : null,
				sol: r.amount_lamports != null ? Number(r.amount_lamports) / 1e9 : null,
				counterparty: r.meta?.from || null,
				label: 'Tip received',
				signature: r.signature || null,
				status: 'confirmed',
				created_at: r.created_at,
			});
		}
		for (const r of saleReceipts) {
			receipts.push({
				id: `sale-${r.id}`,
				direction: 'in',
				kind: 'skill_sale',
				usd: r.currency_mint === USDC_MINT ? Number(BigInt(r.net_amount || '0')) / 1e6 : null,
				counterparty: r.buyer_user_id || null,
				label: r.skill ? `Skill sold · ${r.skill}` : 'Skill sold',
				skill: r.skill || null,
				signature: r.tx_signature || null,
				status: 'confirmed',
				created_at: r.created_at,
			});
		}
		for (const r of spendReceipts) {
			receipts.push({
				id: `pay-${r.id}`,
				direction: 'out',
				kind: 'x402',
				usd: r.usd != null ? Number(r.usd) : null,
				counterparty: r.destination || null,
				label: r.meta?.service || (r.meta?.url ? hostOf(r.meta.url) : 'Service payment'),
				resource: r.meta?.url || null,
				signature: r.signature || null,
				status: r.status || 'confirmed',
				created_at: r.created_at,
			});
		}
		receipts.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

		return json(res, 200, {
			data: {
				agent_id: id,
				network,
				earnings,
				spending,
				policy,
				all_skills: Array.isArray(agent.skills)
					? agent.skills.map((s) => (typeof s === 'string' ? s : s?.name)).filter(Boolean)
					: [],
				listed_skills: pricedSkills.map((p) => ({
					skill: p.skill,
					amount: String(p.amount),
					currency_mint: p.currency_mint,
					pricing_type: p.pricing_type,
				})),
				receipts: receipts.slice(0, RECEIPTS_LIMIT),
				peers: peers.map((p) => ({
					address: p.destination,
					count: Number(p.count || 0),
					usd: Number(p.usd || 0),
					last_at: p.last_at,
				})),
			},
		});
	} catch (e) {
		console.error('[agents/economy] failed', e?.message);
		return error(res, 502, 'economy_failed', 'could not load the economy summary');
	}
});

function hostOf(u) {
	try {
		return new URL(u).host;
	} catch {
		return String(u || '').slice(0, 48);
	}
}
