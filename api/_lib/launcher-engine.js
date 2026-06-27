// @ts-check
// Autonomous coin launcher engine — the Memetic Launcher.
//
// The platform-side sibling of the circulation engine (circulation.js). Where
// circulation makes a pool of real agents tip/pay/trade one another every tick,
// THIS engine makes them mint coins on pump.fun on a cadence, each one riding a
// live cultural narrative (launcher-trends.js). Every launch flows through the
// SAME real code path a human owner uses — build metadata, then the agent signs
// its OWN pump.fun create — so each coin carries a real avatar identity and lands
// in /launches and the money feed as a genuine on-chain launch. No synthetic rows.
//
// The handshake (per launch):
//   1. pick a narrative-driven coin     (launcher-sources.pickSource)
//   2. pick the next agent in rotation  (launcher_queue, oldest-first, weighted)
//   3. master tops the agent up with the per-launch SOL  (launcher-funding)
//   4. the agent builds metadata + signs its own create  (postAs → /api/pump)
//   5. record the run + advance the rotation             (launcher_runs / _queue)
//
// SAFE BY CONSTRUCTION. The engine is fully inert unless a launcher_config row is
// enabled (the seeded global row ships disabled + dry_run). dry_run selects a coin
// + agent and records the run but never moves SOL or submits a create. Hard caps
// (per-launch SOL, daily SOL, hourly count, target cadence) and an auto-tripping
// circuit breaker bound the blast radius. Never throws — every failure is contained
// and recorded.

import { sql } from './db.js';
import { env } from './env.js';
import { createSession } from './auth.js';
import { pickSource } from './launcher-sources.js';
import {
	masterBalanceSol,
	dailySpentSol,
	fundAgentForLaunch,
} from './launcher-funding.js';

const ORIGIN = env.APP_ORIGIN || 'https://three.ws';

// How few enabled agents in the rotation before we auto-enroll more, and how many
// to enroll per top-up. The global rotation draws from the circulation pool (which
// grows itself), so the launcher is autonomous end-to-end with zero curation.
const MIN_QUEUE = 3;
const ENROLL_BATCH = 12;

// Circuit breaker: this many consecutive launch FAILURES (real submit/RPC errors,
// not business-rule skips) since the last success trips the config's paused flag.
const FAIL_BREAK = 5;

// Master must hold at least (per_launch_sol + this) or we wait — a recoverable
// skip (operator tops up the master), never a breaker trip.
const MASTER_FEE_BUFFER_SOL = 0.01;

// ── schema guard ────────────────────────────────────────────────────────────────
// Self-contained so the engine runs whether or not 20260629060000_coin_launcher.sql
// has been applied. Mirrors that migration; CREATE … IF NOT EXISTS is idempotent.
let _ensured = false;
async function ensureSchema() {
	if (_ensured) return;
	await sql`
		create table if not exists launcher_config (
			id uuid primary key default gen_random_uuid(),
			scope text not null check (scope in ('global','user')),
			user_id uuid,
			enabled boolean not null default false,
			dry_run boolean not null default true,
			mode text not null default 'hybrid' check (mode in ('off','trend','meme','random','hybrid')),
			sources jsonb not null default '["coin_intel","trending","knowyourmeme","googletrends","x"]'::jsonb,
			categories jsonb not null default '[]'::jsonb,
			target_cadence_seconds integer not null default 60,
			max_per_hour integer not null default 30,
			per_launch_sol numeric(20,9) not null default 0.03,
			dev_buy_sol numeric(20,9) not null default 0,
			daily_sol_cap numeric(20,9) not null default 1,
			buyback_bps integer not null default 5000,
			network text not null default 'mainnet',
			paused boolean not null default false,
			pause_reason text,
			updated_by uuid,
			created_at timestamptz not null default now(),
			updated_at timestamptz not null default now()
		)
	`;
	await sql`create unique index if not exists launcher_config_global_uniq on launcher_config (scope) where scope = 'global'`;
	await sql`create unique index if not exists launcher_config_user_uniq on launcher_config (user_id) where scope = 'user'`;
	await sql`
		create table if not exists launcher_queue (
			agent_id uuid primary key references agent_identities(id) on delete cascade,
			scope text not null default 'user' check (scope in ('global','user')),
			user_id uuid,
			enabled boolean not null default true,
			weight integer not null default 1,
			last_launched_at timestamptz,
			launch_count integer not null default 0,
			created_at timestamptz not null default now()
		)
	`;
	await sql`create index if not exists launcher_queue_pick_idx on launcher_queue (scope, enabled, last_launched_at nulls first)`;
	await sql`
		create table if not exists launcher_runs (
			id uuid primary key default gen_random_uuid(),
			scope text not null default 'global' check (scope in ('global','user')),
			user_id uuid,
			agent_id uuid,
			kind text not null check (kind in ('trend','meme','random')),
			trigger_source text,
			trigger_detail jsonb not null default '{}'::jsonb,
			name text, symbol text, mint text,
			network text not null default 'mainnet',
			sol_spent numeric(20,9) not null default 0,
			buyback_bps integer,
			status text not null default 'pending'
				check (status in ('pending','dry_run','funded','launched','confirmed','skipped','failed')),
			dry_run boolean not null default false,
			tx_signature text, fund_signature text, error text,
			created_at timestamptz not null default now(),
			updated_at timestamptz not null default now()
		)
	`;
	await sql`create index if not exists launcher_runs_recent_idx on launcher_runs (created_at desc)`;
	await sql`create index if not exists launcher_runs_scope_idx on launcher_runs (scope, created_at desc)`;
	await sql`create index if not exists launcher_runs_spend_idx on launcher_runs (created_at) where status in ('funded','launched','confirmed')`;
	await sql`create unique index if not exists launcher_runs_mint_uniq on launcher_runs (mint) where mint is not null`;
	await sql`
		create table if not exists launcher_claims (
			id uuid primary key default gen_random_uuid(),
			run_id uuid references launcher_runs(id) on delete set null,
			agent_id uuid,
			mint text not null,
			claimed_lamports bigint not null default 0,
			claimed_sol float8 not null default 0,
			buyback_sol float8 not null default 0,
			buyback_sig text,
			claim_sig text,
			network text not null default 'mainnet',
			scope text not null default 'global',
			created_at timestamptz not null default now()
		)
	`;
	await sql`create index if not exists launcher_claims_run_idx on launcher_claims (run_id, created_at desc)`;
	await sql`create index if not exists launcher_claims_created_idx on launcher_claims (created_at desc)`;
	await sql`
		insert into launcher_config (scope, enabled, dry_run, mode)
		values ('global', false, true, 'hybrid')
		on conflict do nothing
	`;
	_ensured = true;
}

// A skip is an expected, recoverable non-event (cadence not due, cap reached, no
// agent ready) — logged as a 'skipped' run, never an error.
class Skip extends Error {}

// ── run-row helpers ─────────────────────────────────────────────────────────────
async function insertRun(cfg, coin, agent) {
	const [row] = await sql`
		insert into launcher_runs
			(scope, user_id, agent_id, kind, trigger_source, trigger_detail,
			 name, symbol, network, buyback_bps, status, dry_run)
		values (
			${cfg.scope}, ${cfg.user_id ?? null}, ${agent?.id ?? null},
			${coin.kind}, ${coin.trigger_source ?? null}, ${JSON.stringify(coin.trigger_detail ?? {})}::jsonb,
			${coin.name}, ${coin.symbol}, ${cfg.network}, ${cfg.buyback_bps},
			'pending', ${cfg.dry_run}
		)
		returning id
	`;
	return row.id;
}

async function setRun(id, fields) {
	await sql`
		update launcher_runs set
			status         = coalesce(${fields.status ?? null}, status),
			mint           = coalesce(${fields.mint ?? null}, mint),
			sol_spent      = coalesce(${fields.sol_spent ?? null}, sol_spent),
			tx_signature   = coalesce(${fields.tx_signature ?? null}, tx_signature),
			fund_signature = coalesce(${fields.fund_signature ?? null}, fund_signature),
			error          = coalesce(${fields.error ?? null}, error),
			updated_at     = now()
		where id = ${id}
	`;
}

// ── rotation ────────────────────────────────────────────────────────────────────

// Keep the rotation stocked. Global draws from the self-growing circulation pool;
// a user scope draws from that user's own avatar-bearing agents. Either way the
// engine never needs a human to curate who can launch.
async function ensureQueue(cfg) {
	const [{ c }] = await sql`
		select count(*)::int as c from launcher_queue
		where scope = ${cfg.scope} and enabled = true
	`;
	if (c >= MIN_QUEUE) return c;

	const candidates = cfg.scope === 'global'
		? await sql`
			select ai.id from agent_identities ai
			where ai.deleted_at is null and ai.is_public = true
			  and ai.avatar_id is not null
			  and (ai.meta->>'circulation') = 'true'
			  and ai.meta->>'solana_address' is not null
			  and not exists (select 1 from launcher_queue q where q.agent_id = ai.id)
			limit ${ENROLL_BATCH}
		`
		: await sql`
			select ai.id from agent_identities ai
			where ai.deleted_at is null and ai.user_id = ${cfg.user_id}
			  and ai.avatar_id is not null
			  and ai.meta->>'solana_address' is not null
			  and not exists (select 1 from launcher_queue q where q.agent_id = ai.id)
			limit ${ENROLL_BATCH}
		`;

	for (const r of candidates) {
		await sql`
			insert into launcher_queue (agent_id, scope, user_id, enabled)
			values (${r.id}, ${cfg.scope}, ${cfg.user_id ?? null}, true)
			on conflict (agent_id) do nothing
		`;
	}
	return c + candidates.length;
}

// The next agent up: enabled, avatar-bearing, with a wallet, least-recently-used
// first (weighted, with a touch of jitter so ties don't always resolve the same).
async function pickAgent(cfg) {
	const [agent] = await sql`
		select q.agent_id as id, ai.user_id, ai.name, ai.avatar_id,
		       ai.meta->>'solana_address' as solana_address
		from launcher_queue q
		join agent_identities ai on ai.id = q.agent_id and ai.deleted_at is null
		where q.scope = ${cfg.scope} and q.enabled = true
		  and ai.avatar_id is not null
		  and ai.meta->>'solana_address' is not null
		order by q.last_launched_at asc nulls first, q.weight desc, random()
		limit 1
	`;
	return agent || null;
}

// ── the real launch (metadata → agent-signed create) ─────────────────────────────
async function postAs(ownerUserId, path, body, timeoutMs = 55_000) {
	const token = await createSession({ userId: ownerUserId, userAgent: 'launcher', ip: null });
	let res;
	try {
		res = await fetch(`${ORIGIN}${path}`, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				cookie: `__Host-sid=${token}`,
				'user-agent': 'threews-launcher/1.0',
			},
			body: JSON.stringify(body),
			signal: AbortSignal.timeout(timeoutMs),
		});
	} catch (err) {
		if (err?.name === 'TimeoutError' || err?.name === 'AbortError') return { status: 0, body: null, timedOut: true };
		throw err;
	}
	let parsed = null;
	try { parsed = await res.json(); } catch { /* non-JSON */ }
	return { status: res.status, body: parsed };
}

async function launchCoin(cfg, agent, coin) {
	const meta = await postAs(agent.user_id, '/api/pump?action=build-metadata', {
		name: coin.name,
		symbol: coin.symbol,
		description: coin.description,
		agent_id: agent.id,
		avatar_id: agent.avatar_id,
	});
	if (meta.timedOut) throw new Error('metadata build timed out');
	if (meta.status !== 200 || !meta.body?.metadata_url) {
		throw new Error(`metadata build ${meta.status}: ${meta.body?.error || 'no url'}`);
	}

	const launch = await postAs(agent.user_id, '/api/pump?action=launch-agent', {
		agent_id: agent.id,
		name: coin.name,
		symbol: coin.symbol,
		uri: meta.body.metadata_url,
		network: cfg.network,
		quote_currency: 'sol',
		sol_buy_in: Number(cfg.dev_buy_sol) || 0,
		buyback_bps: cfg.buyback_bps,
		coin_type: 'agent',
	});
	if (launch.timedOut) throw new Error('launch timed out');
	const mint = launch.body?.mint || launch.body?.data?.mint;
	const sig = launch.body?.sig || launch.body?.signature || launch.body?.data?.sig || null;
	if (launch.status !== 200 || !mint) {
		throw new Error(`launch ${launch.status}: ${launch.body?.error || launch.body?.message || 'no mint'}`);
	}
	return { mint, sig };
}

// ── breaker ───────────────────────────────────────────────────────────────────
async function tripBreaker(cfg, reason) {
	await sql`
		update launcher_config set paused = true, pause_reason = ${reason}, updated_at = now()
		where id = ${cfg.id}
	`;
}

// FAIL_BREAK consecutive failures since the last success ⇒ trip. Counts only real
// launch outcomes (launched/confirmed/failed), ignoring skips.
async function shouldTripBreaker(cfg) {
	const rows = await sql`
		select status from launcher_runs
		where scope = ${cfg.scope}
		  and ${cfg.scope === 'user' ? sql`user_id = ${cfg.user_id}` : sql`true`}
		  and status in ('launched', 'confirmed', 'failed')
		order by created_at desc
		limit ${FAIL_BREAK}
	`;
	return rows.length >= FAIL_BREAK && rows.every((r) => r.status === 'failed');
}

// ── per-scope tick ───────────────────────────────────────────────────────────────
async function runScopeTick(cfg) {
	if (cfg.paused) return { scope: cfg.scope, skipped: `paused: ${cfg.pause_reason || 'breaker'}` };
	if (cfg.mode === 'off') return { scope: cfg.scope, skipped: 'mode off' };

	const userFilter = cfg.scope === 'user' ? sql`and user_id = ${cfg.user_id}` : sql``;

	// Cadence gate — only one launch attempt per target_cadence_seconds.
	const [last] = await sql`
		select created_at from launcher_runs
		where scope = ${cfg.scope} ${userFilter}
		  and status in ('dry_run', 'funded', 'launched', 'confirmed')
		order by created_at desc limit 1
	`;
	if (last) {
		const elapsed = (Date.now() - new Date(last.created_at).getTime()) / 1000;
		if (elapsed < cfg.target_cadence_seconds) {
			return { scope: cfg.scope, skipped: `cadence (${Math.round(elapsed)}s/${cfg.target_cadence_seconds}s)` };
		}
	}

	// Hourly ceiling.
	if (cfg.max_per_hour > 0) {
		const [{ c: hourCount }] = await sql`
			select count(*)::int as c from launcher_runs
			where scope = ${cfg.scope} ${userFilter}
			  and status in ('dry_run', 'funded', 'launched', 'confirmed')
			  and created_at > now() - interval '1 hour'
		`;
		if (hourCount >= cfg.max_per_hour) {
			return { scope: cfg.scope, skipped: `hourly cap (${hourCount}/${cfg.max_per_hour})` };
		}
	}

	// Daily SOL ceiling (real launches only; dry_run never spends).
	const dailyRemaining = cfg.dry_run
		? Infinity
		: Number(cfg.daily_sol_cap) - (await dailySpentSol(cfg.scope, cfg.user_id || null));
	if (!cfg.dry_run && dailyRemaining <= 0) {
		return { scope: cfg.scope, skipped: `daily SOL cap reached (${cfg.daily_sol_cap})` };
	}

	// Stock + pick the rotation.
	const queued = await ensureQueue(cfg);
	if (queued < 1) return { scope: cfg.scope, skipped: 'no launch-ready agents (need avatar + wallet)' };
	const agent = await pickAgent(cfg);
	if (!agent) return { scope: cfg.scope, skipped: 'no eligible agent this tick' };

	// Decide WHAT to launch — narrative-driven (launcher-trends via pickSource).
	const coin = await pickSource({
		mode: cfg.mode,
		network: cfg.network,
		categories: Array.isArray(cfg.categories) ? cfg.categories : [],
		sources: Array.isArray(cfg.sources) ? cfg.sources : undefined,
	});

	const runId = await insertRun(cfg, coin, agent);

	// Dry run: chose a coin + agent, recorded it, moved nothing.
	if (cfg.dry_run) {
		await setRun(runId, { status: 'dry_run' });
		await sql`update launcher_queue set last_launched_at = now() where agent_id = ${agent.id}`;
		return { scope: cfg.scope, dry_run: true, agent: agent.name, name: coin.name, symbol: coin.symbol, kind: coin.kind, top: coin.trigger_detail?.top_narrative || null };
	}

	// Master balance breaker — recoverable wait, not a trip.
	const perLaunch = Number(cfg.per_launch_sol);
	const masterSol = await masterBalanceSol(cfg.network);
	if (masterSol == null) {
		await setRun(runId, { status: 'skipped', error: 'master launch wallet not configured' });
		return { scope: cfg.scope, skipped: 'master wallet not configured' };
	}
	if (masterSol < perLaunch + MASTER_FEE_BUFFER_SOL) {
		await setRun(runId, { status: 'skipped', error: `master balance ${masterSol} SOL below ${perLaunch} + buffer` });
		return { scope: cfg.scope, skipped: `master low (${masterSol.toFixed(4)} SOL)` };
	}

	// Fund the agent from master (guarded by per-launch + daily caps).
	const fund = await fundAgentForLaunch({
		agentAddress: agent.solana_address,
		sol: perLaunch,
		perLaunchCapSol: perLaunch,
		dailyCapSol: dailyRemaining,
		network: cfg.network,
		memo: `three.ws launcher · ${coin.symbol}`,
	});
	if (!fund.ok) {
		await setRun(runId, { status: 'skipped', error: fund.reason });
		return { scope: cfg.scope, skipped: `fund refused: ${fund.reason}` };
	}
	await setRun(runId, { status: 'funded', fund_signature: fund.signature, sol_spent: perLaunch });

	// The agent signs its own create.
	try {
		const { mint, sig } = await launchCoin(cfg, agent, coin);
		await setRun(runId, { status: 'confirmed', mint, tx_signature: sig });
		await sql`
			update launcher_queue
			set last_launched_at = now(), launch_count = launch_count + 1
			where agent_id = ${agent.id}
		`;
		return { scope: cfg.scope, agent: agent.name, name: coin.name, symbol: coin.symbol, kind: coin.kind, mint, top: coin.trigger_detail?.top_narrative || null };
	} catch (e) {
		await setRun(runId, { status: 'failed', error: String(e?.message || e).slice(0, 300) });
		// Still advance the rotation so one bad agent can't wedge the whole queue.
		await sql`update launcher_queue set last_launched_at = now() where agent_id = ${agent.id}`;
		if (await shouldTripBreaker(cfg)) {
			await tripBreaker(cfg, `${FAIL_BREAK} consecutive launch failures`);
			return { scope: cfg.scope, error: e?.message, breaker_tripped: true };
		}
		return { scope: cfg.scope, error: e?.message };
	}
}

// ── public entry ────────────────────────────────────────────────────────────────
/**
 * Run one launcher tick across every enabled scope. Safe to call on a schedule;
 * fully inert unless a launcher_config row is enabled. Never throws — each scope is
 * isolated and every failure is contained and recorded.
 * @returns {Promise<{ok:true, scopes:number, results:object[]}>}
 */
export async function runLauncherTick() {
	await ensureSchema();

	const configs = await sql`
		select * from launcher_config where enabled = true order by scope = 'global' desc
	`;
	if (!configs.length) return { ok: true, scopes: 0, results: [], note: 'no enabled launcher config' };

	const results = [];
	for (const cfg of configs) {
		// Normalise jsonb columns the driver may hand back as strings.
		cfg.sources = typeof cfg.sources === 'string' ? safeJson(cfg.sources, []) : cfg.sources;
		cfg.categories = typeof cfg.categories === 'string' ? safeJson(cfg.categories, []) : cfg.categories;
		cfg.target_cadence_seconds = Number(cfg.target_cadence_seconds) || 60;
		cfg.max_per_hour = Number(cfg.max_per_hour) || 0;
		cfg.buyback_bps = cfg.buyback_bps == null ? 5000 : Number(cfg.buyback_bps);
		try {
			results.push({ ok: true, ...(await runScopeTick(cfg)) });
		} catch (e) {
			if (e instanceof Skip) {
				results.push({ ok: false, scope: cfg.scope, skipped: e.message });
			} else {
				console.error('[launcher] scope tick failed', cfg.scope, e?.message);
				results.push({ ok: false, scope: cfg.scope, error: String(e?.message || e).slice(0, 300) });
			}
		}
	}
	return { ok: true, scopes: configs.length, results };
}

function safeJson(s, dflt) {
	try { return JSON.parse(s); } catch { return dflt; }
}
