// Omniology adapter — the ONLY module that knows Omniology's wire shapes.
//
// Omniology (omniology.ai) is an external collaborator running AI-agent contests
// every ~88 seconds with USDC-on-Solana prizes. Their service exposes a single
// polled feed for the in-world screens and an x402-priced submit endpoint for the
// entry desk. This adapter is the boundary: it reads the configured base URL,
// fetches the raw feed, and normalizes it into the camelCase / millisecond shape
// the rest of the Arena consumes. Everything downstream (contest-screen.js,
// entry-desk.js) speaks NormalizedFeed only — so swapping the real base URL, or
// adapting to a wire-shape change, is a one-file edit here.
//
// Contract: docs/omniology-arena/CONTRACTS.md §1.1 (feed), §1.2 (submit), §2.1.
// No mocks, ever (CLAUDE.md): when no base URL is configured, fetchLiveFeed()
// surfaces an explicit `unconfigured` status — it NEVER fabricates contest data.

// ── config ───────────────────────────────────────────────────────────────────

/**
 * Resolve Omniology's base URL (no trailing slash) from, in priority order:
 *   1. window.OMNIOLOGY_BASE       — runtime override (tests / embeds)
 *   2. <meta name="omniology-base"> — baked into the Arena page
 *   3. VITE_OMNIOLOGY_BASE          — build-time env
 * Returns '' when nothing is configured, which fetchLiveFeed() treats as the
 * designed "unconfigured" state rather than an error.
 * @returns {string}
 */
export function omniologyBase() {
	if (typeof window !== 'undefined' && window.OMNIOLOGY_BASE) {
		return clean(window.OMNIOLOGY_BASE);
	}
	if (typeof document !== 'undefined') {
		const v = document.querySelector('meta[name="omniology-base"]')?.getAttribute('content');
		if (v && v.trim()) return clean(v);
	}
	try {
		const env = import.meta?.env?.VITE_OMNIOLOGY_BASE;
		if (env) return clean(String(env));
	} catch (_) { /* import.meta unavailable outside a bundler (e.g. node tests) */ }
	return '';
}

function clean(url) {
	return String(url).trim().replace(/\/+$/, '');
}

// ── read: live contest feed ───────────────────────────────────────────────────

/**
 * GET {base}/v1/contests/live and normalize to NormalizedFeed.
 *
 * - Unconfigured (no base URL): resolves to a NormalizedFeed with `ok:false` and
 *   `reason:'unconfigured'` — never fabricated data. The screens render their
 *   "connecting to Omniology" placeholder for this.
 * - Network / HTTP error: THROWS (the poller catches it and drives the designed,
 *   auto-retrying error state). This matches the CONTRACTS §2.1 boundary.
 *
 * @returns {Promise<NormalizedFeed>}
 */
export async function fetchLiveFeed() {
	const base = omniologyBase();
	if (!base) return unconfiguredFeed();

	const res = await fetch(`${base}/v1/contests/live`, {
		headers: { accept: 'application/json' },
	});
	if (!res.ok) throw new Error(`Omniology feed HTTP ${res.status}`);
	const data = await res.json();
	return normalizeFeed(data);
}

/**
 * Normalize Omniology's wire feed (snake_case, unix seconds) into the Arena's
 * internal shape (camelCase, ms). Exported so the adapter's contract is unit
 * testable without a live endpoint. Tolerant of nulls per CONTRACTS §1.1: an
 * unknown field becomes null/empty, never invented.
 * @param {object} data
 * @returns {NormalizedFeed}
 */
export function normalizeFeed(data) {
	const d = data || {};
	const serverNowMs = secToMs(d.now_unix) ?? nowMs();

	const c = d.current;
	const current = c && c.id != null ? {
		id: str(c.id),
		title: str(c.title) || 'Live contest',
		round: num(c.round) ?? 0,
		opensMs: secToMs(c.opened_unix),
		closesMs: secToMs(c.closes_unix),
		entriesCount: num(c.entries_count) ?? 0,
		prizeUsdc: num(c.prize_usdc) ?? 0,
		prizeAsset: str(c.prize_asset) || 'USDC',
	} : null;

	const next = d.next && d.next.opens_unix != null
		? { opensMs: secToMs(d.next.opens_unix) }
		: null;

	const leaderboard = asArray(d.leaderboard).map((e, i) => ({
		rank: num(e?.rank) ?? i + 1,
		entryId: str(e?.entry_id),
		agent: str(e?.agent) || 'anon',
		score: num(e?.score),
		thumbUrl: httpsUrl(e?.thumb_url),
	}));

	const recentEntries = asArray(d.recent_entries).map((e) => ({
		entryId: str(e?.entry_id),
		agent: str(e?.agent) || 'anon',
		submittedMs: secToMs(e?.submitted_unix) ?? serverNowMs,
	}));

	const recentWinners = asArray(d.recent_winners).map((w) => ({
		round: num(w?.round) ?? 0,
		agent: str(w?.agent) || 'anon',
		prizeUsdc: num(w?.prize_usdc) ?? 0,
		tx: w?.tx ? str(w.tx) : null,
	}));

	return {
		ok: true,
		reason: null,
		serverNowMs,
		current,
		next,
		leaderboard,
		recentEntries,
		recentWinners,
	};
}

function unconfiguredFeed() {
	return {
		ok: false,
		reason: 'unconfigured',
		serverNowMs: nowMs(),
		current: null,
		next: null,
		leaderboard: [],
		recentEntries: [],
		recentWinners: [],
	};
}

// ── write: submit entry (consumed by the entry desk, prompt 04) ────────────────

/**
 * Build the exact request the entry desk hands to `POST /api/x402-pay` for the
 * external x402 flow (CONTRACTS §1.2 / §2.3). Defined here now so the boundary is
 * frozen before prompt 04 — keep this signature stable.
 *
 * The server-side x402 payer handles the 402 challenge → sign → retry; this only
 * describes the target request. The paying agentId is attached by the desk, not
 * here (no wallet/secret ever touches this client module).
 *
 * @param {string} contestId
 * @param {object} entry  partner-defined entry payload
 * @param {string|null} [agent]  display name, or null
 * @returns {{ url:string, method:'POST', body:{ entry:object, agent:string|null } }}
 */
export function submitEntryRequest(contestId, entry, agent) {
	const base = omniologyBase();
	const id = encodeURIComponent(String(contestId ?? ''));
	return {
		url: `${base}/v1/contests/${id}/entries`,
		method: 'POST',
		body: { entry: entry ?? {}, agent: agent ?? null },
	};
}

// ── compose schema + local validation (entry desk, prompt 04) ──────────────────
//
// Omniology's exact entry fields are pending QUESTIONS-FOR-OMNIOLOGY.md #6. This
// is the documented default contract and the SINGLE place to update when the
// partner confirms — the desk's compose UI renders itself from ENTRY_FIELDS, so a
// field change never touches entry-desk.js. Validation runs BEFORE any payment so
// a doomed entry is never charged (acceptance criteria + QUESTIONS #10).

/**
 * @typedef {object} EntryField
 * @property {string} key
 * @property {string} label
 * @property {'text'|'textarea'|'url'} type
 * @property {boolean} required
 * @property {number} [max]      max characters
 * @property {string} [placeholder]
 * @property {string} [hint]
 */

/** @type {EntryField[]} */
export const ENTRY_FIELDS = [
	{ key: 'title', label: 'Title', type: 'text', required: true, max: 80, placeholder: 'Name your entry', hint: 'Shown on the leaderboard.' },
	{ key: 'prompt', label: 'Your entry', type: 'textarea', required: true, max: 600, placeholder: 'What are you submitting to this round?', hint: 'This is what gets judged.' },
	{ key: 'media_url', label: 'Image or model URL', type: 'url', required: false, placeholder: 'https://…  (optional)', hint: 'Optional HTTPS link to an image or 3D model.' },
];

/**
 * Trim string fields and drop empty optionals so the wire body is clean and
 * deterministic. Required-but-empty fields are kept as '' so validateEntry can
 * flag them (rather than silently omitting and shipping an incomplete entry).
 * @param {object} values  raw compose-form values
 * @returns {object}
 */
export function normalizeEntry(values) {
	const src = values && typeof values === 'object' ? values : {};
	const out = {};
	for (const f of ENTRY_FIELDS) {
		const raw = src[f.key];
		const val = typeof raw === 'string' ? raw.trim() : raw;
		if (val === undefined || val === null || val === '') {
			if (f.required) out[f.key] = '';
			continue;
		}
		out[f.key] = val;
	}
	return out;
}

/**
 * Validate a compose-form entry against Omniology's documented rules locally,
 * before payment. Returns { ok, errors:{ [field]: message } }.
 * @param {object} values
 * @returns {{ ok:boolean, errors:Record<string,string> }}
 */
export function validateEntry(values) {
	const entry = normalizeEntry(values);
	const errors = {};
	for (const f of ENTRY_FIELDS) {
		const val = entry[f.key];
		if (f.required && (val == null || !String(val).length)) {
			errors[f.key] = `${f.label} is required.`;
			continue;
		}
		if (val == null || val === '') continue; // empty optional — nothing to check
		const s = String(val);
		if (f.max && s.length > f.max) {
			errors[f.key] = `${f.label} must be ${f.max} characters or fewer.`;
			continue;
		}
		if (f.type === 'url') {
			let ok = false;
			try { ok = new URL(s).protocol === 'https:'; } catch { ok = false; }
			if (!ok) errors[f.key] = 'Enter a valid https:// link, or leave it blank.';
		}
	}
	return { ok: Object.keys(errors).length === 0, errors };
}

/**
 * How entries are priced — selected by config, NEVER a hardcoded flag in the desk:
 *   'auto' (default) — let /api/x402-pay probe the submit URL: a 402 ⇒ paid (real
 *                      x402 USDC), a plain 200 ⇒ free (no funds move).
 *   'free' — Omniology confirmed entries are free (QUESTIONS #7); the desk POSTs
 *            the submit URL directly and skips the payment stepper entirely.
 *   'paid' — entries always carry a fee; the desk always runs the x402 flow.
 * Reads `window.OMNIOLOGY_ENTRY_FEE`, then `<meta name="omniology-entry-fee">`,
 * then VITE_OMNIOLOGY_ENTRY_FEE.
 * @returns {'auto'|'free'|'paid'}
 */
export function entryFeeMode() {
	let v = '';
	if (typeof window !== 'undefined' && window.OMNIOLOGY_ENTRY_FEE) v = String(window.OMNIOLOGY_ENTRY_FEE);
	if (!v && typeof document !== 'undefined') v = document.querySelector('meta[name="omniology-entry-fee"]')?.getAttribute('content') || '';
	if (!v) { try { v = String(import.meta?.env?.VITE_OMNIOLOGY_ENTRY_FEE || ''); } catch (_) { /* node */ } }
	v = v.trim().toLowerCase();
	return v === 'free' || v === 'paid' ? v : 'auto';
}

/**
 * Pull the player-facing confirmation out of Omniology's submit response. On the
 * paid path the body arrives nested under the payer's result envelope
 * ({ result: { entry_id, status, round, position } }); on the free path it is the
 * bare body. Tolerant of either, and of string/number round/position, so the desk
 * always shows a real confirmation rather than "undefined".
 * @param {object} resultEnvelope
 * @returns {{ entryId:string|null, status:string|null, round:number|null, position:number|null }}
 */
export function readEntryConfirmation(resultEnvelope) {
	const env = resultEnvelope && typeof resultEnvelope === 'object' ? resultEnvelope : {};
	const body = env.result && typeof env.result === 'object' ? env.result : env;
	return {
		entryId: body.entry_id ?? body.entryId ?? null,
		status: body.status ?? null,
		round: num(body.round),
		position: num(body.position),
	};
}

// ── coercion helpers (defensive: the feed is external) ─────────────────────────

function nowMs() { return Date.now(); }

function num(v) {
	if (v == null) return null;
	const n = Number(v);
	return Number.isFinite(n) ? n : null;
}

function str(v) {
	return v == null ? '' : String(v);
}

function secToMs(v) {
	const n = num(v);
	return n == null ? null : Math.round(n * 1000);
}

function asArray(v) {
	return Array.isArray(v) ? v : [];
}

// Only surface CORS-readable HTTPS thumbnails; anything else (http, data:, junk)
// becomes null so the screen renders its designed monogram fallback instead of a
// broken-image box.
function httpsUrl(v) {
	const s = str(v).trim();
	return /^https:\/\//i.test(s) ? s : null;
}

/**
 * @typedef {object} NormalizedFeed
 * @property {boolean} ok                     true on a real feed, false when unconfigured
 * @property {string|null} reason             'unconfigured' when ok is false, else null
 * @property {number} serverNowMs             server clock (ms) for countdown drift correction
 * @property {{id:string,title:string,round:number,opensMs:number|null,closesMs:number|null,entriesCount:number,prizeUsdc:number,prizeAsset:string}|null} current
 * @property {{opensMs:number|null}|null} next
 * @property {Array<{rank:number,entryId:string,agent:string,score:number|null,thumbUrl:string|null}>} leaderboard
 * @property {Array<{entryId:string,agent:string,submittedMs:number}>} recentEntries
 * @property {Array<{round:number,agent:string,prizeUsdc:number,tx:string|null}>} recentWinners
 */
