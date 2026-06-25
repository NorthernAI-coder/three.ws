// Atelier adapter — the ONLY module that knows Atelier's marketplace wire shapes.
//
// Atelier (atelierai.xyz) is a "hire an AI agent" marketplace settling in USDC on
// Solana/Base, with x402 as its native agent-to-agent rail. three.ws registers
// into that economy as the 3D/avatar specialist; the Atelier World renders the
// marketplace as a walkable plaza where each agent is a booth you walk up to and
// hire. This adapter is the boundary: it reads the configured base URL, fetches
// the raw agent registry, and normalizes it into the camelCase shape the rest of
// the world consumes (atelier-plaza.js). Everything downstream speaks
// NormalizedRoster / NormalizedAgent only — so swapping the real base URL, or
// adapting to a wire-shape change, is a one-file edit here.
//
// No mocks, ever (CLAUDE.md): when no base URL is configured, fetchRoster()
// surfaces an explicit `unconfigured` status — it NEVER fabricates marketplace
// agents. The one always-present booth is the real three.ws 3D Studio (see
// STUDIO_AGENT), which is a live product surface, not sample data.

// ── config ───────────────────────────────────────────────────────────────────

/**
 * Resolve Atelier's base URL (no trailing slash) from, in priority order:
 *   1. window.ATELIER_BASE        — runtime override (tests / embeds)
 *   2. <meta name="atelier-base"> — baked into the world page
 *   3. VITE_ATELIER_BASE          — build-time env
 * Returns '' when nothing is configured, which fetchRoster() treats as the
 * designed "unconfigured" state rather than an error.
 * @returns {string}
 */
export function atelierBase() {
	if (typeof window !== 'undefined' && window.ATELIER_BASE) {
		return clean(window.ATELIER_BASE);
	}
	if (typeof document !== 'undefined') {
		const v = document.querySelector('meta[name="atelier-base"]')?.getAttribute('content');
		if (v && v.trim()) return clean(v);
	}
	try {
		const env = import.meta?.env?.VITE_ATELIER_BASE;
		if (env) return clean(String(env));
	} catch (_) { /* import.meta unavailable outside a bundler (e.g. node tests) */ }
	return '';
}

function clean(url) {
	return String(url).trim().replace(/\/+$/, '');
}

// ── the always-present three.ws booth ──────────────────────────────────────────

/**
 * The three.ws 3D Studio — three.ws's own listing in the Atelier economy, the
 * "make it 3D / make it move" specialist. Always rendered in the plaza (it's a
 * real product surface: the forge), so the world is never empty and the strategy
 * — three.ws registered as Atelier's 3D agent — is tangible the moment you walk
 * in. `featured` floats it to the central dais; `internal` routes "hire" to the
 * forge rather than the external x402 flow.
 * @type {NormalizedAgent}
 */
export const STUDIO_AGENT = Object.freeze({
	id: 'threews-studio',
	name: 'three.ws 3D Studio',
	tagline: 'Turn any character into a rigged, animated 3D avatar.',
	specialty: '3D · Avatars · Rigging',
	avatarUrl: '',
	priceUsdc: 0,
	pricePeriod: 'free lane + paid tiers',
	rating: null,
	jobsDone: null,
	hireUrl: '/forge',
	featured: true,
	internal: true,
});

// ── read: agent roster ──────────────────────────────────────────────────────────

/**
 * GET {base}/v1/agents and normalize to NormalizedRoster.
 *
 * - Unconfigured (no base URL): resolves to a roster with `ok:false`,
 *   `reason:'unconfigured'`, and just the STUDIO_AGENT — never fabricated
 *   marketplace agents. The plaza renders its "connecting to Atelier" empty
 *   state around the studio dais.
 * - Network / HTTP error: THROWS (the poller catches it and drives the designed,
 *   auto-retrying error state).
 *
 * @returns {Promise<NormalizedRoster>}
 */
export async function fetchRoster() {
	const base = atelierBase();
	if (!base) return unconfiguredRoster();

	const res = await fetch(`${base}/v1/agents`, {
		headers: { accept: 'application/json' },
	});
	if (!res.ok) throw new Error(`Atelier roster HTTP ${res.status}`);
	const data = await res.json();
	return normalizeRoster(data, base);
}

/**
 * Normalize Atelier's wire roster (snake_case, unix seconds) into the world's
 * internal shape (camelCase, ms). Exported so the adapter's contract is unit
 * testable without a live endpoint. Tolerant of nulls: an unknown field becomes
 * null/empty, never invented. The STUDIO_AGENT is always prepended.
 *
 * @param {object} data
 * @param {string} [base]  resolved base URL, used to absolutize relative hire paths
 * @returns {NormalizedRoster}
 */
export function normalizeRoster(data, base = '') {
	const d = data || {};
	const serverNowMs = secToMs(d.now_unix) ?? nowMs();
	const agents = asArray(d.agents)
		.map((a) => normalizeAgent(a, base))
		.filter(Boolean);
	return {
		ok: true,
		reason: null,
		serverNowMs,
		agents: [STUDIO_AGENT, ...agents],
	};
}

/**
 * Normalize a single wire agent. Returns null for an entry with no id (it can't
 * be hired or addressed, so it's dropped rather than rendered as a dead booth).
 * @param {object} a
 * @param {string} [base]
 * @returns {NormalizedAgent|null}
 */
export function normalizeAgent(a, base = '') {
	if (!a || a.id == null) return null;
	const id = str(a.id);
	const hire = str(a.hire_url);
	return {
		id,
		name: str(a.name) || 'Untitled agent',
		tagline: str(a.tagline) || '',
		specialty: str(a.specialty) || '',
		avatarUrl: httpsUrl(a.avatar_url),
		priceUsdc: num(a.price_usdc) ?? 0,
		pricePeriod: str(a.price_period) || 'per task',
		rating: num(a.rating),
		jobsDone: num(a.jobs_done),
		// Absolutize a relative hire path against the base; keep an absolute https
		// URL as-is; default to the canonical per-agent hire route.
		hireUrl: hire
			? absolutize(hire, base)
			: (base ? `${base}/v1/agents/${encodeURIComponent(id)}/hire` : ''),
		featured: !!a.featured,
		internal: false,
	};
}

function unconfiguredRoster() {
	return {
		ok: false,
		reason: 'unconfigured',
		serverNowMs: nowMs(),
		agents: [STUDIO_AGENT],
	};
}

// ── write: hire an agent (consumed by the plaza's hire card) ────────────────────

/**
 * Build the exact request the hire card hands to `POST /api/x402-pay` for the
 * server-side x402 flow. The payer signs the 402 challenge → retries; this only
 * describes the target request. The paying agentId is attached by the caller.
 *
 * Returns null for the internal studio agent (it routes to the forge, not x402)
 * or any agent missing a hire URL, so the caller can branch cleanly.
 *
 * @param {NormalizedAgent} agent
 * @param {object} [brief]  optional buyer brief forwarded to Atelier
 * @returns {{ url:string, method:'POST', body:{ brief:object } }|null}
 */
export function hireRequest(agent, brief) {
	if (!agent || agent.internal || !agent.hireUrl) return null;
	return {
		url: agent.hireUrl,
		method: 'POST',
		body: { brief: brief ?? {} },
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

// Only surface CORS-readable HTTPS avatar URLs; anything else (http, data:, junk)
// becomes '' so the booth renders its designed monogram fallback instead of a
// broken model/image.
function httpsUrl(v) {
	const s = str(v).trim();
	return /^https:\/\//i.test(s) ? s : '';
}

// Resolve a possibly-relative hire path against the base. An absolute https URL
// passes through; a '/path' joins onto the base; anything unpar+seable is dropped.
function absolutize(u, base) {
	const s = str(u).trim();
	if (/^https:\/\//i.test(s)) return s;
	if (!base) return '';
	if (s.startsWith('/')) return `${base}${s}`;
	return `${base}/${s}`;
}

/**
 * @typedef {object} NormalizedAgent
 * @property {string} id
 * @property {string} name
 * @property {string} tagline
 * @property {string} specialty
 * @property {string} avatarUrl     '' when none / not https
 * @property {number} priceUsdc
 * @property {string} pricePeriod
 * @property {number|null} rating
 * @property {number|null} jobsDone
 * @property {string} hireUrl        absolute https URL, or '' / internal route
 * @property {boolean} featured      floats to the central dais
 * @property {boolean} internal      routes hire to a three.ws surface, not x402
 */

/**
 * @typedef {object} NormalizedRoster
 * @property {boolean} ok            true on a real feed, false when unconfigured
 * @property {string|null} reason    'unconfigured' when ok is false, else null
 * @property {number} serverNowMs
 * @property {NormalizedAgent[]} agents   STUDIO_AGENT first, then marketplace agents
 */
