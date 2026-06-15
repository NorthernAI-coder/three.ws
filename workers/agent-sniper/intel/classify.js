// Coin Intelligence — classification. Answers "what kind of coin is this?"
//
// Category: meme | tech | ai | culture | community | political | news | animal |
//           celebrity | utility | unknown
//
// Two layers, and it NEVER fails (Rule 9):
//   1. A deterministic keyword heuristic — instant, free, always available.
//   2. An LLM pass (free-first via llmComplete) that refines category, extracts
//      tags + a one-line narrative thesis, and flags news-driven memes.
// If the LLM is unavailable or times out, the heuristic result stands.

import { llmComplete } from '../../../api/_lib/llm.js';

const CATEGORIES = [
	'meme', 'tech', 'ai', 'culture', 'community',
	'political', 'news', 'animal', 'celebrity', 'utility', 'unknown',
];

// Ordered keyword tables — first strong hit wins for the heuristic seed. Lower
// tables are weaker; AI is checked before tech (it's a tech subtype we surface
// separately), animal before meme (animals are usually memes but worth tagging).
const KEYWORDS = [
	['ai', /\b(ai|artificial intelligence|gpt|llm|agent|neural|machine learning|ml|model|inference|gpu|compute)\b/i],
	['animal', /\b(dog|doge|shib|inu|cat|kitty|frog|pepe|monkey|ape|bear|bull|penguin|hippo|capybara|wolf|fox|duck|goat|hamster)\b/i],
	['political', /\b(trump|biden|maga|election|president|senator|congress|vote|government|liberty|freedom|patriot|democrat|republican)\b/i],
	['celebrity', /\b(elon|musk|kanye|drake|taylor|swift|messi|ronaldo|kardashian|mrbeast|celebrity)\b/i],
	['tech', /\b(protocol|chain|defi|stake|staking|yield|swap|dex|node|validator|zk|rollup|layer|infra|sdk|oracle|bridge)\b/i],
	['utility', /\b(tool|utility|payment|pay|wallet|launchpad|scanner|tracker|bot|dashboard|api)\b/i],
	['culture', /\b(culture|art|music|fashion|sport|game|gaming|movie|anime|meme culture|lifestyle|vibe)\b/i],
	['community', /\b(community|dao|family|gang|army|holders|together|movement|cult|society|club)\b/i],
];

function tokenize(text) {
	return (text || '')
		.toLowerCase()
		.replace(/[^a-z0-9\s]/g, ' ')
		.split(/\s+/)
		.filter((w) => w.length >= 3 && w.length <= 20);
}

/**
 * Instant deterministic classification. Always returns a result.
 * @returns {{ category: string, tags: string[], confidence: number, source: 'heuristic' }}
 */
export function heuristicClassify({ name, symbol, description } = {}) {
	const haystack = `${name || ''} ${symbol || ''} ${description || ''}`;
	for (const [cat, re] of KEYWORDS) {
		const m = haystack.match(re);
		if (m) {
			return {
				category: cat,
				tags: [m[0].toLowerCase()].filter(Boolean),
				confidence: 0.45,
				source: 'heuristic',
			};
		}
	}
	// No keyword hit: short tickers with descriptions read as memes; otherwise unknown.
	const words = tokenize(`${name} ${description}`);
	return {
		category: words.length ? 'meme' : 'unknown',
		tags: [],
		confidence: words.length ? 0.3 : 0.15,
		source: 'heuristic',
	};
}

const SYSTEM = `You are a pump.fun coin classifier. Given a coin's name, symbol, and description, classify it precisely. Be literal and grounded — do not hype. Output ONLY strict JSON, no prose.`;

function buildUser({ name, symbol, description, twitter, telegram, website }) {
	return `Classify this pump.fun coin.

Name: ${name || '(none)'}
Symbol: ${symbol || '(none)'}
Description: ${description || '(none)'}
Has socials: ${[twitter && 'twitter', telegram && 'telegram', website && 'website'].filter(Boolean).join(', ') || 'none'}

Output strict JSON:
{
  "category": one of ${JSON.stringify(CATEGORIES)},
  "is_news_meme": boolean,        // true if it references a current/recent news story or trending event
  "tags": ["3-6 short lowercase tags"],
  "narrative": "one literal sentence: what this coin is about and why someone made it",
  "confidence": 0.0-1.0
}

Rules: pick the single best category. "ai" for AI/agent themes, "tech" for protocol/defi/infra, "animal" for animal mascots, "meme" only when nothing more specific fits. Never invent facts not implied by the inputs.`;
}

function coerceCategory(c) {
	const v = String(c || '').toLowerCase().trim();
	return CATEGORIES.includes(v) ? v : 'unknown';
}

function parseJson(text) {
	if (!text) return null;
	// Tolerate code fences / leading prose.
	const match = text.match(/\{[\s\S]*\}/);
	if (!match) return null;
	try { return JSON.parse(match[0]); } catch { return null; }
}

/**
 * Full classification: heuristic seed, then LLM refinement when available.
 * Always resolves to a usable record — never throws.
 *
 * @returns {Promise<{category, tags, narrative, is_news_meme, confidence, source}>}
 */
export async function classifyCoin(coin = {}, { timeoutMs = 12_000 } = {}) {
	const seed = heuristicClassify(coin);

	// Nothing to feed an LLM with — keep the heuristic.
	if (!coin.name && !coin.symbol && !coin.description) {
		return { ...seed, narrative: null, is_news_meme: false };
	}

	try {
		const raw = await llmComplete({
			system: SYSTEM,
			user: buildUser(coin),
			maxTokens: 300,
			timeoutMs,
		});
		const parsed = parseJson(typeof raw === 'string' ? raw : raw?.text);
		if (!parsed) return { ...seed, narrative: null, is_news_meme: false };

		const tags = Array.isArray(parsed.tags)
			? parsed.tags.map((t) => String(t).toLowerCase().trim()).filter(Boolean).slice(0, 6)
			: seed.tags;
		const conf = Number(parsed.confidence);
		return {
			category: coerceCategory(parsed.category),
			tags: tags.length ? tags : seed.tags,
			narrative: parsed.narrative ? String(parsed.narrative).slice(0, 280) : null,
			is_news_meme: !!parsed.is_news_meme,
			confidence: Number.isFinite(conf) ? Math.max(0, Math.min(1, conf)) : 0.6,
			source: 'llm',
		};
	} catch {
		// LLM unavailable / timed out — heuristic stands. Never block the pipeline.
		return { ...seed, narrative: null, is_news_meme: false };
	}
}

export const _internals = { CATEGORIES, KEYWORDS, tokenize };
