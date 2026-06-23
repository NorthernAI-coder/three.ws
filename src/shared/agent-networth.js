/**
 * Net-Worth-Reactive Avatar — the single client source of truth.
 *
 * The agent wears its wallet: holdings, $THREE, fork lineage and reputation become
 * the 3D body's aura, material, idle confidence and regalia. Every number here is
 * REAL — it comes from GET /api/agents/:id/solana/networth, which aggregates real
 * Solana balances (via api/_lib/balances.js), real $THREE holdings, and real fork
 * counts, and returns the canonical "look" so the galaxy star, the profile hero,
 * and the AR body always agree (one normalizer, one truth).
 *
 * The server computes the canonical look/tier/marks; this module fetches it,
 * persists owner reactivity prefs (CSRF-gated), and carries a small local mirror of
 * the tier model (kept in lockstep with api/_lib/networth-model.js) for the
 * hold-last-state / offline path so a brief RPC hiccup never blanks an avatar.
 */

// Mirror of api/_lib/networth-model.js — keep the thresholds in lockstep. Used
// only for the offline/hold-last fallback; the server result is authoritative.
export const THREE_MINT = 'FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump';

export const PRESENCE_TIERS = [
	{ key: 'latent',   label: 'Latent',   min: 0,      accent: '#8b8b9a' },
	{ key: 'spark',    label: 'Spark',    min: 1,      accent: '#8b5cf6' },
	{ key: 'glow',     label: 'Glow',     min: 50,     accent: '#a78bfa' },
	{ key: 'radiant',  label: 'Radiant',  min: 500,    accent: '#c4b5fd' },
	{ key: 'luminous', label: 'Luminous', min: 5_000,  accent: '#ddd6fe' },
	{ key: 'beacon',   label: 'Beacon',   min: 50_000, accent: '#f5f3ff' },
];

export const REACTIVITY_LEVELS = ['off', 'subtle', 'balanced', 'expressive'];
export const DEFAULT_PREFS = { reactivity: 'balanced', signals: { aura: true, events: true, reputation: true } };

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, Number(n) || 0));

export function tierForUsd(usd) {
	const v = Math.max(0, Number(usd) || 0);
	let index = 0;
	for (let i = 0; i < PRESENCE_TIERS.length; i++) if (v >= PRESENCE_TIERS[i].min) index = i;
	const t = PRESENCE_TIERS[index];
	const nx = PRESENCE_TIERS[index + 1] || null;
	return {
		key: t.key, label: t.label, index, accent: t.accent,
		next: nx ? { key: nx.key, label: nx.label, usd_to_next: Math.max(0, nx.min - v) } : null,
	};
}

/** Local mirror of the server look computation (offline / hold-last fallback). */
export function computeLook(state = {}) {
	const usd = Math.max(0, Number(state.usd) || 0);
	const tier = tierForUsd(usd);
	const wealth = clamp(Math.log10(usd + 1) / 5, 0, 1);
	const threeUsd = Math.max(0, Number(state.threeUsd) || 0);
	const threeBoost = threeUsd > 0 ? clamp(Math.log10(threeUsd + 1) / 5, 0, 0.18) : 0;
	const auraIntensity = clamp(wealth + threeBoost, 0, 1);
	const repScore = clamp(state.repScore, 0, 100) / 100;
	const forks = Math.max(0, Number(state.forkCount) || 0);
	const forkBoost = clamp(Math.log10(forks + 1) / 3, 0, 0.25);
	const confidence = clamp(tier.index / 5 * 0.6 + repScore * 0.25 + forkBoost, 0, 1);
	return {
		tier,
		auraIntensity,
		auraColor: tier.accent,
		materialTier: Math.floor(tier.index / 2),
		confidence,
		glow: clamp(0.12 + auraIntensity * 0.88, 0, 1),
	};
}

export function normalizePrefs(raw) {
	const r = raw && typeof raw === 'object' ? raw : {};
	const reactivity = REACTIVITY_LEVELS.includes(r.reactivity) ? r.reactivity : DEFAULT_PREFS.reactivity;
	const sig = r.signals && typeof r.signals === 'object' ? r.signals : {};
	return { reactivity, signals: { aura: sig.aura !== false, events: sig.events !== false, reputation: sig.reputation !== false } };
}

// ── Network ──────────────────────────────────────────────────────────────────

/**
 * Fetch the agent's real net-worth look. Returns the server payload, or `null`
 * when the read fails (callers then hold the last real state — never invent one).
 * @param {string} agentId
 * @param {object} [opts]
 * @param {AbortSignal} [opts.signal]
 * @returns {Promise<object|null>}
 */
export async function fetchNetWorth(agentId, opts = {}) {
	if (!agentId) return null;
	try {
		const r = await fetch(`/api/agents/${encodeURIComponent(agentId)}/solana/networth`, {
			headers: { accept: 'application/json' },
			credentials: 'include',
			signal: opts.signal,
		});
		if (!r.ok) return null;
		const j = await r.json().catch(() => null);
		return j?.data || null;
	} catch {
		return null; // network/abort — hold last state
	}
}

let _csrf = null;
async function csrfToken() {
	if (_csrf && _csrf.expiresAt > Date.now() + 5_000) return _csrf.token;
	const r = await fetch('/api/csrf-token', { credentials: 'include' });
	if (!r.ok) throw new Error('Could not obtain a security token — sign in again.');
	const j = await r.json();
	_csrf = { token: j.data.token, expiresAt: Date.now() + (j.data.expires_in - 30) * 1000 };
	return _csrf.token;
}

/**
 * Persist the owner's reactivity preferences (owner-only, CSRF-gated server-side).
 * @param {string} agentId
 * @param {{reactivity?:string, signals?:object}} prefs
 * @returns {Promise<object>} the saved, normalized prefs
 */
export async function saveNetWorthPrefs(agentId, prefs) {
	const token = await csrfToken();
	_csrf = null; // single-use
	const r = await fetch(`/api/agents/${encodeURIComponent(agentId)}/solana/networth`, {
		method: 'PUT',
		headers: { 'content-type': 'application/json', 'x-csrf-token': token, accept: 'application/json' },
		credentials: 'include',
		body: JSON.stringify(prefs),
	});
	const j = await r.json().catch(() => ({}));
	if (!r.ok) throw Object.assign(new Error(j?.error_description || 'Could not save presence settings'), { status: r.status, code: j?.error });
	return j.data?.prefs || normalizePrefs(prefs);
}

// ── Formatting ───────────────────────────────────────────────────────────────

export function fmtUsd(n) {
	const v = Number(n) || 0;
	if (v === 0) return '$0';
	if (v < 0.01) return '<$0.01';
	if (v < 1) return `$${v.toFixed(2)}`;
	if (v < 1000) return `$${v.toFixed(v < 100 ? 1 : 0)}`;
	if (v < 1_000_000) return `$${(v / 1000).toFixed(v < 10_000 ? 1 : 0)}k`;
	return `$${(v / 1_000_000).toFixed(1)}M`;
}

export function fmtAmount(n) {
	const v = Number(n) || 0;
	if (v < 1000) return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
	if (v < 1_000_000) return `${(v / 1000).toFixed(1)}k`;
	if (v < 1_000_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
	return `${(v / 1_000_000_000).toFixed(1)}B`;
}

/** Parse a hex accent (#rgb / #rrggbb) to a normalized [r,g,b] triple for WebGL. */
export function hexToRgb(hex) {
	let h = String(hex || '#8b5cf6').replace('#', '');
	if (h.length === 3) h = h.split('').map((c) => c + c).join('');
	const int = parseInt(h, 16);
	if (Number.isNaN(int)) return [0.55, 0.36, 0.96];
	return [((int >> 16) & 255) / 255, ((int >> 8) & 255) / 255, (int & 255) / 255];
}
