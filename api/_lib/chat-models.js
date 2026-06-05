// Canonical chat model + provider defaults — the single source of truth shared
// by every LLM chat backend (api/chat.js, api/widgets, api/brain, ...).
//
// The platform default is OpenAI's GPT-OSS 120B served via OpenRouter's free
// tier — the exact model the /chat app uses (chat/src/stores.js) and the one
// we standardise on across every chat surface. Groq and OpenRouter free models
// are the no-sign-in tier; paid providers (OpenAI, Anthropic) sit behind keys.

/** OpenAI GPT-OSS 120B on OpenRouter, free tier. The platform-wide default. */
export const DEFAULT_FREE_MODEL = 'openai/gpt-oss-120b:free';

/** Default per-provider model when the caller doesn't name one. */
export const PROVIDER_MODEL_DEFAULTS = {
	anthropic: 'claude-sonnet-4-6',
	openrouter: DEFAULT_FREE_MODEL,
	groq: 'llama-3.3-70b-versatile',
	openai: 'gpt-4o-mini',
};

/**
 * Order to try providers in when none is explicitly requested ("auto").
 * Free-first: GPT-OSS 120B on OpenRouter, then Groq, then paid keys. Keeps the
 * unauthenticated/default experience on the free GPT-OSS model everywhere.
 */
export const DEFAULT_PROVIDER_ORDER = ['openrouter', 'groq', 'openai', 'anthropic'];

/**
 * OpenRouter sibling models for per-model rate-limit failover. OpenRouter's
 * `:free` tier rate-limits per model, so a GPT-OSS burst degrades to Llama then
 * Mistral (all free) before the chain moves to the next provider. GPT-OSS leads.
 */
export const OPENROUTER_SIBLINGS = [
	DEFAULT_FREE_MODEL,
	'meta-llama/llama-3.3-70b-instruct:free',
	'mistralai/mistral-7b-instruct:free',
];

/** Providers an anonymous (unauthenticated) caller may use — free tiers only. */
export const ANON_PROVIDER_LIST = ['openrouter', 'groq'];
