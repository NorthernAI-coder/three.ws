// @ts-check
// Platform subsystem health — the single gatherer that answers "is the platform
// actually healthy right now?" beyond "did the endpoint return 200".
//
// The uptime monitor (api/cron/uptime-check.js) probes public-surface
// REACHABILITY. That's necessary but not sufficient: a surface can answer 200
// while Redis is on memory-fallback, the x402 ring is half-armed, Helius is in
// quota cooldown, or world.three.ws is unprotected — every one of these was
// live in the 2026-07-03 production log export yet invisible to a reachability
// probe. This module reads the in-process degradation state each subsystem
// already tracks (cache circuit breaker, Helius breaker, ring invariants) plus a
// live DB ping and the world-health cron's parked outcome, and rolls them into
// one structured verdict.
//
// Consumed by:
//   - api/healthz.js         → `subsystems` block (live, per-request)
//   - api/status.js          → public status feed + /status page
//   - api/cron/uptime-check.js → rolling health snapshots + escalation digest
//
// Every check is defensive: a check that throws becomes `unknown`, never an
// exception into the caller. Reads are cheap (module-state gauges + one DB ping),
// so this is safe on a per-request path.
//
// Status vocabulary:
//   ok        — healthy.
//   degraded  — functional but running on a fallback / throttled path.
//   down      — not functional (a hard dependency is unreachable).
//   paused    — intentionally off (an operator switch), not a fault.
//   unknown   — no signal yet (a cron hasn't reported, a probe was skipped).
// Only `degraded` and `down` count against the overall roll-up; `paused` and
// `unknown` are surfaced but neutral.

import { cacheHealth, cacheGet } from '../cache.js';
import { heliusHealth } from '../balances.js';
import { checkRingInvariants } from '../x402/ring-allowlist.js';

const DB_PING_TIMEOUT_MS = 2_500;
const DB_SLOW_MS = 1_000;
const WORLD_HEALTH_CACHE_KEY = 'world:health';
// A parked world-health outcome older than this is treated as stale/unknown
// rather than trusted — the 15-min cron should refresh it well within the window.
const WORLD_STALE_MS = 90 * 60 * 1000;

/** Statuses that pull the overall roll-up down, worst first. */
const UNHEALTHY = ['down', 'degraded'];

function worstOf(statuses) {
	if (statuses.includes('down')) return 'down';
	if (statuses.includes('degraded')) return 'degraded';
	return 'ok';
}

// ── Individual subsystem checks. Each returns a subsystem record and never
//    throws; a failure to determine state resolves to `unknown`. ──────────────

async function checkDatabase() {
	const base = { name: 'database', label: 'Database (Neon)' };
	try {
		const { sql } = await import('../db.js');
		const started = Date.now();
		await Promise.race([
			sql`SELECT 1`,
			new Promise((_, reject) =>
				setTimeout(() => reject(new Error('db ping exceeded deadline')), DB_PING_TIMEOUT_MS),
			),
		]);
		const ms = Date.now() - started;
		if (ms >= DB_SLOW_MS) {
			return { ...base, status: 'degraded', detail: `slow ping: ${ms}ms`, latencyMs: ms, hint: 'Neon compute may be saturated or cold — check the pooler and compute size.' };
		}
		return { ...base, status: 'ok', detail: `ping ${ms}ms`, latencyMs: ms };
	} catch (err) {
		return {
			...base,
			status: 'down',
			detail: err?.message || 'ping failed',
			hint: 'DATABASE_URL missing/rotated or Neon compute suspended. Audit writes and reads fail until restored.',
		};
	}
}

function checkCache() {
	const base = { name: 'cache', label: 'Cache (Upstash Redis)' };
	try {
		const h = cacheHealth();
		if (!h.configured) {
			return { ...base, status: 'ok', detail: 'in-memory (no Redis configured)', backend: h.backend };
		}
		if (h.degraded) {
			const why = h.circuitOpen
				? `circuit open, reopens in ${Math.round(h.circuitReopensInMs / 1000)}s`
				: 'SET writes suppressed';
			return {
				...base,
				status: 'degraded',
				detail: `${why}; serving from memory (${h.totalSetFailures} SET fails, ${h.totalCircuitOpens} opens since start)`,
				backend: h.backend,
				metrics: { totalSetFailures: h.totalSetFailures, totalCircuitOpens: h.totalCircuitOpens },
				hint: 'Upstash is timing out — use a same-region cache store or raise CACHE_REDIS_CMD_TIMEOUT_MS. Reads keep serving.',
			};
		}
		return { ...base, status: 'ok', detail: `upstash healthy`, backend: h.backend, metrics: { totalSetFailures: h.totalSetFailures, totalCircuitOpens: h.totalCircuitOpens } };
	} catch (err) {
		return { ...base, status: 'unknown', detail: err?.message || 'unreadable' };
	}
}

function checkHelius() {
	const base = { name: 'helius', label: 'Helius RPC (balances)' };
	try {
		const h = heliusHealth();
		if (!h.configured) {
			return { ...base, status: 'ok', detail: 'public RPC (no Helius key)' };
		}
		if (h.degraded) {
			return {
				...base,
				status: 'degraded',
				detail: `quota cooldown ${Math.round(h.cooldownRemainingMs / 60_000)}min left; on public RPC (${h.quotaTripsSinceStart} trips since start)`,
				metrics: { quotaTripsSinceStart: h.quotaTripsSinceStart },
				hint: 'Helius plan quota exhausted — raise the plan/quota. Balances still serve from the public RPC.',
			};
		}
		return { ...base, status: 'ok', detail: 'premium RPC healthy', metrics: { quotaTripsSinceStart: h.quotaTripsSinceStart } };
	} catch (err) {
		return { ...base, status: 'unknown', detail: err?.message || 'unreadable' };
	}
}

function checkRing() {
	const base = { name: 'x402_ring', label: 'x402 autonomous ring' };
	try {
		// An explicit operator pause is a chosen state, not a fault — report it as
		// `paused` so it's visible without dragging the platform to "degraded".
		if (process.env.X402_AUTONOMOUS_ENABLED === 'false') {
			return { ...base, status: 'paused', detail: 'spend loop paused (X402_AUTONOMOUS_ENABLED=false)' };
		}
		const { ok, violations } = checkRingInvariants();
		if (ok) {
			return { ...base, status: 'ok', detail: 'armed; closed-loop guards satisfied' };
		}
		// Enabled but guards unsatisfied: the loop fails CLOSED (no spend) and this
		// is the half-armed config the log export surfaced. Degraded, not down —
		// nothing is broken, money simply isn't moving.
		return {
			...base,
			status: 'degraded',
			detail: `half-armed — guards unset: ${violations.map((v) => v.flag).join(', ')}`,
			hint: 'Set X402_AUTONOMOUS_ENABLED=false to pause cleanly, or finish the ring guard env to go live. See docs/ops/production-log-triage.md.',
		};
	} catch (err) {
		return { ...base, status: 'unknown', detail: err?.message || 'unreadable' };
	}
}

async function checkWorld() {
	const base = { name: 'world', label: 'world.three.ws (Hyperfy)' };
	try {
		const parked = await cacheGet(WORLD_HEALTH_CACHE_KEY);
		if (!parked || typeof parked !== 'object') {
			return { ...base, status: 'unknown', detail: 'no world-health report yet' };
		}
		const age = parked.checkedAt ? Date.now() - parked.checkedAt : Infinity;
		if (age > WORLD_STALE_MS) {
			return { ...base, status: 'unknown', detail: 'world-health report is stale' };
		}
		if (parked.protected === false) {
			return {
				...base,
				status: 'degraded',
				detail: 'UNPROTECTED — ADMIN_CODE not set; every visitor has build rights',
				hint: 'Set ADMIN_CODE on the world service and re-run deploy/world/apply-hardening.sh.',
			};
		}
		if (parked.status === 'degraded') {
			return { ...base, status: 'degraded', detail: (parked.problems || []).join('; ') || 'degraded' };
		}
		return { ...base, status: 'ok', detail: 'protected; assets present' };
	} catch (err) {
		return { ...base, status: 'unknown', detail: err?.message || 'unreadable' };
	}
}

function checkX402Config() {
	const base = { name: 'x402_config', label: 'x402 payment config' };
	try {
		const hasSolanaPayTo = !!process.env.X402_PAY_TO_SOLANA || !!process.env.X402_PAY_TO;
		const hasSolanaFeePayer = !!process.env.X402_FEE_PAYER_SOLANA;
		if (hasSolanaPayTo && !hasSolanaFeePayer) {
			return {
				...base,
				status: 'degraded',
				detail: 'X402_PAY_TO_SOLANA set without X402_FEE_PAYER_SOLANA — Solana accepts are dropped',
				hint: 'Set X402_FEE_PAYER_SOLANA or Solana-only paid endpoints (dance-tip, club-cover) fail closed.',
			};
		}
		const configured = !!process.env.X402_PAY_TO_BASE || (hasSolanaPayTo && hasSolanaFeePayer);
		if (!configured) {
			return { ...base, status: 'unknown', detail: 'no pay-to addresses configured' };
		}
		return { ...base, status: 'ok', detail: 'pay-to + fee payer configured' };
	} catch (err) {
		return { ...base, status: 'unknown', detail: err?.message || 'unreadable' };
	}
}

/**
 * Gather every subsystem's health and roll it into one verdict.
 * @param {{ probeDb?: boolean }} [opts] set probeDb:false to skip the live DB
 *   ping (e.g. a caller that already knows the DB is out and wants a fast read).
 * @returns {Promise<{ status: 'ok'|'degraded'|'down', checkedAt: number,
 *   counts: Record<string, number>, degraded: string[], subsystems: Array<object> }>}
 */
export async function gatherSubsystemHealth({ probeDb = true } = {}) {
	const checks = [
		probeDb ? checkDatabase() : Promise.resolve({ name: 'database', label: 'Database (Neon)', status: 'unknown', detail: 'ping skipped' }),
		Promise.resolve(checkCache()),
		Promise.resolve(checkHelius()),
		Promise.resolve(checkRing()),
		checkWorld(),
		Promise.resolve(checkX402Config()),
	];
	const subsystems = await Promise.all(checks);

	const counts = subsystems.reduce((acc, s) => {
		acc[s.status] = (acc[s.status] || 0) + 1;
		return acc;
	}, /** @type {Record<string, number>} */ ({}));

	const status = worstOf(subsystems.map((s) => s.status));
	const degraded = subsystems.filter((s) => UNHEALTHY.includes(s.status)).map((s) => s.name);

	return { status, checkedAt: Date.now(), counts, degraded, subsystems };
}
