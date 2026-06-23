// Net-worth → embodiment model (pure, dependency-free).
//
// One source of truth for how an agent's REAL on-chain state becomes its 3D
// presence: the wealth/reputation tier, the aura intensity/colour, the idle
// confidence, and the legible "regalia" marks. The server computes the canonical
// look from real reads (api/agents/solana-wallet.js → handleNetWorth) and the
// browser renders it; src/shared/agent-networth.js imports the same constants for
// the offline/hold-last-state fallback so the galaxy star, the profile hero, and
// the AR body always agree.
//
// Every output traces to a real number. Nothing here invents a balance — callers
// pass real portfolio USD, real $THREE holdings, real fork counts, and real
// reputation, and this maps them onto appearance. A zero wallet yields a calm
// baseline look, never a punished or fabricated one.

// $THREE is the only coin. Its mint is the one token we ever read a holding of by
// name; everything else in a wallet is generic runtime data.
export const THREE_MINT = 'FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump';

// Presence tiers, keyed off real portfolio USD value. Names follow the aura
// metaphor (light, not money) so a well-funded agent reads as *present*, never
// gaudy. `min` is the real USD threshold that unlocks the tier.
export const PRESENCE_TIERS = Object.freeze([
	{ key: 'latent',   label: 'Latent',   min: 0,      accent: '#8b8b9a' },
	{ key: 'spark',    label: 'Spark',    min: 1,      accent: '#8b5cf6' },
	{ key: 'glow',     label: 'Glow',     min: 50,     accent: '#a78bfa' },
	{ key: 'radiant',  label: 'Radiant',  min: 500,    accent: '#c4b5fd' },
	{ key: 'luminous', label: 'Luminous', min: 5_000,  accent: '#ddd6fe' },
	{ key: 'beacon',   label: 'Beacon',   min: 50_000, accent: '#f5f3ff' },
]);

export const REACTIVITY_LEVELS = Object.freeze(['off', 'subtle', 'balanced', 'expressive']);

// Per-signal opt-in/out, all default-on. The owner can hide any single channel
// (e.g. mute the balance-driven aura while keeping tip reactions).
export const DEFAULT_PREFS = Object.freeze({
	reactivity: 'balanced',
	signals: Object.freeze({ aura: true, events: true, reputation: true }),
});

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, Number(n) || 0));

/** Resolve the presence tier (and the next step) from a real USD value. */
export function tierForUsd(usd) {
	const v = Math.max(0, Number(usd) || 0);
	let index = 0;
	for (let i = 0; i < PRESENCE_TIERS.length; i++) {
		if (v >= PRESENCE_TIERS[i].min) index = i;
	}
	const tier = PRESENCE_TIERS[index];
	const nextDef = PRESENCE_TIERS[index + 1] || null;
	const next = nextDef
		? { key: nextDef.key, label: nextDef.label, usd_to_next: Math.max(0, nextDef.min - v) }
		: null;
	return { key: tier.key, label: tier.label, index, accent: tier.accent, next };
}

/**
 * Map real state onto a render-ready look descriptor. Intensity is log-scaled so
 * the aura grows smoothly across orders of magnitude (a $50k agent doesn't blow
 * out a $500 one). Confidence blends wealth tier with real reputation.
 *
 * @param {object} state
 * @param {number} state.usd          real total portfolio USD
 * @param {number} [state.threeUsd]   real $THREE holding value (extra warmth)
 * @param {number} [state.forkCount]  real forks-of-this-agent
 * @param {number} [state.repScore]   real reputation score 0..100 (optional)
 * @param {number} [state.attesters]  real unique attesters (optional)
 */
export function computeLook(state = {}) {
	const usd = Math.max(0, Number(state.usd) || 0);
	const tier = tierForUsd(usd);

	// log10($+1)/5 → 0 at $0, ~0.34 at $50, ~0.54 at $500, ~0.74 at $5k, ~0.94 at $50k.
	const wealth = clamp(Math.log10(usd + 1) / 5, 0, 1);

	// $THREE holders carry a touch more warmth — the only coin earns its glow.
	const threeUsd = Math.max(0, Number(state.threeUsd) || 0);
	const threeBoost = threeUsd > 0 ? clamp(Math.log10(threeUsd + 1) / 5, 0, 0.18) : 0;

	const auraIntensity = clamp(wealth + threeBoost, 0, 1);

	// Reputation lifts the idle posture (stands taller / steadier) without touching
	// the aura, so a brand-new but well-attested agent still reads as trusted.
	const repScore = clamp(state.repScore, 0, 100) / 100;
	const forks = Math.max(0, Number(state.forkCount) || 0);
	const forkBoost = clamp(Math.log10(forks + 1) / 3, 0, 0.25); // 9 forks ~0.33→capped .25
	const confidence = clamp(tier.index / 5 * 0.6 + repScore * 0.25 + forkBoost, 0, 1);

	// Emissive/material rim steps every two tiers → 0,0,1,1,2,2.
	const materialTier = Math.floor(tier.index / 2);

	return {
		tier,
		auraIntensity,
		auraColor: tier.accent,
		materialTier,
		confidence,
		// A small static-readable glow floor so the look survives reduced-motion
		// (the ring is visible even when the pulse animation is suppressed).
		glow: clamp(0.12 + auraIntensity * 0.88, 0, 1),
	};
}

/**
 * Build the legible reputation regalia — every mark backed by a real number, each
 * deep-linkable to the wallet hub / the moment that earned it. Order: wealth tier,
 * $THREE holding, forks, attestation.
 */
export function computeMarks(state = {}, { hubUrl = null } = {}) {
	const marks = [];
	const usd = Math.max(0, Number(state.usd) || 0);
	const tier = tierForUsd(usd);
	if (tier.index > 0) {
		marks.push({
			key: 'presence',
			label: tier.label,
			value: fmtUsd(usd),
			detail: `Portfolio ${fmtUsd(usd)}`,
			href: hubUrl,
		});
	}
	const threeAmount = Math.max(0, Number(state.threeAmount) || 0);
	if (threeAmount > 0) {
		marks.push({
			key: 'three',
			label: '$THREE holder',
			value: fmtAmount(threeAmount),
			detail: `Holds ${fmtAmount(threeAmount)} $THREE${state.threeUsd ? ` (${fmtUsd(state.threeUsd)})` : ''}`,
			href: hubUrl,
		});
	}
	const forks = Math.max(0, Number(state.forkCount) || 0);
	if (forks > 0) {
		marks.push({
			key: 'forks',
			label: forks === 1 ? 'Forked once' : `Forked ${forks}×`,
			value: forks,
			detail: `${forks} agent${forks === 1 ? '' : 's'} forked from this one`,
			href: hubUrl,
		});
	}
	const attesters = Math.max(0, Number(state.attesters) || 0);
	if (attesters > 0) {
		marks.push({
			key: 'attested',
			label: 'Attested',
			value: attesters,
			detail: `${attesters} on-chain attester${attesters === 1 ? '' : 's'}`,
			href: hubUrl,
		});
	}
	return marks;
}

/** Coerce raw stored prefs into a complete, valid prefs object. */
export function normalizePrefs(raw) {
	const r = raw && typeof raw === 'object' ? raw : {};
	const reactivity = REACTIVITY_LEVELS.includes(r.reactivity) ? r.reactivity : DEFAULT_PREFS.reactivity;
	const sig = r.signals && typeof r.signals === 'object' ? r.signals : {};
	return {
		reactivity,
		signals: {
			aura: sig.aura !== false,
			events: sig.events !== false,
			reputation: sig.reputation !== false,
		},
	};
}

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
