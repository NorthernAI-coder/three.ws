// Real HTTP client for the Omniology contest API — the ONLY place that knows
// Omniology's wire shapes (CONTRACTS §1). Everything else consumes normalized
// objects, so swapping the real base URL is a one-config change.
//
// No mocks: every call is a live request to OMNIOLOGY_BASE. The `fetch`
// implementation is injectable (`fetchImpl`) so tests drive real request/parse
// logic against a deterministic fetch without monkeypatching globals.
//
// Endpoints (CONTRACTS §1):
//   GET  /v1/contests/live              — the polled feed (current round +
//                                          leaderboard + recent entries/winners)
//   POST /v1/contests/{id}/entries      — submit an entry (forwarded after the
//                                          x402 USDC settlement done by this MCP)

import { OMNIOLOGY_BASE, OMNIOLOGY_API_KEY, HTTP_TIMEOUT_MS, USER_AGENT } from './config.js';

const DEFAULT_TIMEOUT_MS = 20000;

export class OmniologyError extends Error {
	constructor(message, { code, status } = {}) {
		super(message);
		this.name = 'OmniologyError';
		this.code = code || 'omniology_error';
		if (status !== undefined) this.status = status;
	}
}

// ---- normalization helpers -------------------------------------------------
// Defensive coercion. Per CONTRACTS §1.1 unknown fields arrive as `null`
// (never omitted); we mirror that — a missing/garbage value becomes null rather
// than an invented default, so downstream renders designed empty states.

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v) => (typeof v === 'string' && v.trim() !== '' ? v : null);
const secToMs = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 1000) : null);
const arr = (v) => (Array.isArray(v) ? v : []);

function normalizeContest(c) {
	if (!c || typeof c !== 'object') return null;
	return {
		id: str(c.id),
		title: str(c.title),
		round: num(c.round),
		opensMs: secToMs(c.opened_unix),
		closesMs: secToMs(c.closes_unix),
		entriesCount: num(c.entries_count),
		prizeUsdc: num(c.prize_usdc),
		prizeAsset: str(c.prize_asset) || 'USDC',
	};
}

function normalizeLeaderboard(list) {
	return arr(list).map((r) => ({
		rank: num(r?.rank),
		entryId: str(r?.entry_id),
		agent: str(r?.agent),
		score: num(r?.score),
		thumbUrl: str(r?.thumb_url),
	}));
}

function normalizeRecentEntries(list) {
	return arr(list).map((r) => ({
		entryId: str(r?.entry_id),
		agent: str(r?.agent),
		submittedMs: secToMs(r?.submitted_unix),
	}));
}

function normalizeRecentWinners(list) {
	return arr(list).map((r) => ({
		round: num(r?.round),
		agent: str(r?.agent),
		prizeUsdc: num(r?.prize_usdc),
		tx: str(r?.tx),
	}));
}

/**
 * Normalize the raw /v1/contests/live body (CONTRACTS §1.1) into the camelCase,
 * millisecond NormalizedFeed used across the arena (CONTRACTS §2.1).
 */
export function normalizeFeed(raw) {
	const body = raw && typeof raw === 'object' ? raw : {};
	const next = body.next && typeof body.next === 'object' ? { opensMs: secToMs(body.next.opens_unix) } : null;
	return {
		ok: true,
		serverNowMs: secToMs(body.now_unix),
		current: normalizeContest(body.current),
		next,
		leaderboard: normalizeLeaderboard(body.leaderboard),
		recentEntries: normalizeRecentEntries(body.recent_entries),
		recentWinners: normalizeRecentWinners(body.recent_winners),
	};
}

export class OmniologyClient {
	/**
	 * @param {object} [opts]
	 * @param {string} [opts.baseUrl]    — defaults to OMNIOLOGY_BASE
	 * @param {string} [opts.apiKey]     — bearer for the authenticated forward
	 * @param {number} [opts.timeoutMs]
	 * @param {Function} [opts.fetchImpl] — injectable fetch (tests)
	 * @param {string} [opts.userAgent]
	 */
	constructor({ baseUrl, apiKey, timeoutMs, fetchImpl, userAgent } = {}) {
		this.baseUrl = String(baseUrl ?? OMNIOLOGY_BASE ?? '').replace(/\/+$/, '');
		this.apiKey = apiKey ?? OMNIOLOGY_API_KEY ?? '';
		this.timeoutMs = timeoutMs ?? HTTP_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS;
		this.userAgent = userAgent || USER_AGENT;
		this._fetch = fetchImpl || (globalThis.fetch ? globalThis.fetch.bind(globalThis) : null);
		if (typeof this._fetch !== 'function') {
			throw new OmniologyError('No fetch implementation available (Node ≥18 or inject fetchImpl).', {
				code: 'no_fetch',
			});
		}
	}

	_requireBase() {
		if (!this.baseUrl) {
			throw new OmniologyError(
				'OMNIOLOGY_BASE_URL is not set — point it at the Omniology contest API.',
				{ code: 'not_configured' },
			);
		}
		return this.baseUrl;
	}

	// Low-level request. Errors are sanitized: messages name the path + status
	// only, never the bearer token, full URL with secrets, or upstream stack.
	async _request(path, { method = 'GET', body, auth = false } = {}) {
		const base = this._requireBase();
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), this.timeoutMs);

		let res;
		try {
			res = await this._fetch(`${base}${path}`, {
				method,
				headers: {
					accept: 'application/json',
					'user-agent': this.userAgent,
					...(body !== undefined ? { 'content-type': 'application/json' } : {}),
					...(auth && this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}),
				},
				body: body !== undefined ? JSON.stringify(body) : undefined,
				signal: controller.signal,
			});
		} catch (err) {
			clearTimeout(timer);
			if (err?.name === 'AbortError') {
				throw new OmniologyError(`Omniology ${path} timed out after ${this.timeoutMs}ms.`, {
					code: 'timeout',
				});
			}
			throw new OmniologyError(`Omniology ${path} request failed.`, { code: 'network_error' });
		}
		clearTimeout(timer);

		const text = await res.text();
		let data;
		try {
			data = text ? JSON.parse(text) : {};
		} catch {
			data = null;
		}

		if (!res.ok) {
			// Surface a clean upstream message — prefer Omniology's own error
			// string, fall back to the status. Never echo arbitrary HTML/raw body.
			const upstream =
				(data && typeof data === 'object' && (str(data.message) || str(data.error))) || null;
			throw new OmniologyError(
				upstream || `Omniology ${path} returned HTTP ${res.status}.`,
				{ code: 'upstream_error', status: res.status },
			);
		}
		if (data === null) {
			throw new OmniologyError(`Omniology ${path} returned a non-JSON response.`, {
				code: 'bad_response',
			});
		}
		return data;
	}

	/**
	 * Fetch + normalize the live contest feed (CONTRACTS §1.1).
	 * @returns {Promise<object>} NormalizedFeed (CONTRACTS §2.1)
	 */
	async fetchLiveFeed() {
		const raw = await this._request('/v1/contests/live');
		return normalizeFeed(raw);
	}

	/**
	 * Forward a paid entry submission to Omniology (CONTRACTS §1.2). Called only
	 * AFTER this MCP has verified the x402 USDC payment, so the POST itself is a
	 * plain authenticated request — Omniology trusts this server as its x402
	 * front door. Returns Omniology's raw acceptance body
	 * `{ entry_id, status, round, position }`.
	 *
	 * @param {string} contestId
	 * @param {{ entry: object, agent?: string|null }} payload
	 */
	async submitEntry(contestId, { entry, agent = null } = {}) {
		const id = String(contestId ?? '').trim();
		if (!id) throw new OmniologyError('submitEntry: contestId is required.', { code: 'bad_input' });
		const data = await this._request(`/v1/contests/${encodeURIComponent(id)}/entries`, {
			method: 'POST',
			auth: true,
			body: { entry, agent: agent ?? null },
		});
		return {
			entryId: str(data.entry_id),
			status: str(data.status) || 'accepted',
			round: num(data.round),
			position: num(data.position),
		};
	}
}
