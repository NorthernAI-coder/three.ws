// @ts-check
// Source providers for the autonomous coin launcher — the "what to launch" half.
//
// Three flavours, all returning the SAME shape so the engine treats them
// uniformly: { kind, name, symbol, description, trigger_source, trigger_detail }.
//
//   random — wordlist salad. No network, no LLM. The cheap filler that keeps the
//            hybrid cadence ticking when no real trend is live.
//   meme   — LLM synthesises an ORIGINAL meme coin from open meme culture.
//   trend  — reads the cultural signal already in our own pump_coin_intel
//            (categories / tags / narratives of what is breaking out right now)
//            plus recent X chatter, and asks the LLM to coin an ORIGINAL token
//            riding that wave.
//
// Hard rule baked in: the LLM is instructed to invent original names/tickers and
// NEVER copy an existing token's identity. We mine themes (culture), not tickers
// (specific coins) — so this is trend-following, not cloning. The agent's avatar
// (attached later by the engine) is always the coin's visual identity.

import { sql } from './db.js';
import { llmComplete, llmConfigured } from './llm.js';

// ── sanitisers ──────────────────────────────────────────────────────────────
// pump.fun caps: name ≤ 32, symbol ≤ 10. Symbols are uppercased alphanumerics.

/** @param {string} s */
export function sanitizeName(s) {
	return String(s || '')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, 32);
}

/** @param {string} s */
export function sanitizeSymbol(s) {
	const cleaned = String(s || '')
		.toUpperCase()
		.replace(/[^A-Z0-9]/g, '')
		.slice(0, 10);
	return cleaned || 'THREE3';
}

// ── random (no LLM) ───────────────────────────────────────────────────────────
const ADJECTIVES = [
	'Turbo', 'Cosmic', 'Feral', 'Velvet', 'Quantum', 'Rogue', 'Lucid', 'Hyper',
	'Molten', 'Neon', 'Phantom', 'Atomic', 'Wild', 'Solar', 'Frostbit', 'Electric',
	'Savage', 'Mythic', 'Stellar', 'Chrome', 'Gilded', 'Vapor', 'Radiant', 'Drift',
];
const NOUNS = [
	'Otter', 'Comet', 'Goblin', 'Yeti', 'Falcon', 'Mantis', 'Kraken', 'Pixel',
	'Nomad', 'Bishop', 'Tiger', 'Sprout', 'Anvil', 'Specter', 'Lotus', 'Bandit',
	'Phoenix', 'Walrus', 'Cobra', 'Maple', 'Raven', 'Bison', 'Koi', 'Hawk',
];

function pick(arr) {
	return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * A complete, original coin from wordlists. Always succeeds — this is the
 * guaranteed fallback every other provider degrades to.
 * @returns {{kind:'random', name:string, symbol:string, description:string, trigger_source:string, trigger_detail:object}}
 */
export function randomCoin() {
	const adj = pick(ADJECTIVES);
	const noun = pick(NOUNS);
	const name = sanitizeName(`${adj} ${noun}`);
	const symbol = sanitizeSymbol((adj.slice(0, 4) + noun.slice(0, 4)).toUpperCase());
	return {
		kind: 'random',
		name,
		symbol,
		description: `${name} — an autonomous three.ws launch. Fully on-chain, avatar-fronted, $THREE-aligned.`,
		trigger_source: 'random',
		trigger_detail: { adj, noun },
	};
}

// ── cultural signal ───────────────────────────────────────────────────────────

/**
 * Mine what's culturally hot from our own intel: the categories, tags, and
 * narratives of recently observed, high-quality coins, plus recent X chatter.
 * Returns deduped theme strings (never specific tickers).
 * @param {{network?:string, categories?:string[], limit?:number}} opts
 * @returns {Promise<string[]>}
 */
export async function gatherThemes({ network = 'mainnet', categories = [], limit = 40 } = {}) {
	const themes = new Set();

	try {
		const rows = await sql`
			select category, tags, narrative
			from pump_coin_intel
			where network = ${network}
			  and first_seen_at > now() - interval '24 hours'
			  and quality_score is not null and quality_score >= 55
			  ${categories.length ? sql`and category = any(${categories})` : sql``}
			order by quality_score desc nulls last
			limit ${limit}
		`;
		for (const r of rows) {
			if (r.category && r.category !== 'unknown') themes.add(String(r.category));
			if (Array.isArray(r.tags)) r.tags.slice(0, 4).forEach((t) => t && themes.add(String(t)));
			if (r.narrative) themes.add(String(r.narrative).slice(0, 80));
		}
	} catch {
		/* intel table absent or empty — themes stay sparse, engine falls back */
	}

	// Recent X chatter is an optional cultural input; its schema varies, so probe
	// defensively and skip cleanly when the column/table isn't there.
	try {
		const rows = await sql`
			select text from x_posts
			where text is not null and created_at > now() - interval '48 hours'
			order by created_at desc limit 15
		`;
		for (const r of rows) {
			const words = String(r.text || '')
				.replace(/https?:\/\/\S+/g, '')
				.match(/#?[A-Za-z][A-Za-z0-9]{3,18}/g);
			(words || []).slice(0, 3).forEach((w) => themes.add(w.replace(/^#/, '')));
		}
	} catch {
		/* no X signal available — fine */
	}

	return [...themes].slice(0, 24);
}

// ── LLM synthesis ─────────────────────────────────────────────────────────────

const SYNTH_SYSTEM =
	'You are a memecoin naming engine for three.ws, a Solana launch platform. ' +
	'You invent ORIGINAL, punchy, memeable coin identities. Absolute rules: ' +
	'(1) Never copy, reference, or imitate the name or ticker of any existing real ' +
	'cryptocurrency or token — invent something new. (2) name ≤ 32 chars, ' +
	'symbol 3-8 uppercase letters/digits, no spaces. (3) Keep it playful and ' +
	'culturally aware, not offensive or hateful. ' +
	'Respond with STRICT JSON only: {"name":"","symbol":"","description":""}.';

function parseCoinJson(text) {
	if (!text) return null;
	const m = text.match(/\{[\s\S]*\}/);
	if (!m) return null;
	try {
		const o = JSON.parse(m[0]);
		if (!o || typeof o !== 'object' || !o.name || !o.symbol) return null;
		return {
			name: sanitizeName(o.name),
			symbol: sanitizeSymbol(o.symbol),
			description: sanitizeName(String(o.description || '')).slice(0, 180) || `${sanitizeName(o.name)} on three.ws`,
		};
	} catch {
		return null;
	}
}

/**
 * Ask the LLM to coin an original token, optionally riding a set of themes.
 * Degrades to randomCoin() on any LLM failure — never throws, never blocks a tick.
 * @param {{themes?:string[], flavor?:'trend'|'meme', triggerSource?:string}} opts
 */
export async function synthesizeCoin({ themes = [], flavor = 'meme', triggerSource } = {}) {
	if (!llmConfigured()) return { ...randomCoin(), degraded: 'llm_unconfigured' };

	const userPrompt = themes.length
		? `These cultural themes are trending on Solana right now: ${themes.join(', ')}. ` +
		  `Coin ONE original memecoin riding this energy. Do not name it after any of these themes literally if they are existing tokens — riff, don't copy.`
		: 'Coin ONE original, funny, internet-native memecoin from current meme culture.';

	let out;
	try {
		out = await llmComplete({ system: SYNTH_SYSTEM, user: userPrompt, maxTokens: 200, timeoutMs: 12_000 });
	} catch {
		return { ...randomCoin(), degraded: 'llm_error' };
	}

	const coin = parseCoinJson(out?.text);
	if (!coin) return { ...randomCoin(), degraded: 'llm_unparseable' };

	return {
		kind: flavor === 'trend' ? 'trend' : 'meme',
		name: coin.name,
		symbol: coin.symbol,
		description: coin.description,
		trigger_source: triggerSource || (flavor === 'trend' ? 'coin_intel' : 'meme-llm'),
		trigger_detail: { themes: themes.slice(0, 12) },
	};
}

// ── dispatcher ────────────────────────────────────────────────────────────────

/**
 * Choose a coin for a tick given the configured mode. Hybrid prefers a live
 * trend, falls back to a meme, and injects random filler when no signal exists.
 * @param {{mode:string, network?:string, categories?:string[], sources?:string[]}} cfg
 */
export async function pickSource({ mode, network = 'mainnet', categories = [] } = {}) {
	if (mode === 'random') return randomCoin();
	if (mode === 'meme') return synthesizeCoin({ flavor: 'meme' });

	if (mode === 'trend') {
		const themes = await gatherThemes({ network, categories });
		if (themes.length >= 2) return synthesizeCoin({ themes, flavor: 'trend' });
		// No live trend → still honour 'trend' intent with a meme rather than stall.
		return synthesizeCoin({ flavor: 'meme', triggerSource: 'trend-fallback' });
	}

	// hybrid (default): trend first, meme second, occasional random filler.
	const themes = await gatherThemes({ network, categories });
	if (themes.length >= 2) return synthesizeCoin({ themes, flavor: 'trend' });
	if (Math.random() < 0.5) return synthesizeCoin({ flavor: 'meme', triggerSource: 'hybrid' });
	return randomCoin();
}
