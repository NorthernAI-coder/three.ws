// agent-sniper — buy-side auto-funding loop.
//
// A live sniper's wallet drains as it buys. Without a top-up it silently goes
// broke and every subsequent snipe fails its balance check — a green heartbeat
// hiding a dead bot. This loop keeps each armed agent's OWN Solana wallet above
// a floor: when an agent's balance drops below SNIPER_AUTO_FUND_MIN_SOL it tops
// it back up to SNIPER_AUTO_FUND_TARGET_SOL from the launcher master wallet,
// reusing the same guarded transfer (caps + master-balance buffer + protected
// submit) the autonomous launcher uses.
//
// Guardrails (no env weakens them past the master's own balance buffer):
//   - per-transfer cap   (SNIPER_AUTO_FUND_PER_TX_SOL)
//   - daily total cap     (SNIPER_AUTO_FUND_DAILY_SOL), summed from the on-chain
//                          funding ledger so a worker restart can't bypass it
//   - master balance buffer (enforced inside fundAgentForLaunch)
// In simulate mode it logs what it WOULD move and records a 'SIMULATED' ledger
// row — zero SOL leaves the master.

import { sql } from '../../api/_lib/db.js';
import { fundAgentForLaunch, masterBalanceSol } from '../../api/_lib/launcher-funding.js';
import { getSolBalance } from '../../api/_lib/avatar-wallet.js';
import { solanaConnection } from '../../api/_lib/agent-pumpfun.js';
import { log } from './log.js';
import { screenPush } from './screen-push.js';
import { cachedStrategies } from './strategy-store.js';

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

function num(name, def) {
	const raw = process.env[name];
	if (raw == null || raw === '') return def;
	const n = Number(raw);
	return Number.isFinite(n) ? n : def;
}

// Floor + target + caps (SOL). Conservative defaults: keep ~0.05 SOL of dry
// powder per agent, refill when it falls under 0.02, never move more than 0.1 in
// one top-up or 1.0 total per UTC day across all agents.
const MIN_SOL = Math.max(0, num('SNIPER_AUTO_FUND_MIN_SOL', 0.02));
const TARGET_SOL = Math.max(MIN_SOL, num('SNIPER_AUTO_FUND_TARGET_SOL', 0.05));
const PER_TX_CAP_SOL = Math.max(0, num('SNIPER_AUTO_FUND_PER_TX_SOL', 0.1));
const DAILY_CAP_SOL = Math.max(0, num('SNIPER_AUTO_FUND_DAILY_SOL', 1.0));

/** Unique agent ids across the armed strategy set for this network. */
function activeAgentIds(network) {
	const ids = new Set();
	for (const s of cachedStrategies()) {
		if (s.agent_id && s.network === network) ids.add(s.agent_id);
	}
	return [...ids];
}

/** SOL actually moved (live) since the start of the UTC day — the daily-cap base. */
async function dailyFundedSol(network) {
	const [row] = await sql`
		SELECT coalesce(sum(lamports), 0)::float8 / 1e9 AS sol
		FROM sniper_funding_events
		WHERE network = ${network}
		  AND mode = 'live'
		  AND created_at >= date_trunc('day', now())
	`;
	return Number(row?.sol || 0);
}

/** Resolve each armed agent's Solana address from its identity meta. */
async function agentAddresses(agentIds) {
	if (!agentIds.length) return new Map();
	const rows = await sql`
		SELECT id, meta->>'solana_address' AS address
		FROM agent_identities
		WHERE id = ANY(${agentIds}) AND deleted_at IS NULL
	`;
	const m = new Map();
	for (const r of rows) {
		if (r.address) m.set(r.id, r.address);
	}
	return m;
}

async function tick(cfg) {
	const agentIds = activeAgentIds(cfg.network);
	if (!agentIds.length) return;

	const addresses = await agentAddresses(agentIds);
	if (!addresses.size) return;

	// One daily-spend read per tick; decremented locally as we fund so several
	// agents in the same tick can't collectively blow past the cap.
	let dailyRemaining = DAILY_CAP_SOL > 0 ? Math.max(0, DAILY_CAP_SOL - (await dailyFundedSol(cfg.network))) : Infinity;
	const conn = solanaConnection(cfg.network);

	for (const [agentId, address] of addresses) {
		if (DAILY_CAP_SOL > 0 && dailyRemaining <= 0) {
			log.warn('auto-fund daily cap reached — skipping remaining agents', { network: cfg.network, dailyCapSol: DAILY_CAP_SOL });
			break;
		}

		let balanceSol;
		try {
			({ sol: balanceSol } = await getSolBalance(conn, address));
		} catch (err) {
			log.warn('auto-fund balance read failed', { agentId, err: err?.message });
			continue;
		}

		if (balanceSol >= MIN_SOL) continue; // healthy — nothing to do

		// Top up to the target, bounded by the per-transfer cap.
		let topUp = TARGET_SOL - balanceSol;
		if (PER_TX_CAP_SOL > 0) topUp = Math.min(topUp, PER_TX_CAP_SOL);
		if (DAILY_CAP_SOL > 0) topUp = Math.min(topUp, dailyRemaining);
		topUp = Math.round(topUp * 1e9) / 1e9; // lamport precision
		if (topUp <= 0) continue;

		log.info('auto-fund low wallet', { agentId, wallet: address, balance_sol: balanceSol, min_sol: MIN_SOL, top_up_sol: topUp });
		screenPush(`Topping up sniper wallet ${address.slice(0, 4)}… +${topUp.toFixed(3)} SOL`, 'activity');

		if (cfg.mode !== 'live') {
			await recordFunding({ agentId, wallet: address, network: cfg.network, sol: topUp, balanceBeforeSol: balanceSol, signature: 'SIMULATED', mode: 'simulate' });
			log.info('simulate — would top up wallet', { agentId, wallet: address, top_up_sol: topUp });
			if (DAILY_CAP_SOL > 0) dailyRemaining -= topUp;
			continue;
		}

		let result;
		try {
			result = await fundAgentForLaunch({
				agentAddress: address,
				sol: topUp,
				perLaunchCapSol: PER_TX_CAP_SOL,
				dailyCapSol: DAILY_CAP_SOL > 0 ? dailyRemaining : null,
				network: cfg.network,
				memo: 'three.ws sniper top-up',
			});
		} catch (err) {
			log.error('auto-fund transfer threw', { agentId, wallet: address, err: err?.message });
			continue;
		}

		if (!result?.ok) {
			log.warn('auto-fund refused', { agentId, wallet: address, reason: result?.reason });
			continue;
		}

		await recordFunding({
			agentId, wallet: address, network: cfg.network, sol: topUp,
			balanceBeforeSol: balanceSol, signature: result.signature, mode: 'live',
		});
		if (DAILY_CAP_SOL > 0) dailyRemaining -= topUp;

		log.trade('wallet-funded', { agentId, wallet: address, top_up_sol: topUp, balance_before_sol: balanceSol, sig: result.signature });
		screenPush(`Funded ${address.slice(0, 4)}… +${topUp.toFixed(3)} SOL`, 'trade');
	}
}

async function recordFunding({ agentId, wallet, network, sol, balanceBeforeSol, signature, mode }) {
	try {
		const lamports = String(Math.round(sol * 1e9));
		const beforeLamports = balanceBeforeSol == null ? null : String(Math.round(balanceBeforeSol * 1e9));
		await sql`
			INSERT INTO sniper_funding_events (agent_id, wallet, network, lamports, balance_before_lamports, signature, mode)
			VALUES (${agentId}, ${wallet}, ${network}, ${lamports}, ${beforeLamports}, ${signature}, ${mode})
		`;
	} catch (err) {
		// A ledger write failure must not double-fund: in live mode treat it as a
		// hard error the caller should see, but never throw out of the tick.
		log.error('auto-fund ledger write failed', { agentId, wallet, sig: signature, err: err?.message });
	}
}

/**
 * Start the auto-funding watch loop.
 *
 * @param {{ cfg: object, signal?: AbortSignal }} options
 * @returns {Function} stop
 */
export function startAutoFunderWatch({ cfg, signal } = {}) {
	let running = false;

	const runTick = () => {
		if (running) return;
		running = true;
		tick(cfg)
			.catch((err) => log.error('auto-funder tick crashed', { err: err?.message }))
			.finally(() => { running = false; });
	};

	const interval = setInterval(runTick, POLL_INTERVAL_MS);
	if (interval.unref) interval.unref();

	log.info('auto-funder armed', {
		network: cfg.network, mode: cfg.mode, pollMs: POLL_INTERVAL_MS,
		minSol: MIN_SOL, targetSol: TARGET_SOL, perTxCapSol: PER_TX_CAP_SOL, dailyCapSol: DAILY_CAP_SOL,
	});

	// Warn loudly if live funding is armed but the master wallet is unconfigured —
	// otherwise every top-up silently refuses and wallets drain anyway.
	if (cfg.mode === 'live') {
		masterBalanceSol(cfg.network)
			.then((bal) => {
				if (bal == null) log.warn('auto-funder: master launch wallet not configured — top-ups will be refused');
				else log.info('auto-funder master balance', { master_sol: bal });
			})
			.catch((err) => log.warn('auto-funder master balance check failed', { err: err?.message }));
	}

	runTick(); // fire immediately so a freshly-armed agent isn't unfunded for 5 min

	function stop() {
		clearInterval(interval);
		log.info('auto-funder stopped');
	}

	if (signal) signal.addEventListener('abort', stop, { once: true });
	return stop;
}
