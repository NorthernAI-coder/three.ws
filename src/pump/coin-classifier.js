/**
 * pump/coin-classifier.js
 * -----------------------
 * Classify a pump.fun coin from its launch metadata (name, symbol, description,
 * socials). The real path is an LLM call through the platform's free-first
 * provider chain (Groq/OpenRouter/NVIDIA before any paid key). If every provider
 * is unavailable the keyword heuristic takes over — classification NEVER fails
 * and never blocks the intel pipeline (operating rule 9). The heuristic is pure
 * and exported so it's unit-testable on its own.
 */

export const TAXONOMY = [
	'meme', // generic internet meme
	'news_meme', // riffs on a current news story / event
	'culture', // a cultural moment or trend
	'community', // community / social / fan token
	'animal', // animal-themed (dog, cat, frog, …)
	'celebrity', // a person / celebrity
	'political', // politics / elections / policy
	'tech', // technology, AI, infra, DeFi, tooling
	'utility', // a coin with a stated product/use
	'other',
];

const KEYWORDS = {
	animal: ['dog', 'doge', 'shib', 'inu', 'cat', 'kitty', 'pepe', 'frog', 'toad', 'monkey', 'ape', 'bear', 'bull', 'hippo', 'penguin', 'duck', 'goat', 'wif', 'bonk', 'pup', 'hamster'],
	tech: ['ai', 'gpt', 'agent', 'protocol', 'network', 'chain', 'infra', 'zk', 'defi', 'swap', 'dex', 'oracle', 'data', 'compute', 'node', 'sdk', 'llm', 'model', 'bot', 'quant', 'rollup', 'layer', 'rwa', 'depin'],
	political: ['trump', 'biden', 'maga', 'election', 'president', 'senate', 'congress', 'putin', 'war', 'gov', 'policy', 'vote', 'kamala', 'potus'],
	community: ['dao', 'community', 'fam', 'gang', 'society', 'club', 'army', 'holders', 'fren', 'frens'],
	culture: ['meme', 'vibe', 'based', 'wagmi', 'gm', 'moon', 'lambo', 'degen', 'culture', 'trend', 'viral'],
	celebrity: ['elon', 'musk', 'kanye', 'taylor', 'drake', 'mrbeast', 'ronaldo', 'messi'],
};

const haystack = (coin) =>
	`${coin?.name || ''} ${coin?.symbol || ''} ${coin?.description || ''}`.toLowerCase();

/**
 * Keyword classifier. Pure, deterministic, no I/O. The fallback AND a useful
 * source of `tags` the LLM result is merged with.
 * @returns {{classification, confidence, tags, theme, source}}
 */
export function heuristicClassify(coin) {
	const text = haystack(coin);
	const tags = [];
	const hits = {};
	for (const [cat, words] of Object.entries(KEYWORDS)) {
		for (const w of words) {
			// word-boundary-ish: avoid 'ai' matching 'rain'.
			const re = new RegExp(`(^|[^a-z])${w}([^a-z]|$)`, 'i');
			if (re.test(text)) {
				hits[cat] = (hits[cat] || 0) + 1;
				tags.push(w);
			}
		}
	}
	const ranked = Object.entries(hits).sort((a, b) => b[1] - a[1]);
	let classification = 'meme';
	let confidence = 0.4;
	if (ranked.length) {
		classification = ranked[0][0];
		// culture keywords are weak meme-adjacent signals — only win if alone.
		if (classification === 'culture' && ranked.length > 1) classification = ranked[1][0];
		confidence = clamp(0.45 + ranked[0][1] * 0.1, 0.4, 0.7);
	}
	return {
		classification,
		confidence,
		tags: [...new Set(tags)].slice(0, 8),
		theme: ranked.length ? `${classification} signals: ${tags.slice(0, 3).join(', ')}` : 'unclassified meme',
		source: 'heuristic',
	};
}

const SYSTEM = `You classify newly-launched pump.fun (Solana) coins from their metadata. Reply with ONLY a compact JSON object, no markdown, no prose:
{"classification": <one of: ${TAXONOMY.join(', ')}>, "confidence": <0..1>, "tags": [<up to 6 short lowercase tags>], "theme": "<≤12 word description of the coin's angle>"}
Rules: "news_meme" = references a current real-world news story/event. "culture" = a broad cultural trend/moment. "community" = a fan/social/community token. "tech" = AI, infra, DeFi, or a real tool. "utility" = states a concrete product. Pick the single best fit; use "other" only if nothing fits.`;

/**
 * Classify a coin. Tries the LLM; falls back to the heuristic on any failure.
 * @param {{name,symbol,description,twitter,telegram,website}} coin
 * @param {{track?:object, timeoutMs?:number}} [opts]
 * @returns {Promise<{classification,confidence,tags,theme,source,model}>}
 */
export async function classifyCoin(coin, opts = {}) {
	const base = heuristicClassify(coin);
	try {
		const { llmComplete } = await import('../../api/_lib/llm.js');
		const user = JSON.stringify({
			name: coin?.name || null,
			symbol: coin?.symbol || null,
			description: (coin?.description || '').slice(0, 600) || null,
			has_twitter: !!coin?.twitter,
			has_telegram: !!coin?.telegram,
			has_website: !!coin?.website,
		});
		const res = await llmComplete({
			system: SYSTEM,
			user,
			maxTokens: 200,
			timeoutMs: opts.timeoutMs ?? 12_000,
			track: { tool: 'coin-intel-classify', ...(opts.track || {}) },
		});
		const parsed = parseJson(res.text);
		if (parsed && TAXONOMY.includes(parsed.classification)) {
			const tags = Array.isArray(parsed.tags) ? parsed.tags : [];
			return {
				classification: parsed.classification,
				confidence: clamp(Number(parsed.confidence), 0, 1) || 0.6,
				// union the model's tags with the heuristic's keyword hits.
				tags: [...new Set([...tags, ...base.tags].map((t) => String(t).toLowerCase().slice(0, 24)))].slice(0, 8),
				theme: String(parsed.theme || base.theme).slice(0, 120),
				source: `llm:${res.provider}`,
				model: res.model,
			};
		}
	} catch {
		// fall through to heuristic — never throw out of classify.
	}
	return { ...base, model: null };
}

function parseJson(text) {
	if (!text) return null;
	const m = String(text).match(/\{[\s\S]*\}/);
	if (!m) return null;
	try {
		return JSON.parse(m[0]);
	} catch {
		return null;
	}
}

function clamp(n, lo, hi) {
	const x = Number(n);
	if (!Number.isFinite(x)) return lo;
	return Math.max(lo, Math.min(hi, x));
}
