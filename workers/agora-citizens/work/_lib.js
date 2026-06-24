// Shared plumbing for the Agora profession WORK modules (docs/agora.md § Professions).
//
// Every profession module is a pluggable unit with one job: take a claimed task
// and produce a REAL artifact plus a proof that binds it. The proof is always
// `sha256(canonical bytes of the deliverable)` — the exact bytes served at the
// deliverable URL — so any Verifier (or the UI's Verify button) can re-download
// and re-derive the identical 32-byte hash. This file is where that invariant
// lives: one sha256, one canonical-JSON encoder, one deliverable store, one set
// of HTTP helpers against the real three.ws API. No mocks, no placeholders.

import { createHash } from 'node:crypto';

// The real API origin every skill calls. Override for a local/staging deploy via
// THREE_WS_BASE_URL; the SDK family resolves the same way (packages/*/src/http.js).
export const BASE_URL = String(process.env.THREE_WS_BASE_URL || 'https://three.ws').replace(/\/+$/, '');

// ── Proof ────────────────────────────────────────────────────────────────────

/** The one true proof primitive: sha256(bytes) → 32-byte Buffer. */
export function sha256(bytes) {
	return createHash('sha256').update(bytes).digest();
}

/** Lowercase hex of a byte buffer (64 chars for a 32-byte proof). */
export function toHex(buf) {
	return Buffer.from(buf).toString('hex');
}

// Deterministic JSON encoder — keys sorted at every level — so a producer and a
// Verifier on different machines hash byte-identical bytes for the same object.
function stableStringify(value) {
	if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
	if (value && typeof value === 'object') {
		return `{${Object.keys(value)
			.sort()
			.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`)
			.join(',')}}`;
	}
	return JSON.stringify(value === undefined ? null : value);
}

/** Canonical UTF-8 bytes of a JSON deliverable — what we both store AND hash. */
export function canonicalJsonBytes(obj) {
	return Buffer.from(stableStringify(obj), 'utf8');
}

/** A ≤64-byte on-chain pointer (resultData) — a short URL / CID, UTF-8, truncated. */
export function pointer64(str) {
	return Buffer.from(String(str ?? ''), 'utf8').subarray(0, 64);
}

/** Best work prompt from a task, across the board's AgenC and x402 task shapes. */
export function taskPrompt(task) {
	return String(task?.prompt || task?.title || task?.description || task?.resource || '').trim();
}

// ── Deliverable storage (R2) ──────────────────────────────────────────────────

// Store the exact deliverable bytes in our bucket and return their public URL —
// the verifiable supply chain's anchor. R2 is loaded lazily so the profession
// modules import without the S3 SDK / credentials present (work-only dev runs,
// tests). When R2 is unconfigured AND the bytes already live at a durable source
// URL (e.g. forge's hosted GLB), we fall back to that URL: still real, still
// re-downloadable, still hashes to the same proof. With no durable source and no
// R2, that is a real failure — never a fabricated link.
export async function storeDeliverable({ profession, ext, contentType, bytes, sourceUrl = null }) {
	const digest = toHex(sha256(bytes));
	const key = `agora/deliverables/${profession}/${digest}.${ext}`;
	try {
		const { putObject, publicUrl } = await import('../../../api/_lib/r2.js');
		await putObject({ key, body: bytes, contentType });
		return { url: publicUrl(key), key, digest, stored: true };
	} catch (err) {
		if (sourceUrl) return { url: sourceUrl, key: null, digest, stored: false, storeError: err?.message };
		throw new Error(
			`deliverable storage unavailable — configure S3_*/R2 env or supply a durable source URL (${err?.message || err})`,
		);
	}
}

// ── Real HTTP against the three.ws API ────────────────────────────────────────

/** GET/POST a JSON endpoint; throws a typed error (with .status/.code) on non-2xx. */
export async function httpJson(path, { method = 'GET', body, headers, query, signal } = {}) {
	const url = new URL(path.startsWith('http') ? path : `${BASE_URL}${path}`);
	if (query) for (const [k, v] of Object.entries(query)) if (v != null && v !== '') url.searchParams.set(k, String(v));
	const res = await fetch(url, {
		method,
		headers: {
			accept: 'application/json',
			...(body !== undefined ? { 'content-type': 'application/json' } : {}),
			...(headers || {}),
		},
		body: body !== undefined ? JSON.stringify(body) : undefined,
		signal,
	});
	const text = await res.text();
	let data;
	try {
		data = text ? JSON.parse(text) : {};
	} catch {
		data = { raw: text };
	}
	if (!res.ok) {
		const err = new Error(data?.message || data?.error || `HTTP ${res.status} ${path}`);
		err.status = res.status;
		err.code = data?.error || `http_${res.status}`;
		err.body = data;
		throw err;
	}
	return data;
}

/** Fetch raw bytes (binary deliverables, re-downloads); throws on non-2xx. */
export async function httpBytes(path, { method = 'GET', body, headers, signal } = {}) {
	const url = path.startsWith('http') ? path : `${BASE_URL}${path}`;
	const res = await fetch(url, {
		method,
		headers: headers || {},
		body: body !== undefined ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
		signal,
	});
	if (!res.ok) {
		const peek = await res.text().catch(() => '');
		const err = new Error(`HTTP ${res.status} ${url}: ${peek.slice(0, 200)}`);
		err.status = res.status;
		throw err;
	}
	const bytes = Buffer.from(await res.arrayBuffer());
	return { bytes, contentType: res.headers.get('content-type'), headers: res.headers };
}

// POST /api/brain/chat streams Server-Sent Events; a deliverable is one payload,
// so we consume the whole stream and collapse the text deltas into a single
// reply (mirrors the brain-mcp client's protocol). Free open-weight tiers
// (gpt-oss-120b) need no key; paid flagships read THREE_WS_API_KEY if present.
export async function brainChat({ provider = 'gpt-oss-120b', system, messages, maxTokens, signal } = {}) {
	const body = { provider, messages };
	if (system) body.system = system;
	if (Number.isFinite(maxTokens)) body.maxTokens = Math.trunc(maxTokens);

	const res = await fetch(`${BASE_URL}/api/brain/chat`, {
		method: 'POST',
		headers: {
			accept: 'text/event-stream',
			'content-type': 'application/json',
			...(process.env.THREE_WS_API_KEY ? { authorization: `Bearer ${process.env.THREE_WS_API_KEY}` } : {}),
		},
		body: JSON.stringify(body),
		signal,
	});

	// A rejected request (unknown provider, rate limit, sign-in required) returns
	// JSON, not SSE — surface it as a real error.
	if (!res.ok || !res.body) {
		const raw = await res.text().catch(() => '');
		let data;
		try {
			data = raw ? JSON.parse(raw) : {};
		} catch {
			data = { raw };
		}
		const err = new Error(data?.message || data?.error || `brain HTTP ${res.status}`);
		err.status = res.status;
		throw err;
	}

	const reader = res.body.getReader();
	const decoder = new TextDecoder();
	let buf = '';
	let text = '';
	let meta = null;
	let usage = null;

	const handle = (event, data) => {
		if (!data || data === '[DONE]') return;
		if (!event || event === 'message') {
			try {
				const piece = JSON.parse(data);
				if (typeof piece === 'string') text += piece;
			} catch {
				/* non-JSON keepalive */
			}
			return;
		}
		if (event === 'meta') {
			try {
				meta = JSON.parse(data);
			} catch {
				/* ignore */
			}
		} else if (event === 'done') {
			try {
				usage = JSON.parse(data)?.usage ?? usage;
			} catch {
				/* ignore */
			}
		} else if (event === 'error') {
			let message = 'brain stream error';
			try {
				message = JSON.parse(data)?.message || message;
			} catch {
				/* ignore */
			}
			throw new Error(message);
		}
	};

	for (;;) {
		const { value, done } = await reader.read();
		if (done) break;
		buf += decoder.decode(value, { stream: true });
		let idx;
		while ((idx = buf.indexOf('\n\n')) !== -1) {
			const frame = buf.slice(0, idx);
			buf = buf.slice(idx + 2);
			let event = null;
			const dataLines = [];
			for (const line of frame.split('\n')) {
				if (line.startsWith('event:')) event = line.slice(6).trim();
				else if (line.startsWith('data:')) dataLines.push(line.slice(5).replace(/^ /, ''));
			}
			handle(event, dataLines.join('\n'));
		}
	}

	return { text: text.trim(), meta, usage };
}
