// Coin Intelligence — the observation watcher.
//
// Holds its own PumpPortal connection so it can DYNAMICALLY subscribe to each
// new mint's trade stream for an observation window, then unsubscribe. The
// shared feed (api/_lib/pumpfun-ws-feed.js) subscribes once on open and can't
// add keys later, so the watcher manages a lean connection of its own.
//
// Lifecycle per coin:
//   create event → start observation (record dev buy + metadata) → subscribe
//   to its trades → accumulate every buy/sell for windowMs → compute signals →
//   classify → persist → unsubscribe. The result is a complete intel record the
//   sniper and the /radar feed read instantly.

import WebSocket from 'ws';
import { computeSignals } from './signals.js';
import { classifyCoin } from './classify.js';
import { persistIntel } from './store.js';
import { resolveWalletFunders, buildClusters } from '../../../api/_lib/pump-intel/funder-graph.js';
import { crossReferenceSmartMoney } from '../../../api/_lib/pump-intel/smart-money-xref.js';
import { log } from '../log.js';

const PUMPPORTAL_WS = 'wss://pumpportal.fun/api/data';
const RECONNECT_DELAY_MS = 2_000;
const LAMPORTS_PER_SOL = 1_000_000_000;
const META_TIMEOUT_MS = 2_500;

const _metaCache = new Map();
async function fetchMeta(uri) {
	if (!uri) return null;
	if (_metaCache.has(uri)) return _metaCache.get(uri);
	try {
		const ctrl = new AbortController();
		const tid = setTimeout(() => ctrl.abort(), META_TIMEOUT_MS);
		const r = await fetch(uri, { signal: ctrl.signal });
		clearTimeout(tid);
		if (!r.ok) return null;
		const d = await r.json();
		const meta = {
			description: d.description || null,
			twitter: d.twitter || null,
			telegram: d.telegram || null,
			website: d.website || null,
			image_uri: d.image || d.image_uri || null,
		};
		if (_metaCache.size > 500) _metaCache.clear();
		_metaCache.set(uri, meta);
		return meta;
	} catch { return null; }
}

const solToLamports = (sol) => Math.round((Number(sol) || 0) * LAMPORTS_PER_SOL);

/**
 * Start the intel watcher.
 * @param {object} opts
 * @param {string} [opts.network='mainnet']
 * @param {number} [opts.windowMs=90000]   observation window per coin
 * @param {number} [opts.maxConcurrent=400] cap on simultaneously-watched coins
 * @param {AbortSignal} [opts.signal]
 * @param {(rec: object) => void} [opts.onIntel] fired with each finished record
 * @returns {() => void} stop
 */
export function startIntelWatcher({
	network = 'mainnet',
	windowMs = 90_000,
	maxConcurrent = 400,
	useLlm = false,
	signal,
	onIntel,
} = {}) {
	let active = true;
	let ws = null;
	let reconnectTimer = null;
	let droppedSinceLog = 0;
	const observations = new Map(); // mint -> { meta, trades, firstSeenAtMs, createdAtSec, devBuyLamports, timer }

	function stop() {
		active = false;
		clearTimeout(reconnectTimer);
		for (const obs of observations.values()) clearTimeout(obs.timer);
		if (ws) try { ws.close(); } catch {}
	}
	signal?.addEventListener('abort', stop);

	function send(obj) {
		if (ws && ws.readyState === WebSocket.OPEN) {
			try { ws.send(JSON.stringify(obj)); return true; } catch { return false; }
		}
		return false;
	}

	function startObservation(msg) {
		const mint = msg.mint;
		if (!mint || observations.has(mint)) return;
		if (observations.size >= maxConcurrent) {
			droppedSinceLog++;
			return; // logged periodically below — never silently
		}
		const now = Date.now();
		const obs = {
			mint,
			createdAtSec: Math.floor(now / 1000),
			firstSeenAtMs: now,
			creator: msg.traderPublicKey || null,
			devBuyLamports: msg.solAmount != null ? solToLamports(msg.solAmount) : null,
			mcSolFirstSeen: typeof msg.marketCapSol === 'number' ? msg.marketCapSol : null,
			meta: {
				name: msg.name || null,
				symbol: msg.symbol || null,
				bonding_curve: msg.bondingCurveKey || null,
				image_uri: msg.uri || null,
				uri: msg.uri || null,
				description: null, twitter: null, telegram: null, website: null,
			},
			// The creator's initial buy is part of the launch tx — seed it as the
			// first trade so dev sizing/concentration include it.
			trades: msg.solAmount
				? [{ trader: msg.traderPublicKey || null, isBuy: true, lamports: solToLamports(msg.solAmount), baseAmount: Number(msg.tokenAmount) || 0, ts: now, signature: msg.signature }]
				: [],
			timer: null,
		};
		observations.set(mint, obs);
		send({ method: 'subscribeTokenTrade', keys: [mint] });

		// Enrich metadata off the hot path.
		fetchMeta(obs.meta.uri).then((m) => {
			if (m && observations.has(mint)) Object.assign(obs.meta, m);
		}).catch(() => {});

		obs.timer = setTimeout(() => finalize(mint), windowMs);
	}

	function recordTrade(msg) {
		const obs = observations.get(msg.mint);
		if (!obs) return;
		obs.trades.push({
			trader: msg.traderPublicKey || null,
			isBuy: msg.txType === 'buy',
			lamports: msg.solAmount != null ? solToLamports(msg.solAmount) : 0,
			baseAmount: Number(msg.tokenAmount) || 0,
			ts: Date.now(),
			signature: msg.signature,
		});
	}

	async function finalize(mint) {
		const obs = observations.get(mint);
		if (!obs) return;
		observations.delete(mint);
		clearTimeout(obs.timer);
		send({ method: 'unsubscribeTokenTrade', keys: [mint] });

		try {
			const endedAtMs = Date.now();

			// ── Phase 1: deterministic signal computation (sync, no I/O) ─────────
			const { signals, quality_score, risk_flags, walletAgg } = computeSignals({
				mint,
				creator: obs.creator,
				createdAtMs: obs.firstSeenAtMs,
				firstSeenAtMs: obs.firstSeenAtMs,
				endedAtMs,
				devBuyLamports: obs.devBuyLamports,
				trades: obs.trades,
			});
			if (obs.mcSolFirstSeen != null) signals.mc_sol_first_seen = obs.mcSolFirstSeen;

			// ── Phase 2: parallel enrichment (network I/O, best-effort) ──────────
			// All three run concurrently; any failure degrades gracefully to null.
			const buyerWallets = [...walletAgg.keys()].filter((w) => {
				const a = walletAgg.get(w);
				return a && a.buyCount > 0;
			});

			const [cls, funderMap, smartMoneyResult] = await Promise.allSettled([
				// 2a. LLM/heuristic classification
				classifyCoin({
					name: obs.meta.name,
					symbol: obs.meta.symbol,
					description: obs.meta.description,
					twitter: obs.meta.twitter,
					telegram: obs.meta.telegram,
					website: obs.meta.website,
				}, { useLlm }),

				// 2b. Funding-graph: resolve SOL funder for each buyer wallet.
				// We skip wallets with no buy activity and cap at 60 to stay within
				// Helius rate limits. The most active/suspicious wallets are scored
				// first because walletAgg preserves insertion order (arrival time).
				resolveWalletFunders(buyerWallets.slice(0, 60)),

				// 2c. Smart-money cross-reference: which observed buyers have a proven
				// track record in wallet_reputation? Runs a single batched DB query.
				crossReferenceSmartMoney(buyerWallets),
			]);

			// Unwrap settled results — never let a single failure abort the record.
			const classification = cls.status === 'fulfilled' ? cls.value
				: { category: 'unknown', tags: [], narrative: null, is_news_meme: false, confidence: 0.15, source: 'heuristic' };

			const resolvedFunders = funderMap.status === 'fulfilled' ? funderMap.value : new Map();
			const { clusters, connectivity } = buildClusters(resolvedFunders);

			const smartMoney = smartMoneyResult.status === 'fulfilled' ? smartMoneyResult.value
				: { count: 0, notable: [], top_label: null };

			// Push funder into walletAgg so persistIntel writes it to pump_coin_wallets
			for (const [wallet, funder] of resolvedFunders) {
				const entry = walletAgg.get(wallet);
				if (entry) entry.funder = funder || null;
			}

			// ── Phase 3: upgrade signals with enrichment results ─────────────────
			if (connectivity != null) signals.bubblemap_connectivity = connectivity;
			signals.smart_money_count = smartMoney.count;
			signals.smart_money_score = smartMoney.score ?? null;
			// Re-derive organic score with connectivity and fresh_wallet_ratio if available.
			// (bubblemap_connectivity penalises coordination; smart money boosts confidence.)
			if (connectivity != null) {
				const existing = signals.organic_score ?? 0;
				signals.organic_score = Math.max(0, Math.min(1,
					existing * (1 - 0.3 * connectivity) + (smartMoney.count > 0 ? 0.05 * Math.min(smartMoney.count, 3) : 0)
				));
				signals.organic_score = Math.round(signals.organic_score * 10000) / 10000;
			}

			// Flag coordinated cluster in risk_flags if connectivity is high.
			if (connectivity != null && connectivity >= 0.4 && !risk_flags.includes('coordinated_cluster')) {
				risk_flags.push('coordinated_cluster');
			}
			// Smart money entering is an additive signal, not a risk flag — store in signals only.

			const record = {
				mint,
				network,
				symbol: obs.meta.symbol,
				name: obs.meta.name,
				creator: obs.creator,
				bonding_curve: obs.meta.bonding_curve,
				image_uri: obs.meta.image_uri,
				description: obs.meta.description,
				twitter: obs.meta.twitter,
				telegram: obs.meta.telegram,
				website: obs.meta.website,
				created_at_sec: obs.createdAtSec,
				first_seen_at_ms: obs.firstSeenAtMs,
				dev_buy_lamports: obs.devBuyLamports,
				dev_sell_lamports: solToLamports(signals.dev_sell_sol || 0),
				buy_volume_lamports: solToLamports(signals.buy_volume_sol || 0),
				sell_volume_lamports: solToLamports(signals.sell_volume_sol || 0),
				largest_buy_lamports: solToLamports(signals.largest_buy_sol || 0),
				signals,
				quality_score: recomputeQuality(quality_score, signals, smartMoney.count),
				risk_flags,
				category: classification.category,
				tags: classification.tags,
				narrative: classification.narrative,
				is_news_meme: classification.is_news_meme,
				classify_confidence: classification.confidence,
				classify_source: classification.source,
				// Smart-money enrichment fields (stored in record, persisted via new migration)
				smart_money_count: smartMoney.count,
				smart_money_score: smartMoney.score ?? null,
				smart_money_notable: smartMoney.notable,
				// Cluster summary
				cluster_count: clusters.size,
				bubblemap_connectivity: connectivity,
			};

			await persistIntel(record, walletAgg);
			if (active && onIntel) { try { onIntel(record); } catch {} }

			log.info?.('intel finalized', {
				mint,
				symbol: obs.meta.symbol,
				quality: record.quality_score,
				category: record.category,
				smart_money: smartMoney.count,
				connectivity: connectivity != null ? connectivity.toFixed(3) : null,
				clusters: clusters.size,
				buyers: buyerWallets.length,
			});
		} catch (err) {
			log.error?.('intel finalize failed', { mint, err: err?.message });
		}
	}

	// Recompute quality score incorporating smart-money signal.
	// Smart money entering early is the strongest positive signal we have.
	function recomputeQuality(baseScore, signals, smartMoneyCount) {
		let q = baseScore;
		if (smartMoneyCount >= 1) q += 8;
		if (smartMoneyCount >= 2) q += 6;
		if (smartMoneyCount >= 3) q += 4;
		// connectivity penalty already applied to organic_score; don't double-count.
		return Math.max(0, Math.min(100, Math.round(q)));
	}

	function connect() {
		if (!active) return;
		ws = new WebSocket(PUMPPORTAL_WS);

		ws.on('open', () => {
			send({ method: 'subscribeNewToken' });
			// Re-subscribe trades for anything still mid-observation after a reconnect.
			const keys = [...observations.keys()];
			if (keys.length) send({ method: 'subscribeTokenTrade', keys });
			log.info?.('intel watcher connected', { network, watching: keys.length });
		});

		ws.on('message', (raw) => {
			if (!active) return;
			let msg;
			try { msg = JSON.parse(raw.toString()); } catch { return; }
			if (msg.message) return; // ack
			if (msg.txType === 'create') startObservation(msg);
			else if (msg.txType === 'buy' || msg.txType === 'sell') recordTrade(msg);
		});

		ws.on('error', (err) => log.warn?.('intel watcher ws error', { err: err?.message }));
		ws.on('close', () => {
			if (!active) return;
			reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
		});
	}

	// Periodic visibility into dropped observations (no silent caps — Rule).
	const dropTimer = setInterval(() => {
		if (droppedSinceLog > 0) {
			log.warn?.('intel watcher at capacity — dropped observations', {
				dropped: droppedSinceLog, watching: observations.size, cap: maxConcurrent,
			});
			droppedSinceLog = 0;
		}
	}, 60_000);
	signal?.addEventListener('abort', () => clearInterval(dropTimer));

	connect();
	return () => { clearInterval(dropTimer); stop(); };
}
