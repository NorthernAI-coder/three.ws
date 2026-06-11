// Free anonymous-chat moderation pre-filter — NVIDIA NemoGuard, fail-open.
//
// Anonymous chat surfaces (the anon path in api/chat.js, public widget chat,
// and api/chat/proxy.js) carry untrusted, unattributable traffic on the host's
// free LLM keys. Rather than inherit a third-party provider's moderation gate
// (e.g. OpenRouter's 403 "requires moderation"), we run our OWN safety pass on
// the inbound user message with a free NVIDIA NIM safety classifier and refuse
// locally — keeping the downstream free model routes open and under our control.
//
// ── THE PRIME RULE IS FAIL-OPEN ──────────────────────────────────────────────
// Moderation is a FILTER, not a GATE: it must never take chat down. A timeout,
// an outage, a bad key, a non-200, an unparseable reply — ANY failure whatsoever
// proceeds UN-moderated. The only outcome that blocks a message is a successful,
// parsed "unsafe" verdict. Everything else returns { flagged: false } and chat
// continues exactly as if the filter weren't there.
//
// Scope: NemoGuard is a CONTENT-safety classifier (harm, self-harm, weapons,
// sexual content, …). It is NOT a jailbreak / prompt-injection detector — that,
// plus autonomous-send governance, stays with IBM Granite Guardian (the sendSol
// Trust Layer in granite-guardian.js). The two are complementary.
//
// Signed-in users are attributable and rate-limited, so only the anonymous
// surfaces call this. Probe + schema: tasks/nvidia-nim/probes/moderation.md

const NIM_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';

// nvidia/llama-3.1-nemoguard-8b-content-safety — JSON verdict + named
// categories, median ~340 ms on the free tier (see probe). Override via
// ANON_MODERATION_MODEL; the parser also understands the Llama-Guard
// `unsafe\nS#` text form, so meta/llama-guard-4-12b is a drop-in.
const DEFAULT_MODEL = 'nvidia/llama-3.1-nemoguard-8b-content-safety';

// Per-call abort budget. Probe median is ~340 ms with a ~680 ms tail; 2 s leaves
// generous headroom and still fails over fast when the lane stalls.
const DEFAULT_TIMEOUT_MS = 2000;
const MIN_TIMEOUT_MS = 250;
const MAX_TIMEOUT_MS = 8000;

// The classifier only needs the message itself; cap the slice we send so a giant
// pasted payload can't blow the latency budget. Matches the chat message limit.
const MAX_MODERATION_CHARS = 4000;

function clampTimeout(ms) {
	if (!Number.isFinite(ms) || ms <= 0) return DEFAULT_TIMEOUT_MS;
	return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, ms));
}

/**
 * Resolve the moderation config from the environment.
 *   enabled   — true iff a NIM key is present AND the kill-switch is not set.
 *   key       — NVIDIA_API_KEY (the free NIM lane), or null.
 *   model     — ANON_MODERATION_MODEL override, else the NemoGuard default.
 *   timeoutMs — ANON_MODERATION_TIMEOUT_MS override (clamped), else 2000.
 *
 * Kill switch: ANON_MODERATION_DISABLED=true turns the filter off without a code
 * change (mirrors the GUARDIAN_DISABLE convention). The filter is otherwise ON
 * whenever the free NIM key is configured.
 */
export function moderationConfig(env = process.env) {
	const key = env.NVIDIA_API_KEY || null;
	const disabled = String(env.ANON_MODERATION_DISABLED || '').toLowerCase() === 'true';
	return {
		enabled: !!key && !disabled,
		key,
		model: env.ANON_MODERATION_MODEL?.trim() || DEFAULT_MODEL,
		timeoutMs: clampTimeout(parseInt(env.ANON_MODERATION_TIMEOUT_MS || '', 10)),
	};
}

/** Whether the anonymous pre-filter is active for this deploy. */
export function moderationEnabled(env = process.env) {
	return moderationConfig(env).enabled;
}

/**
 * Parse a safety classifier's reply into { unsafe, categories }.
 * Accepts NemoGuard JSON ({"User Safety":"unsafe","Safety Categories":"…"}) and
 * the Llama-Guard text form ("unsafe\nS9" / "safe"). Anything unrecognized is
 * treated as SAFE (fail-open) — we never block on a reply we can't read.
 */
export function parseVerdict(content) {
	const raw = String(content ?? '').trim();
	if (!raw) return { unsafe: false, categories: [], parsed: false };

	// NemoGuard: clean JSON object (sometimes with a trailing space).
	try {
		const j = JSON.parse(raw);
		const us = String(j['User Safety'] ?? j.user_safety ?? '').toLowerCase();
		const cats = splitCategories(j['Safety Categories'] ?? j.safety_categories);
		if (us === 'unsafe') return { unsafe: true, categories: cats, parsed: true };
		if (us === 'safe') return { unsafe: false, categories: [], parsed: true };
	} catch {
		// not JSON — fall through to the text form
	}

	// Llama-Guard text form: first line "safe" | "unsafe", codes on line 2.
	const head = raw.toLowerCase();
	if (/^unsafe\b/.test(head)) {
		const codes = raw.split('\n').slice(1).join(' ').trim();
		return { unsafe: true, categories: codes ? [codes] : [], parsed: true };
	}
	if (/^safe\b/.test(head)) return { unsafe: false, categories: [], parsed: true };

	return { unsafe: false, categories: [], parsed: false };
}

function splitCategories(value) {
	return String(value ?? '')
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean);
}

/**
 * Pull the latest user message from an OpenAI-shaped messages array (used by the
 * proxy, which forwards a raw chat-completions body). Handles string and
 * multi-part content. Returns '' when there's nothing to moderate.
 */
export function lastUserMessage(messages) {
	if (!Array.isArray(messages)) return '';
	for (let i = messages.length - 1; i >= 0; i--) {
		const m = messages[i];
		if (!m || m.role !== 'user') continue;
		if (typeof m.content === 'string') return m.content;
		if (Array.isArray(m.content)) {
			return m.content
				.map((p) => (typeof p === 'string' ? p : p?.text || ''))
				.join(' ')
				.trim();
		}
	}
	return '';
}

/**
 * Moderate one anonymous user message. ALWAYS fail-open — see the file header.
 *
 * @returns {Promise<{
 *   checked: boolean,        // did a verdict actually come back?
 *   flagged: boolean,        // true ONLY on a parsed "unsafe" verdict
 *   categories?: string[],   // named risk categories when flagged
 *   model?: string,
 *   latencyMs?: number,
 *   error?: string,          // reason we failed open, when applicable
 * }>}
 */
export async function moderateAnonInput(message, opts = {}) {
	const cfg = opts.config || moderationConfig();
	if (!cfg.enabled || !cfg.key) return { checked: false, flagged: false };

	const text = String(message ?? '').trim();
	if (!text) return { checked: false, flagged: false };

	const started = Date.now();
	const ctrl = new AbortController();
	const timer = setTimeout(() => ctrl.abort(), cfg.timeoutMs);
	try {
		const res = await fetch(NIM_URL, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${cfg.key}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				model: cfg.model,
				messages: [{ role: 'user', content: text.slice(0, MAX_MODERATION_CHARS) }],
				max_tokens: 64,
				temperature: 0,
			}),
			signal: ctrl.signal,
		});
		const latencyMs = Date.now() - started;
		if (!res.ok) {
			// Non-200 (auth/billing/rate-limit/5xx) → fail open.
			return { checked: false, flagged: false, error: `moderation ${res.status}`, latencyMs };
		}
		const data = await res.json();
		const verdict = parseVerdict(data?.choices?.[0]?.message?.content);
		return {
			checked: verdict.parsed,
			flagged: verdict.unsafe,
			categories: verdict.categories,
			model: cfg.model,
			latencyMs,
		};
	} catch (err) {
		// Timeout (AbortError), network failure, JSON error — all fail open.
		return {
			checked: false,
			flagged: false,
			error: err?.name === 'AbortError' ? 'timeout' : err?.message || 'error',
			latencyMs: Date.now() - started,
		};
	} finally {
		clearTimeout(timer);
	}
}

/**
 * The in-band refusal for a blocked anonymous message. Short, on-brand, and
 * deliberately non-preachy — no lecture, no "as an AI", no policy recital. It
 * redirects the visitor to what the agent is actually for. Delivered as a normal
 * chat reply (SSE done/message event, or an OpenAI completion for the proxy) —
 * never an HTTP error.
 */
export function refusalReply() {
	return "I can't go there — that one's outside what I can help with. Ask me about three.ws, the 3D scene, or building and embedding an agent, and I'm all yours.";
}
