// Canonical Solana RPC endpoint resolution + a drop-in Connection with transparent
// multi-endpoint failover.
//
// `solanaConnection({ url, commitment })` returns a normal @solana/web3.js
// Connection whose underlying fetch rotates across a priority-ordered endpoint
// list. Every method on it (getBalance, getLatestBlockhash, sendRawTransaction,
// confirmTransaction, …) transparently fails over when an endpoint returns
// 429/5xx/auth errors or the network blips — no call-site change beyond swapping
// the constructor. Re-sending an already-signed transaction to a second RPC is
// safe: Solana dedupes by signature.
//
// Priority (per network): the caller's explicit url (if any) → Helius → Alchemy
// → Ankr → the keyless public endpoint, always last. We never depend on the
// public endpoint alone — it is the most aggressively rate-limited (the source of
// the `getBalance 429` log noise).

import { Connection } from '@solana/web3.js';

function deriveWsUrl(httpUrl) {
	return String(httpUrl).replace(/^https:/, 'wss:').replace(/^http:/, 'ws:');
}

const COOLDOWN_MS = 30_000;
const PUBLIC_MAINNET = 'https://api.mainnet-beta.solana.com';
const PUBLIC_DEVNET = 'https://api.devnet.solana.com';

function dedupe(list) {
	const seen = new Set();
	return list.filter((u) => u && typeof u === 'string' && !seen.has(u) && seen.add(u));
}

// devnet is inferred from the caller's url so we never append a mainnet fallback
// to a devnet primary (or vice-versa) — crossing clusters would return wrong data.
function inferNetwork(url) {
	return /devnet/i.test(String(url || '')) ? 'devnet' : 'mainnet';
}

/**
 * Priority-ordered endpoint list for a network. An explicit `url` (the value a
 * call site already resolved) is pinned first; the keyed providers and public
 * endpoint follow as fallbacks.
 */
export function solanaRpcEndpoints(network = 'mainnet', url = null) {
	const key = process.env.HELIUS_API_KEY;
	const alch = process.env.ALCHEMY_API_KEY;
	if (network === 'devnet') {
		return dedupe([
			url,
			process.env.SOLANA_RPC_URL_DEVNET,
			key && `https://devnet.helius-rpc.com/?api-key=${key}`,
			alch && `https://solana-devnet.g.alchemy.com/v2/${alch}`,
			PUBLIC_DEVNET,
		]);
	}
	return dedupe([
		url,
		process.env.SOLANA_RPC_URL,
		key && `https://mainnet.helius-rpc.com/?api-key=${key}`,
		alch && `https://solana-mainnet.g.alchemy.com/v2/${alch}`,
		'https://rpc.ankr.com/solana',
		PUBLIC_MAINNET,
	]);
}

function maskUrl(url) {
	try {
		const u = new URL(url);
		return `${u.protocol}//${u.host}`;
	} catch {
		return String(url).slice(0, 24);
	}
}

// Rotate this endpoint out of service on a 401/403 (bad/expired key on this
// provider only), 429 (rate-limited), or 5xx (provider down) — all of which the
// next provider may not share. Other 4xx are real request errors and identical
// everywhere, so they're returned to the caller as-is.
function shouldRotate(status) {
	return status === 401 || status === 403 || status === 429 || status >= 500;
}

// Per-Connection rotating fetch. Cooldown state is captured in this closure, so
// it's shared across every JSON-RPC call made through one Connection instance.
function makeRotatingFetch(endpoints) {
	const cooldownUntil = new Array(endpoints.length).fill(0);
	return async function rotatingFetch(_info, init) {
		let lastErr = null;
		let attempted = false;
		for (let i = 0; i < endpoints.length; i++) {
			if (cooldownUntil[i] > Date.now()) continue;
			attempted = true;
			try {
				const resp = await fetch(endpoints[i], init);
				if (shouldRotate(resp.status)) {
					cooldownUntil[i] = Date.now() + COOLDOWN_MS;
					lastErr = new Error(`solana rpc ${resp.status} @ ${maskUrl(endpoints[i])}`);
					if (i + 1 < endpoints.length) {
						console.warn(`[solana-rpc] ${maskUrl(endpoints[i])} ${resp.status} — failing over`);
					}
					continue;
				}
				return resp;
			} catch (err) {
				cooldownUntil[i] = Date.now() + COOLDOWN_MS;
				lastErr = err;
			}
		}
		// Every endpoint is cooling down — don't hard-fail; take one more shot at
		// the primary (its cooldown may have just lapsed under load).
		if (!attempted) return fetch(endpoints[0], init);
		throw lastErr || new Error('all solana rpc endpoints failed');
	};
}

/**
 * Drop-in replacement for `new Connection(url, commitment)` that adds transparent
 * RPC failover. Pass the url the call site already resolved as `url`; it stays
 * the highest-priority endpoint and the keyed/public fallbacks are appended.
 */
export function solanaConnection({ url = null, commitment = 'confirmed', network = null } = {}) {
	const net = network || inferNetwork(url);
	const endpoints = solanaRpcEndpoints(net, url);
	const primary = endpoints[0] || (net === 'devnet' ? PUBLIC_DEVNET : PUBLIC_MAINNET);
	return new Connection(primary, {
		commitment,
		wsEndpoint: deriveWsUrl(primary),
		...(endpoints.length > 1 ? { fetch: makeRotatingFetch(endpoints) } : {}),
	});
}
