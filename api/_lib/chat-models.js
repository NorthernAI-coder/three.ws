// Canonical chat model + provider routing — the single source of truth shared
// by every LLM chat backend (api/chat.js, api/widgets, api/brain, ...).
//
// Two design rules drive this file:
//
//   1. RELIABILITY-FIRST ORDERING. The fallback ladder leads with the model
//      that actually answers on the first attempt under current operating
//      conditions, not the cheapest model. Leading with rate-limited free
//      models meant the common path was "try 3-4 things that 429/404, then
//      finally succeed" — paying full fan-out latency and burning quota on
//      every turn. Free models are kept as *lower-priority* fallbacks.
//
//   2. CAPABILITY-AWARE ROUTING. Every model is annotated with what it can do
//      ({ tools, moderationGated }). The router consults MODEL_CATALOG and
//      skips models a request can't use (e.g. a tool-required request never
//      selects a non-tool model) instead of round-tripping to the provider to
//      discover the limitation at call time.
//
// Permanently-broken routes have been removed from the catalog rather than
// carried as dead weight (they would never succeed):
//   - mistralai/mistral-7b-instruct:free → OpenRouter 404 "No endpoints found"
//   - meta-llama/llama-3.2-3b-instruct:free → no tool-capable endpoint
//
// Operational note (ops must act): the OpenAI account is over quota
// ("You exceeded your current quota, please check your plan and billing"), so
// `openai` is intentionally ranked LAST — it is effectively a dead final tier
// until billing is topped up. Until then it only burns one wasted attempt at
// the very end of an already-exhausted chain. Top up OPENAI billing or remove
// the key to drop it from the ladder entirely.

/**
 * Capability metadata per chat model id — the routing brain. Only models
 * listed here are auto-selectable; the router uses these flags to avoid
 * calling a model a request can't use.
 *
 *   provider        — which upstream serves this model id
 *   tools           — exposes a tool/function-calling endpoint
 *   moderationGated — upstream intermittently refuses without a moderation /
 *                     data policy (OpenRouter 403 "requires moderation"). Such
 *                     models are excluded from auto-built fallback chains but
 *                     remain usable when a caller names them explicitly.
 */
export const MODEL_CATALOG = {
	// ── Anthropic (paid; host or BYOK key) — most reliable when keyed ──────────
	'claude-opus-4-7':            { provider: 'anthropic', tools: true },
	'claude-opus-4-6':            { provider: 'anthropic', tools: true },
	'claude-sonnet-4-6':          { provider: 'anthropic', tools: true },
	'claude-haiku-4-5-20251001':  { provider: 'anthropic', tools: true },

	// ── Groq free tier — fast (sub-second) and first-attempt-reliable ─────────
	'llama-3.3-70b-versatile':    { provider: 'groq', tools: true },
	'llama-3.1-8b-instant':       { provider: 'groq', tools: true },

	// ── OpenRouter free tier — rate-limited per model; tool support varies ────
	'meta-llama/llama-3.3-70b-instruct:free':     { provider: 'openrouter', tools: true },
	'nousresearch/hermes-3-llama-3.1-405b:free':  { provider: 'openrouter', tools: true },
	// GPT-OSS 120B is the historical platform default, but its free OpenRouter
	// endpoint is intermittently moderation-gated (403 "requires moderation on
	// OpenInference"). Kept usable for explicit callers (e.g. the /chat app), but
	// never auto-selected for the primary path or auto-built fallback chains.
	'openai/gpt-oss-120b:free':   { provider: 'openrouter', tools: true, moderationGated: true },

	// ── OpenAI (paid) — see operational note above; ranked last ───────────────
	'gpt-4o-mini':                { provider: 'openai', tools: true },
};

/** Whether a model exposes a tool/function-calling endpoint. Unknown → false. */
export function modelSupportsTools(modelId) {
	return MODEL_CATALOG[modelId]?.tools === true;
}

/** Whether a model's upstream is moderation-gated (excluded from auto chains). */
export function isModelModerationGated(modelId) {
	return MODEL_CATALOG[modelId]?.moderationGated === true;
}

/**
 * Filter a candidate model list down to those usable for a request.
 * @param {string[]} models     candidate model ids, in priority order
 * @param {object}   opts
 * @param {boolean}  opts.requireTools  drop models with no tool endpoint
 * @param {boolean}  opts.allowGated    keep moderation-gated models (default false)
 */
export function usableModels(models, { requireTools = false, allowGated = false } = {}) {
	return models.filter((m) => {
		const meta = MODEL_CATALOG[m];
		if (!meta) return false;
		if (requireTools && !meta.tools) return false;
		if (!allowGated && meta.moderationGated) return false;
		return true;
	});
}

/**
 * Default OpenRouter free model: the reliable, tool-capable Llama 3.3 70B free
 * endpoint. (Was GPT-OSS 120B, demoted for the moderation gate above.) Used as
 * the platform default wherever a free OpenRouter model is requested.
 */
export const DEFAULT_FREE_MODEL = 'meta-llama/llama-3.3-70b-instruct:free';

/** Default per-provider model when the caller doesn't name one. */
export const PROVIDER_MODEL_DEFAULTS = {
	anthropic: 'claude-sonnet-4-6',
	openrouter: DEFAULT_FREE_MODEL,
	groq: 'llama-3.3-70b-versatile',
	openai: 'gpt-4o-mini',
};

/**
 * Provider order to try when none is explicitly requested ("auto"), ranked by
 * first-attempt reliability under current operating conditions:
 *   1. anthropic  — paid, highly reliable, keyed in prod (host we-pay / BYOK).
 *                   Leads the ladder so the common path resolves on attempt 0
 *                   instead of burning the free tiers' rate limits first. Only
 *                   present when a key is configured; skipped otherwise, which
 *                   transparently falls back to the free-tier ordering below.
 *   2. groq       — fast free tier that answers on the first attempt. Per-minute
 *                   caps only; the primary for anonymous/free traffic.
 *   3. openrouter — free fallback (reliable Llama 3.3 70B; see DEFAULT_FREE_MODEL).
 *   4. openai     — LAST. Account is over quota (see operational note); only
 *                   reached after everything else is exhausted.
 * Providers without a configured key are skipped, so the effective ladder is
 * short in the common case. A provider in a health cooldown (see
 * api/_lib/provider-health.js) is also skipped for the cooldown window.
 */
export const DEFAULT_PROVIDER_ORDER = ['anthropic', 'groq', 'openrouter', 'openai'];

/**
 * OpenRouter sibling models for per-model rate-limit failover. OpenRouter's
 * `:free` tier rate-limits per model, so a burst on the primary free model
 * degrades to a sibling free model before the chain moves to the next provider.
 * All entries are tool-capable and non-gated (dead/gated routes removed).
 */
export const OPENROUTER_SIBLINGS = [
	DEFAULT_FREE_MODEL,
	'nousresearch/hermes-3-llama-3.1-405b:free',
];

/** Providers an anonymous (unauthenticated) caller may use — free tiers only. */
export const ANON_PROVIDER_LIST = ['groq', 'openrouter'];

/**
 * Bounds on the fallback chain so a single request can't churn through every
 * provider and still time out. The router stops failing over once either limit
 * is hit and returns a clean terminal error.
 *   MAX_FALLBACK_ATTEMPTS — hard cap on upstream attempts per request.
 *   TOTAL_BUDGET_MS       — wall-clock budget across all attempts (< the 60s
 *                           function limit, leaving headroom to stream a reply).
 *   PER_CALL_TIMEOUT_MS   — per-attempt abort ceiling. A single hung provider
 *                           must not consume the whole TOTAL_BUDGET_MS; we abort
 *                           the fetch at this bound (or the remaining budget,
 *                           whichever is smaller) and fail over to the next route.
 */
export const MAX_FALLBACK_ATTEMPTS = 3;
export const TOTAL_BUDGET_MS = 25_000;
export const PER_CALL_TIMEOUT_MS = 15_000;
