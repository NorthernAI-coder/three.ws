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

			const cls = await classifyCoin({
				name: obs.meta.name,
				symbol: obs.meta.symbol,
				description: obs.meta.description,
				twitter: obs.meta.twitter,
				telegram: obs.meta.telegram,
				website: obs.meta.website,
			});

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
				quality_score,
				risk_flags,
				category: cls.category,
				tags: cls.tags,
				narrative: cls.narrative,
				classify_confidence: cls.confidence,
				classify_source: cls.source,
			};

			await persistIntel(record, walletAgg);
			if (active && onIntel) { try { onIntel(record); } catch {} }
		} catch (err) {
			log.error?.('intel finalize failed', { mint, err: err?.message });
		}
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
