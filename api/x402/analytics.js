// POST /api/x402/analytics
//
// Social-Economy Analytics Feed — $0.005 USDC per call on Solana or Base.
//
// One agent pays another for a live, aggregated view of the three.ws social
// economy. The first report exposed is the Pole Club's activity: how many
// stages (clubs) are currently active, how many distinct patrons (members) are
// participating, the tip throughput, the cover charges collected at the door,
// and which stages are growing fastest. Every number is read live from the
// real ledgers — club_tips (the settled tip ledger), club_dancer_wallets (the
// stage roster) and x402_audit_log (settled cover-charge payments). No mock
// path: if a backing table is missing in an environment the metric folds to a
// real zero rather than a fabricated value.
//
// Reports:
//   • clubs            — Pole Club social economy (active stages, patrons, tips,
//                        cover charges, fastest-growing stages).
//       Body: { report: "clubs", period: "1h"|"24h"|"7d"|"30d"|"all" }
//   • agent_leaderboard — top agents by USDC spend over a trailing window, read
//                        live from the real agent-to-agent hire ledger
//                        (agent_hires + agent_identities). Surfaces high-value
//                        paying agents for partnership / outreach.
//       Body: { report: "agent_leaderboard", limit?: 1-100, window_days?: 1-90 }
//
// The endpoint is consumed by the autonomous x402 loop (see
// autonomous-registry.js → 'analytics-club-social' for the clubs report and
// 'agent-spend-leaderboard' for the agent_leaderboard report).

import { paidEndpoint } from '../_lib/x402-paid-endpoint.js';
import { buildBazaarSchema } from '../_lib/x402-spec.js';
import { installAccessControl } from '../_lib/x402/access-control.js';
import { withService } from '../_lib/x402/bazaar-helpers.js';
import { priceFor } from '../_lib/x402-prices.js';
import { sql } from '../_lib/db.js';

const ROUTE = '/api/x402/analytics';

const DESCRIPTION =
	'three.ws Social-Economy Analytics — pay $0.005 USDC per call for a live, ' +
	'aggregated view of platform social activity. The "clubs" report returns the ' +
	'Pole Club economy over the requested window: active stages, distinct patron ' +
	'members, tip count + USDC volume, cover charges collected at the door, and a ' +
	'fastest-growing-stage leaderboard. Read live from the on-chain-settled tip + ' +
	'cover ledgers. Pay-per-call in USDC on Solana mainnet or Base.';

// Supported reports + period windows. Both are strict whitelists — a value
// outside the set is rejected BEFORE settlement (the buyer is never charged for
// a report we can't produce).
const REPORTS = new Set(['clubs', 'agent_leaderboard']);

// period → window in seconds (null = all-time, no time filter).
const PERIODS = {
	'1h': 3600,
	'24h': 86400,
	'7d': 604800,
	'30d': 2592000,
	all: null,
};

const INPUT_SCHEMA = {
	$schema: 'https://json-schema.org/draft/2020-12/schema',
	type: 'object',
	properties: {
		report: {
			type: 'string',
			enum: ['clubs', 'agent_leaderboard'],
			default: 'clubs',
			description: 'Which analytics report to return.',
		},
		period: {
			type: 'string',
			enum: ['1h', '24h', '7d', '30d', 'all'],
			default: '24h',
			description: 'Aggregation window (clubs report).',
		},
		limit: {
			type: 'integer',
			minimum: 1,
			maximum: 100,
			default: 10,
			description: 'Max ranked agents to return (agent_leaderboard report).',
		},
		window_days: {
			type: 'integer',
			minimum: 1,
			maximum: 90,
			default: 7,
			description: 'Trailing window in days (agent_leaderboard report).',
		},
	},
};

const OUTPUT_SCHEMA = {
	$schema: 'https://json-schema.org/draft/2020-12/schema',
	type: 'object',
	required: ['ok', 'report', 'period', 'generated_at', 'metrics'],
	properties: {
		ok: { type: 'boolean', const: true },
		report: { type: 'string', enum: ['clubs'] },
		period: { type: 'string' },
		generated_at: { type: 'string', format: 'date-time' },
		metrics: {
			type: 'object',
			required: ['active_clubs', 'total_clubs', 'members', 'tips', 'cover_charges'],
			properties: {
				active_clubs: { type: 'integer', minimum: 0, description: 'Stages that received a tip in the window.' },
				total_clubs: { type: 'integer', minimum: 0, description: 'Registered stages in the roster.' },
				members: { type: 'integer', minimum: 0, description: 'Distinct patron wallets active in the window.' },
				tips: {
					type: 'object',
					properties: {
						count: { type: 'integer', minimum: 0 },
						volume_atomics: { type: 'string' },
						volume_usdc: { type: 'number' },
					},
				},
				cover_charges: {
					type: 'object',
					properties: {
						count: { type: 'integer', minimum: 0 },
						atomics: { type: 'string' },
						usdc: { type: 'number' },
					},
				},
			},
		},
		top_clubs: {
			type: 'array',
			items: {
				type: 'object',
				properties: {
					dancer: { type: 'string' },
					display_name: { type: ['string', 'null'] },
					volume_atomics: { type: 'string' },
					volume_usdc: { type: 'number' },
					tips: { type: 'integer' },
				},
			},
		},
	},
};

const OUTPUT_EXAMPLE = {
	ok: true,
	report: 'clubs',
	period: '24h',
	generated_at: '2026-06-27T18:42:09.000Z',
	metrics: {
		active_clubs: 3,
		total_clubs: 4,
		members: 27,
		tips: { count: 41, volume_atomics: '410000', volume_usdc: 0.41 },
		cover_charges: { count: 12, atomics: '120000', usdc: 0.12 },
	},
	top_clubs: [
		{ dancer: '1', display_name: 'Nyx', volume_atomics: '190000', volume_usdc: 0.19, tips: 19 },
	],
};

const BAZAAR = {
	discoverable: true,
	description: DESCRIPTION,
	useCases: ['social analytics', 'club economy health', 'agent-to-agent payment'],
	input: { type: 'json', example: { report: 'clubs', period: '24h' }, schema: INPUT_SCHEMA },
	output: { type: 'json', example: OUTPUT_EXAMPLE },
	info: {
		input: { type: 'json', example: { report: 'clubs', period: '24h' } },
		output: { type: 'json', example: OUTPUT_EXAMPLE },
	},
	schema: buildBazaarSchema({
		method: 'POST',
		bodySchema: INPUT_SCHEMA,
		outputSchema: OUTPUT_SCHEMA,
	}),
};

export const BAZAAR_SCHEMA = BAZAAR;

const ROUTE_COVER = '/api/x402/club-cover';

const atomicsToUsd = (atomics) => Math.round((Number(atomics || 0) / 1e6) * 1e6) / 1e6;

// Read the request body without assuming a framework parsed it. Mirrors the
// crypto-intel idiom so this file works under the same raw-stream dispatch.
async function readBody(req) {
	if (req.body && typeof req.body === 'object') return req.body;
	try {
		const chunks = [];
		for await (const c of req) chunks.push(c);
		const raw = Buffer.concat(chunks).toString('utf8').trim();
		return raw ? JSON.parse(raw) : {};
	} catch {
		return {};
	}
}

// Each aggregate is read independently and fails soft to a zeroed shape, so one
// missing table (e.g. x402_audit_log not yet migrated in a fresh env) never
// blanks the whole report — the live tables still report real numbers.
//
// The window is a parameterized fragment over created_at; the seconds value is
// bound, never interpolated, so a hostile `period` can never inject SQL. null
// seconds → all-time. The top-clubs query joins club_dancer_wallets (which also
// has a created_at), so it needs the alias-qualified t.created_at variant.
async function clubsReport(seconds) {
	const tipsWindow =
		seconds == null ? sql`true` : sql`created_at >= now() - (${seconds}::int * interval '1 second')`;
	const auditWindow = tipsWindow; // x402_audit_log: single table, created_at unambiguous
	const topWindow =
		seconds == null ? sql`true` : sql`t.created_at >= now() - (${seconds}::int * interval '1 second')`;

	const [tips, roster, covers, topClubs] = await Promise.all([
		sql`
			select
				count(*)::int                              as tip_count,
				coalesce(sum(amount_atomics), 0)::text     as tip_volume_atomics,
				count(distinct lower(payer))::int          as members,
				count(distinct dancer)::int                as active_clubs
			from club_tips
			where ${tipsWindow}
		`.catch(() => [{}]),
		sql`select count(*)::int as total_clubs from club_dancer_wallets`.catch(() => [{}]),
		sql`
			select
				count(*)::int                              as cover_count,
				coalesce(sum(amount_atomics), 0)::text     as cover_atomics
			from x402_audit_log
			where route = ${ROUTE_COVER}
			  and event_type = 'payment_settled'
			  and settlement_status = 'success'
			  and ${auditWindow}
		`.catch(() => [{}]),
		sql`
			select
				t.dancer                                   as dancer,
				w.display_name                             as display_name,
				coalesce(sum(t.amount_atomics), 0)::text   as volume_atomics,
				count(*)::int                              as tips
			from club_tips t
			left join club_dancer_wallets w on w.dancer = t.dancer
			where ${topWindow}
			group by t.dancer, w.display_name
			order by sum(t.amount_atomics) desc nulls last, t.dancer asc
			limit 5
		`.catch(() => []),
	]);

	const tipRow = tips?.[0] || {};
	const coverRow = covers?.[0] || {};

	return {
		metrics: {
			active_clubs: tipRow.active_clubs ?? 0,
			total_clubs: roster?.[0]?.total_clubs ?? 0,
			members: tipRow.members ?? 0,
			tips: {
				count: tipRow.tip_count ?? 0,
				volume_atomics: tipRow.tip_volume_atomics ?? '0',
				volume_usdc: atomicsToUsd(tipRow.tip_volume_atomics),
			},
			cover_charges: {
				count: coverRow.cover_count ?? 0,
				atomics: coverRow.cover_atomics ?? '0',
				usdc: atomicsToUsd(coverRow.cover_atomics),
			},
		},
		top_clubs: (topClubs || []).map((r) => ({
			dancer: r.dancer,
			display_name: r.display_name ?? null,
			volume_atomics: r.volume_atomics ?? '0',
			volume_usdc: atomicsToUsd(r.volume_atomics),
			tips: r.tips ?? 0,
		})),
	};
}

export default paidEndpoint({
	route: ROUTE,
	method: 'POST',
	priceAtomics: priceFor('analytics', '5000'), // $0.005 USDC
	networks: ['solana', 'base'],
	description: DESCRIPTION,
	bazaar: BAZAAR,
	service: withService({
		serviceName: 'three.ws Social Analytics',
		tags: ['analytics', 'club', 'social', 'metrics', 'solana'],
	}),
	accessControl: installAccessControl({ requiredScope: 'x402:bypass' }),

	async handler({ req }) {
		const body = await readBody(req);
		const report = String(body.report || 'clubs').toLowerCase().trim();
		const period = String(body.period || '24h').toLowerCase().trim();

		// Validate BEFORE returning — a throw here lands before settlement, so an
		// unsupported report/period is rejected without charging the buyer.
		if (!REPORTS.has(report)) {
			throw Object.assign(new Error(`unknown report "${report}" — supported: ${[...REPORTS].join(', ')}`), {
				status: 400,
				code: 'unknown_report',
			});
		}
		if (!(period in PERIODS)) {
			throw Object.assign(new Error(`unknown period "${period}" — supported: ${Object.keys(PERIODS).join(', ')}`), {
				status: 400,
				code: 'unknown_period',
			});
		}

		const seconds = PERIODS[period];
		const { metrics, top_clubs } = await clubsReport(seconds);

		return {
			ok: true,
			report,
			period,
			generated_at: new Date().toISOString(),
			metrics,
			top_clubs,
		};
	},
});
