// Multi-endpoint Solana RPC connection with automatic failover.
// Ported from pumpkit @pumpkit/core/src/solana/rpc.ts to our serverless layout.
//
// Usage:
//   import { createRpcFallback } from './rpc-fallback.js';
//   const rpc = createRpcFallback({ url: env.SOLANA_RPC_URL, fallbackUrls: [...] });
//   const slot = await rpc.withFallback((c) => c.getSlot());
//
// Rotation policy:
//   - 3 consecutive retryable failures → rotate to next endpoint, prior in 60s cooldown.
//   - 403 / non-retryable errors are re-thrown immediately (auth issues should not
//     burn through fallbacks).

import { Connection } from '@solana/web3.js';
import { solanaRpcEndpoints, isEndpointCooling, markEndpointCooldown } from './connection.js';

const MAX_CONSECUTIVE_FAILS = 3;
const COOLDOWN_MS = 60_000;

// Recover the upstream HTTP status from a thrown web3.js error so we can size the
// shared per-provider cooldown (a quota 429 parks the provider for hours, a plain
// 429 for minutes). web3.js surfaces 429 bodies verbatim, e.g.
// "429 Too Many Requests: {…-32429…max usage reached…}".
function statusFromErr(err) {
	const m = String((err && err.message) || err).match(/\b(401|403|429|500|502|503|504)\b/);
	return m ? Number(m[1]) : 429;
}

export function deriveWsUrl(httpUrl) {
	return String(httpUrl).replace(/^https:/, 'wss:').replace(/^http:/, 'ws:');
}

function maskUrl(url) {
	try {
		const u = new URL(url);
		if (u.pathname.length > 10) {
			return `${u.protocol}//${u.host}/${u.pathname.slice(1, 8)}…`;
		}
		return `${u.protocol}//${u.host}`;
	} catch {
		return String(url).slice(0, 20) + '…';
	}
}

function isRetryable(err) {
	const msg = String(err && err.message ? err.message : err);
	if (msg.includes('403')) return false;
	return (
		msg.includes('429') ||
		msg.includes('502') ||
		msg.includes('503') ||
		msg.includes('504') ||
		msg.includes('ETIMEDOUT') ||
		msg.includes('ECONNREFUSED') ||
		msg.includes('ECONNRESET') ||
		msg.includes('fetch failed')
	);
}

export class RpcFallback {
	constructor({ url, fallbackUrls = [], commitment = 'confirmed' } = {}) {
		if (!url) throw new Error('RpcFallback: primary url is required');
		this.urls = [url, ...fallbackUrls];
		this.commitment = commitment;
		this.currentIndex = 0;
		this.failCounts = new Array(this.urls.length).fill(0);
		this.cooldownUntil = new Array(this.urls.length).fill(0);
		this.connections = new Array(this.urls.length).fill(null);
	}

	getConnection() {
		if (!this.connections[this.currentIndex]) {
			const url = this.urls[this.currentIndex];
			this.connections[this.currentIndex] = new Connection(url, {
				commitment: this.commitment,
				wsEndpoint: deriveWsUrl(url),
				// Fail fast on 429 so we rotate to the next provider immediately
				// instead of web3.js running its 500/1000/2000/4000ms backoff loop
				// ("Server responded with 429 … Retrying after Nms") on a dead lane.
				disableRetryOnRateLimit: true,
			});
		}
		return this.connections[this.currentIndex];
	}

	get currentUrl() {
		return this.urls[this.currentIndex];
	}

	reportSuccess() {
		this.failCounts[this.currentIndex] = 0;
	}

	reportFailure() {
		this.failCounts[this.currentIndex]++;
		if (this.failCounts[this.currentIndex] >= MAX_CONSECUTIVE_FAILS) this._rotate();
	}

	async withFallback(fn) {
		const tried = new Set();
		while (tried.size < this.urls.length) {
			// Skip endpoints parked in the shared process-wide cooldown (e.g. Helius
			// after a quota 429) or this instance's local cooldown — don't re-probe a
			// known-dead lane on every call. Count it as tried so the loop still
			// terminates when everything is cooling.
			if (isEndpointCooling(this.currentUrl) || this.cooldownUntil[this.currentIndex] > Date.now()) {
				tried.add(this.currentIndex);
				this._rotate();
				continue;
			}
			tried.add(this.currentIndex);
			try {
				const result = await fn(this.getConnection());
				this.reportSuccess();
				return result;
			} catch (err) {
				if (isRetryable(err)) {
					const status = statusFromErr(err);
					const ms = markEndpointCooldown(this.currentUrl, status, String((err && err.message) || err));
					console.warn(
						'[rpc-fallback] %s %s — cooling %dm, rotating',
						maskUrl(this.currentUrl),
						status,
						Math.round(ms / 60_000),
					);
					this.reportFailure();
				} else {
					throw err;
				}
			}
		}
		throw new Error('All RPC endpoints exhausted');
	}

	_rotate() {
		this.cooldownUntil[this.currentIndex] = Date.now() + COOLDOWN_MS;
		this.connections[this.currentIndex] = null;
		const prev = this.currentIndex;
		this.currentIndex = (this.currentIndex + 1) % this.urls.length;
		this.failCounts[this.currentIndex] = 0;
		if (this.urls.length > 1) {
			console.info('[rpc-fallback] rotated %s → %s', maskUrl(this.urls[prev]), maskUrl(this.currentUrl));
		}
	}
}

export function createRpcFallback(options) {
	return new RpcFallback(options);
}

// Convenience: build a fallback set from env. The endpoint list is the canonical
// chain (explicit SOLANA_RPC_URL → Helius → Alchemy → Ankr → public), with any
// extra SOLANA_RPC_FALLBACK_URLS appended. So even with no SOLANA_RPC_URL set,
// the keyed providers and public endpoint give a real 3+ deep failover set.
export function rpcFallbackFromEnv({ network = 'mainnet', commitment = 'confirmed' } = {}) {
	const extra = (process.env.SOLANA_RPC_FALLBACK_URLS || '')
		.split(',').map((s) => s.trim()).filter(Boolean);
	const urls = [...solanaRpcEndpoints(network), ...extra]
		.filter((u, i, a) => u && a.indexOf(u) === i);
	const [primary, ...fallbackUrls] = urls;
	return new RpcFallback({ url: primary, fallbackUrls, commitment });
}
