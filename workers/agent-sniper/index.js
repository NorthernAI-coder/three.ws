// agent-sniper — autonomous pump.fun sniper worker (entrypoint).
//
// Holds the PumpPortal new-mint feed open, scores each launch against every
// armed agent strategy, and snipes from the agent's own wallet. A second loop
// manages open positions to their exit. This is a long-lived process — NOT a
// Vercel cron (hourly is far too slow to snipe). Run: node workers/agent-sniper.
//
//   SNIPER_MODE=simulate  — real quotes, no broadcast (default, safe)
//   SNIPER_MODE=live      — real trades from agent wallets
//   SNIPER_GLOBAL_KILL=1  — halt new buys; positions still managed/exited

import { connectPumpFunFeed } from '../../api/_lib/pumpfun-ws-feed.js';
import { loadConfig } from './config.js';
import { log } from './log.js';
import { refreshStrategies, cachedStrategies, logStrategyLoad } from './strategy-store.js';
import { scoreMint, scoreIntel } from './scorer.js';
import { executeBuy } from './executor.js';
import { oracleGate } from './oracle-gate.js';
import { runPositionSweep } from './positions.js';
import { startFirstClaimWatch } from './first-claim-watch.js';
import { startIntelWatcher } from './intel/watcher.js';
import { getLearnedWeights } from './intel/store.js';
import { getSmartMoneyForMint } from '../../api/_lib/smart-money.js';
import { startHeartbeat } from './heartbeat.js';
import { makeErrorTracker } from './error-tracker.js';
import {
	alertFeedSilent,
	alertErrorSpike,
	alertBoot,
	alertShutdown,
} from './alerts.js';

const BOOT_AT = new Date().toISOString();

// ── global buy throttle (sliding 60s window) ─────────────────────────────────
function makeThrottle(maxPerMin) {
	const hits = [];
	return {
		tryConsume() {
			if (maxPerMin <= 0) return true;
			const now = Date.now();
			while (hits.length && now - hits[0] > 60_000) hits.shift();
			if (hits.length >= maxPerMin) return false;
			hits.push(now);
			return true;
		},
	};
}

// ── bounded buy queue (cap concurrent snipe attempts → bounded RPC) ──────────
function makeQueue(concurrency, maxDepth, onError) {
	let active = 0;
	const q = [];
	const pump = () => {
		while (active < concurrency && q.length) {
			const job = q.shift();
			active++;
			Promise.resolve()
				.then(job)
				.catch((err) => { log.error('buy job crashed', { err: err?.message }); onError?.(err?.message); })
				.finally(() => { active--; pump(); });
		}
	};
	return {
		push(job) {
			if (q.length >= maxDepth) { log.warn('buy queue full — dropping snipe', { depth: q.length }); return; }
			q.push(job);
			pump();
		},
		get inFlight() { return active + q.length; },
	};
}

async function main() {
	const cfg = loadConfig();
	log.info('boot', { network: cfg.network, mode: cfg.mode, globalKill: cfg.globalKill, pollMs: cfg.pollMs });
	if (cfg.announceLifecycle) alertBoot({ network: cfg.network, mode: cfg.mode, globalKill: cfg.globalKill });

	const throttle = makeThrottle(cfg.maxGlobalBuysPerMin);
	const errors = makeErrorTracker({ threshold: cfg.errorAlertThreshold, windowMs: cfg.errorAlertWindowMs });
	// Funnel an error into the spike tracker; alert once when a run-up crosses the
	// threshold. Pure observability — never alters the trade path.
	const noteError = (where, message) => {
		const spike = errors.record(`${where}: ${message || 'error'}`);
		if (spike) alertErrorSpike({ ...spike, network: cfg.network, mode: cfg.mode });
	};
	const queue = makeQueue(3, 50, (message) => noteError('buy', message));
	let draining = false;
	let lastEventAt = Date.now();
	let feedConnected = false;
	let reconnectCount = 0;

	await refreshStrategies(cfg.network, 0).then(() => logStrategyLoad(cfg.network)).catch((err) =>
		log.error('initial strategy load failed', { err: err?.message }),
	);

	const onEvent = ({ kind, data }) => {
		lastEventAt = Date.now();
		feedConnected = true; // an event is proof the subscription is live
		if (kind !== 'mint' || draining || cfg.globalKill) return;
		const strategies = cachedStrategies();
		for (const strat of strategies) {
			// The new-mint feed only drives new_mint strategies; first_claim
			// strategies are driven by the on-chain claim poll loop below.
			if ((strat.trigger || 'new_mint') !== 'new_mint') continue;
			const { pass, reasons } = scoreMint(data, strat);
			if (!pass) continue;
			log.info('candidate', { agent: strat.agent_id, mint: data.mint, symbol: data.symbol, reasons });
			queue.push(async () => {
				const og = await oracleGate(data.mint, cfg.network, strat);
				if (!og.pass) { log.info('oracle gate skip', { agent: strat.agent_id, mint: data.mint, reason: og.reason }); return; }
				if (og.skipped) log.info('oracle unscored — proceeding', { agent: strat.agent_id, mint: data.mint });
				await executeBuy({ cfg, strat, mint: data, throttle });
			});
		}
	};

	const abort = new AbortController();
	let stopFeed = connectPumpFunFeed({ kind: 'mint', signal: abort.signal, onEvent });
	feedConnected = true;
	log.info('feed connected', {});

	// Coin Intelligence Engine: observe every new coin's first seconds, classify
	// it, persist signals, and drive intel_confirmed strategies on a finished
	// verdict. Separate WS (dynamic per-mint trade subscriptions) from the snipe
	// feed above. Read-only on the chain — it never trades, only watches.
	let stopIntel = () => {};
	if (cfg.intel) {
		const onIntel = (rec) => {
			if (draining || cfg.globalKill) return;
			const strategies = cachedStrategies();
			const wantsIntel = strategies.some(
				(strat) => (strat.trigger || 'new_mint') === 'intel_confirmed' && strat.network === cfg.network,
			);
			if (!wantsIntel) return;

			// Attach the live smart-money graph read once per finished intel record so
			// scoreIntel's gate + score see who reputable is in. Degrades silently to a
			// zero-data result (computed:false) — never blocks the snipe path.
			const smartReady = getSmartMoneyForMint(rec.mint, cfg.network)
				.then((sm) => { rec.smart_money = sm; })
				.catch(() => { rec.smart_money = null; });

			for (const strat of strategies) {
				if ((strat.trigger || 'new_mint') !== 'intel_confirmed') continue;
				if (strat.network !== cfg.network) continue;
				Promise.all([getLearnedWeights(cfg.network), smartReady])
					.then(([weights]) => {
						const { pass, score, reasons } = scoreIntel(rec, strat, weights);
						if (!pass) return;
						log.info('intel candidate', { agent: strat.agent_id, mint: rec.mint, symbol: rec.symbol, score, reasons });
						queue.push(async () => {
							const og = await oracleGate(rec.mint, cfg.network, strat);
							if (!og.pass) { log.info('oracle gate skip', { agent: strat.agent_id, mint: rec.mint, reason: og.reason }); return; }
							if (og.skipped) log.info('oracle unscored — proceeding', { agent: strat.agent_id, mint: rec.mint });
							await executeBuy({
								cfg, strat, throttle,
								mint: { mint: rec.mint, symbol: rec.symbol, name: rec.name, entry_trigger: 'intel_confirmed', trigger_ref: rec.mint },
							});
						});
					})
					.catch((err) => log.error('intel score failed', { mint: rec.mint, err: err?.message }));
			}
		};
		stopIntel = startIntelWatcher({
			network: cfg.network,
			windowMs: cfg.intelWindowMs,
			maxConcurrent: cfg.intelMaxConcurrent,
			useLlm: cfg.intelLlm,
			signal: abort.signal,
			onIntel,
		});
		log.info('intel watcher started', { windowMs: cfg.intelWindowMs, llm: cfg.intelLlm });
	}

	// First-claim trigger: polls the on-chain fee-claim stream and snipes a
	// creator's coin on their first-ever reward claim. Shares the buy queue +
	// global throttle with the new-mint path, and halts new buys on drain/kill.
	const stopClaimWatch = startFirstClaimWatch({
		cfg, queue, throttle, isHalted: () => draining || cfg.globalKill,
	});

	// Strategy cache refresh.
	const strategyTimer = setInterval(() => {
		refreshStrategies(cfg.network, cfg.strategyRefreshMs)
			.then(() => logStrategyLoad(cfg.network))
			.catch((err) => log.error('strategy refresh failed', { err: err?.message }));
	}, cfg.strategyRefreshMs);

	// Position lifecycle sweep — overlap-guarded so a slow sweep can't stack.
	let sweeping = false;
	const positionTimer = setInterval(async () => {
		if (sweeping || draining) return;
		sweeping = true;
		try {
			await runPositionSweep(cfg);
		} catch (err) {
			log.error('position sweep failed', { err: err?.message });
			noteError('sweep', err?.message);
		} finally {
			sweeping = false;
			errors.tick(); // re-arm the spike alert once the window drains
		}
	}, cfg.pollMs);

	// Feed watchdog: connectPumpFunFeed stops after 5 drops; if the feed goes
	// quiet past the threshold, tear down and re-subscribe so the brain never
	// silently goes deaf.
	const watchdogTimer = setInterval(() => {
		if (draining) return;
		const silentMs = Date.now() - lastEventAt;
		if (silentMs > cfg.feedWatchdogMs) {
			feedConnected = false;
			reconnectCount++;
			log.warn('feed silent — re-subscribing', { silentMs, reconnects: reconnectCount });
			alertFeedSilent({ silentMs, network: cfg.network, mode: cfg.mode });
			try { stopFeed?.(); } catch {}
			lastEventAt = Date.now();
			const a2 = new AbortController();
			abort.signal.addEventListener('abort', () => a2.abort());
			stopFeed = connectPumpFunFeed({ kind: 'mint', signal: a2.signal, onEvent });
		}
	}, Math.min(cfg.feedWatchdogMs, 60_000));

	// Liveness heartbeat — upserts bot_heartbeat so /api/sniper/status and the
	// uptime cron can see the worker is alive AND that its feed is actually live
	// (a process that's up with a dead feed is the worst, silent failure mode).
	const stopHeartbeat = startHeartbeat({
		mode: cfg.mode,
		intervalMs: cfg.heartbeatMs,
		getMeta: () => ({
			network: cfg.network,
			feedConnected,
			lastEventAgeMs: Date.now() - lastEventAt,
			feedWatchdogMs: cfg.feedWatchdogMs,
			strategies: cachedStrategies().length,
			globalKill: cfg.globalKill,
			reconnects: reconnectCount,
			errors: errors.total,
			lastError: errors.lastError,
			intel: cfg.intel,
			inFlightBuys: queue.inFlight,
			bootAt: BOOT_AT,
		}),
	});

	const shutdown = async (signal) => {
		if (draining) return;
		draining = true;
		log.info('shutdown', { signal, inFlight: queue.inFlight });
		if (cfg.announceLifecycle) alertShutdown({ signal, inFlight: queue.inFlight });
		clearInterval(strategyTimer);
		clearInterval(positionTimer);
		clearInterval(watchdogTimer);
		try { stopHeartbeat?.(); } catch {}
		try { stopClaimWatch?.(); } catch {}
		try { stopFeed?.(); } catch {}
		try { stopIntel?.(); } catch {}
		abort.abort();
		// Give in-flight buys a moment to settle (Neon HTTP is stateless — nothing
		// else to close).
		const deadline = Date.now() + 10_000;
		while (queue.inFlight > 0 && Date.now() < deadline) {
			await new Promise((r) => setTimeout(r, 200));
		}
		log.info('bye', { inFlight: queue.inFlight });
		process.exit(0);
	};
	process.on('SIGINT', () => shutdown('SIGINT'));
	process.on('SIGTERM', () => shutdown('SIGTERM'));
	process.on('unhandledRejection', (err) => {
		log.error('unhandledRejection', { err: err?.message });
		noteError('unhandledRejection', err?.message);
	});
}

main().catch((err) => {
	log.error('fatal', { err: err?.message, stack: err?.stack });
	process.exit(1);
});
