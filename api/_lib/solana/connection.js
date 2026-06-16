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

// Cooldown durations by failure class. Quota exhaustion (e.g. Helius -32429
// "max usage reached") means the provider is dead for the billing window, so we
// park it for hours instead of re-hammering it on every RPC call and every cron
// tick — that re-hammering was the source of the 429 retry storm in the logs.
// Plain rate-limits, auth rejections, and transient 5xx/network blips cool down
// for shorter, proportionate windows.
const QUOTA_COOLDOWN_MS = 6 * 3_600_000; // 6h — daily/monthly quota exhausted
const RATE_LIMIT_COOLDOWN_MS = 10 * 60_000; // 10m — transient 429
const AUTH_COOLDOWN_MS = 30 * 60_000; // 30m — bad/expired key on this provider only
const SERVER_COOLDOWN_MS = 2 * 60_000; // 2m — provider 5xx
const NETWORK_COOLDOWN_MS = 30_000; // 30s — fetch threw (DNS/connection blip)
const PUBLIC_MAINNET = 'https://api.mainnet-beta.solana.com';
const PUBLIC_DEVNET = 'https://api.devnet.solana.com';

// Process-wide endpoint cooldown, keyed by full URL. Shared across every
// Connection built in this lambda instance — both solanaConnection() and
// RpcFallback — so once one provider reports quota-exhausted, ALL callers skip
// it until it recovers. Per-instance state is correct on Vercel: it self-heals
// on cooldown expiry and a cold start simply re-probes.
const _endpointCooldown = new Map();

function cooldownMsFor(status, bodyText) {
	if (status === 429) {
		return /max usage reached|-32429|quota|usage limit|credits?\s*exhausted/i.test(bodyText || '')
			? QUOTA_COOLDOWN_MS
			: RATE_LIMIT_COOLDOWN_MS;
	}
	if (status === 401 || status === 403) return AUTH_COOLDOWN_MS;
	if (status >= 500) return SERVER_COOLDOWN_MS;
	return RATE_LIMIT_COOLDOWN_MS;
}

/** True when `url` is currently parked in cooldown and should be skipped. */
export function isEndpointCooling(url) {
	return (_endpointCooldown.get(url) || 0) > Date.now();
}

/**
 * Park `url` in cooldown for a window sized to the failure class. Returns the
 * chosen cooldown in ms so callers can log it. `bodyText` (a 429 body or error
 * message) is scanned for a quota signal to pick the long window.
 */
export function markEndpointCooldown(url, status, bodyText) {
	const ms = cooldownMsFor(status, bodyText);
	_endpointCooldown.set(url, Date.now() + ms);
	return ms;
}

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

// Rotating fetch backing a Connection. It NEVER surfaces a rotate-worthy status
// (401/403/429/5xx) to @solana/web3.js — it either returns a healthy response or
// throws — so web3.js's internal 429 backoff loop ("Server responded with 429 …
// Retrying after Nms") never fires. Cooldowns live in the process-wide map, so a
// quota-dead provider is skipped on the very next call (and next cron tick), not
// re-probed every time.
export function makeRotatingFetch(endpoints) {
	return async function rotatingFetch(_info, init) {
		let lastErr = null;
		let attempted = false;
		for (const url of endpoints) {
			if (isEndpointCooling(url)) continue;
			attempted = true;
			try {
				const resp = await fetch(url, init);
				if (shouldRotate(resp.status)) {
					// Read the body only on the failure path (we never return it) so a
					// quota signal can pick the long cooldown.
					const bodyText = resp.status === 429 ? await resp.clone().text().catch(() => '') : '';
					// Check BEFORE marking: if parallel rotatingFetch calls race onto
					// the same endpoint simultaneously, only the first to resolve logs —
					// all subsequent callers see alreadyCooling=true and skip the line.
					const alreadyCooling = isEndpointCooling(url);
					const ms = markEndpointCooldown(url, resp.status, bodyText);
					if (!alreadyCooling) {
						console.warn(
							`[solana-rpc] ${maskUrl(url)} ${resp.status} — cooling ${Math.round(ms / 60_000)}m, failing over`,
						);
					}
					lastErr = new Error(`solana rpc ${resp.status} @ ${maskUrl(url)}`);
					continue;
				}
				return resp;
			} catch (err) {
				// A thrown fetch is a transient network/DNS blip, not a quota signal —
				// cool only briefly so a healthy provider isn't parked for long.
				_endpointCooldown.set(url, Date.now() + NETWORK_COOLDOWN_MS);
				lastErr = err;
			}
		}
		// Every endpoint is cooling down. Rather than blindly re-hit the (likely
		// dead) primary, take one shot at whichever recovers soonest — its cooldown
		// may have just lapsed and it's the least-bad option.
		if (!attempted) {
			const soonest = endpoints
				.slice()
				.sort((a, b) => (_endpointCooldown.get(a) || 0) - (_endpointCooldown.get(b) || 0))[0];
			return fetch(soonest, init);
		}
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
		// Never let web3.js run its own 429 backoff loop: with >1 endpoint the
		// rotating fetch already hides 429s, and with a single endpoint we want to
		// fail fast to the caller rather than spend seconds retrying a dead lane.
		disableRetryOnRateLimit: true,
		...(endpoints.length > 1 ? { fetch: makeRotatingFetch(endpoints) } : {}),
	});
}
