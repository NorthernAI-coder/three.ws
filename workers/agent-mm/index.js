// agent-mm — autonomous fair-launch market-maker worker (entrypoint).
//
// Long-lived process (NOT a Vercel cron). Every cfg.pollMs it sweeps all active
// market_maker_policies, re-quotes each coin off live on-chain state, and runs
// the decision engine — defending the floor, recycling profit into strength,
// managing the graduation transition — within each policy's published, non-
// manipulative limits. Every fill goes through executeAgentTrade (the SAME
// firewall + spend-guard + custody-audited path a manual trade uses); the worker
// adds no new way to move funds. Policies in simulate mode (or a simulate worker)
// run the full logic against real quotes without ever signing.
//
//   MM_MODE=simulate  — real quotes + full logic, no broadcast (default, safe)
//   MM_MODE=live      — real floor-defense / recycle fills from agent wallets
//   MM_GLOBAL_KILL=1  — halt all actions (policies intact; kill/withdraw still work)
//
// Run: node workers/agent-mm  (npm run worker:mm / worker:mm:live)

import { sql } from '../../api/_lib/db.js';
import { loadConfig } from './config.js';
import { getActivePolicies, loadAgent } from './store.js';
import { runPolicy } from './engine.js';
import { log } from './log.js';

const BOOT_AT = new Date().toISOString();
const WORKER = 'agent-mm';

async function heartbeat(cfg, extra) {
	try {
		await sql`
			INSERT INTO bot_heartbeat (worker, mode, last_beat_at, meta)
			VALUES (${WORKER}, ${cfg.mode}, now(), ${JSON.stringify({ network: cfg.network, globalKill: cfg.globalKill, bootAt: BOOT_AT, ...extra })}::jsonb)
			ON CONFLICT (worker) DO UPDATE
			SET mode = excluded.mode, last_beat_at = excluded.last_beat_at, meta = excluded.meta
		`;
	} catch (err) {
		log.warn('heartbeat write failed', { err: err?.message });
	}
}

// ── per-agent serialization ────────────────────────────────────────────────
// One agent wallet, one budget: serialize an agent's actions within a sweep so
// two policies on the same agent can't both pass the budget check on stale state.
// Across processes the custody idempotency_key on each fill is the real backstop.
const _locks = new Map();
async function withAgentLock(agentId, fn) {
	const prev = _locks.get(agentId) || Promise.resolve();
	let release;
	const next = new Promise((r) => (release = r));
	_locks.set(agentId, prev.then(() => next));
	await prev;
	try { return await fn(); }
	finally { release(); if (_locks.get(agentId) === next) _locks.delete(agentId); }
}

/** Run one full sweep over all active policies, grouped by agent. */
async function runSweep(cfg) {
	let policies;
	try { policies = await getActivePolicies(cfg.network); }
	catch (err) { log.error('active-policy query failed', { err: err?.message }); return { policies: 0, acted: 0 }; }
	if (!policies.length) return { policies: 0, acted: 0 };

	const byAgent = new Map();
	for (const p of policies) {
		if (!byAgent.has(p.agent_id)) byAgent.set(p.agent_id, []);
		byAgent.get(p.agent_id).push(p);
	}

	const agentIds = [...byAgent.keys()];
	const agentCache = new Map();
	const outcomes = [];
	let cursor = 0;
	const worker = async () => {
		while (cursor < agentIds.length) {
			const agentId = agentIds[cursor++];
			await withAgentLock(agentId, async () => {
				let agent = agentCache.get(agentId);
				if (!agent) { agent = await loadAgent(agentId); agentCache.set(agentId, agent); }
				if (!agent || !agent.meta?.encrypted_solana_secret) return; // no wallet — leave policies untouched
				for (const policy of byAgent.get(agentId)) {
					try {
						const outcome = await runPolicy({ cfg, policy, agent });
						outcomes.push(outcome);
					} catch (err) {
						log.error('policy eval failed', { policy: policy.id, mint: policy.mint, err: err?.message });
					}
				}
			});
		}
	};
	const pool = Math.max(1, Math.min(cfg.concurrency, agentIds.length));
	await Promise.all(Array.from({ length: pool }, worker));

	const acted = outcomes.filter((o) => ['seed', 'defend_buy', 'recycle_sell', 'rebalance_trim', 'graduation_lp', 'graduation_distribute', 'graduation_hold'].includes(o)).length;
	return { policies: policies.length, acted };
}

async function main() {
	const cfg = loadConfig();
	log.info('boot', { network: cfg.network, mode: cfg.mode, pollMs: cfg.pollMs, globalKill: cfg.globalKill });

	let draining = false;
	let sweeping = false;
	let sweeps = 0;

	const tick = async () => {
		if (draining || sweeping || cfg.globalKill) return;
		sweeping = true;
		const started = Date.now();
		try {
			const { policies, acted } = await runSweep(cfg);
			sweeps++;
			if (policies) log.info('sweep', { policies, acted, ms: Date.now() - started });
		} catch (err) {
			log.error('sweep failed', { err: err?.message });
		} finally {
			sweeping = false;
			if (cfg.heartbeatMs) heartbeat(cfg, { sweeps, lastSweepMs: Date.now() - started });
		}
	};

	if (cfg.heartbeatMs) await heartbeat(cfg, { sweeps: 0 });
	const timer = setInterval(tick, cfg.pollMs);
	tick();

	const shutdown = (signal) => {
		if (draining) return;
		draining = true;
		log.info('shutdown', { signal });
		clearInterval(timer);
		// Neon HTTP is stateless — nothing to close. Give an in-flight sweep a moment.
		setTimeout(() => process.exit(0), 1_500);
	};
	process.on('SIGINT', () => shutdown('SIGINT'));
	process.on('SIGTERM', () => shutdown('SIGTERM'));
	process.on('unhandledRejection', (err) => log.error('unhandledRejection', { err: err?.message }));
}

main().catch((err) => {
	log.error('fatal', { err: err?.message, stack: err?.stack });
	process.exit(1);
});
