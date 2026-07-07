// @ts-check
// The Crypto Data API catalog assembler.
//
// Every endpoint in the free Crypto Data API bundle drops its OWN descriptor
// file in this directory (e.g. `token.js`, `holders.js`) and never edits a
// shared list, so parallel agents building sibling endpoints never collide.
// This module discovers whatever entry files exist at call time and merges
// their exported descriptors into one array — the single source of truth behind
// `GET /api/crypto` (the human/agent index) and `/api/crypto/openapi.json` (the
// machine-readable spec). Add an endpoint → it appears in both automatically.
//
// Why a runtime directory read instead of a hand-maintained barrel: a barrel
// would force every sibling prompt to edit one shared file, reintroducing the
// merge conflicts the per-file convention exists to avoid. Vercel's file tracer
// won't follow this dynamic `import()` on its own, so `api/crypto/index.js` and
// `api/crypto/openapi.js` pin `includeFiles: "api/_lib/crypto-catalog/**"` in
// vercel.json — that copies every entry file into the serverless bundle so the
// `readdir` below finds them in production exactly as it does in local dev and
// under vitest.
//
// Robustness contract (per the endpoint spec): a malformed or throwing entry is
// skipped and logged, never fatal. Zero entries is a valid state — the index
// returns an empty catalog, not an error.

import { readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));

// Files in this directory that are the machinery, not catalog entries. Anything
// starting with `_` or `.` is also treated as non-entry (private/hidden).
const NON_ENTRY = new Set(['index.js', 'openapi.js']);

const HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);

/**
 * A descriptor is usable iff it names a slug, an absolute path, and a real HTTP
 * method. Everything else is optional and defaulted in `normalize`.
 * @param {any} e
 */
function isValidEntry(e) {
	return Boolean(
		e &&
			typeof e === 'object' &&
			typeof e.slug === 'string' &&
			e.slug.trim() &&
			typeof e.path === 'string' &&
			e.path.startsWith('/') &&
			typeof e.method === 'string' &&
			HTTP_METHODS.has(e.method.toUpperCase()),
	);
}

/**
 * Coerce a raw descriptor into the stable public shape. Missing optional fields
 * become sensible defaults (never `undefined`, so the JSON shape is stable) and
 * unexpected extra keys are dropped so one entry can't pollute the catalog.
 *
 * Sibling endpoints converged on two spellings for their I/O contract, so both
 * are accepted: the JSON-Schema form (`inputSchema`/`outputSchema`, used by most
 * entries) and the terser param-map form (`input`/`output`). Either lands in the
 * canonical `inputSchema`/`outputSchema` fields; the OpenAPI generator handles
 * both representations. `methods` (an array) is honored for entries that answer
 * more than one verb (e.g. GET + POST), falling back to the single `method`.
 * @param {any} e
 */
function normalize(e) {
	const method = e.method.toUpperCase();
	const methods =
		Array.isArray(e.methods) && e.methods.length
			? [...new Set(e.methods.map((m) => String(m).toUpperCase()).filter((m) => HTTP_METHODS.has(m)))]
			: [method];
	return {
		slug: e.slug.trim(),
		method,
		methods: methods.includes(method) ? methods : [method, ...methods],
		path: e.path,
		title: typeof e.title === 'string' && e.title.trim() ? e.title.trim() : e.slug.trim(),
		summary: typeof e.summary === 'string' ? e.summary : '',
		inputSchema: pickObject(e.inputSchema ?? e.input),
		outputSchema: pickObject(e.outputSchema ?? e.output),
		example: e.example === undefined ? null : e.example,
	};
}

/** Return the value iff it's a non-null object, else null. */
function pickObject(v) {
	return v && typeof v === 'object' ? v : null;
}

// Per-directory cache. Keyed by resolved dir so the default (production) load is
// memoized across serverless invocations while tests pointing at fixture dirs
// each get their own slot. `fresh:true` bypasses it.
/** @type {Map<string, Array<ReturnType<typeof normalize>>>} */
const cache = new Map();

/**
 * Assemble the catalog by globbing entry files in `dir`.
 * @param {{ dir?: string, fresh?: boolean }} [opts]
 * @returns {Promise<Array<ReturnType<typeof normalize>>>}
 */
export async function loadCatalog({ dir = HERE, fresh = false } = {}) {
	if (!fresh && cache.has(dir)) return cache.get(dir);

	let files = [];
	try {
		files = readdirSync(dir).filter(
			(f) =>
				f.endsWith('.js') &&
				!NON_ENTRY.has(f) &&
				!f.startsWith('_') &&
				!f.startsWith('.') &&
				!f.endsWith('.test.js'),
		);
	} catch (err) {
		// Directory unreadable (shouldn't happen given includeFiles, but never
		// throw from the assembler — an empty catalog is a valid served state).
		console.warn(`[crypto-catalog] could not read entry dir ${dir}: ${err.message}`);
		cache.set(dir, []);
		return [];
	}

	/** @type {Array<ReturnType<typeof normalize>>} */
	const entries = [];
	const seen = new Set();

	for (const file of files.sort()) {
		try {
			// eslint-disable-next-line no-await-in-loop
			const mod = await import(pathToFileURL(join(dir, file)).href);
			const raw = mod.default ?? mod.entry ?? mod.catalogEntry;
			if (!isValidEntry(raw)) {
				console.warn(
					`[crypto-catalog] skipping ${file}: no valid descriptor export (need { slug, method, path })`,
				);
				continue;
			}
			const entry = normalize(raw);
			const key = `${entry.method} ${entry.path}`;
			if (seen.has(key)) {
				console.warn(`[crypto-catalog] skipping ${file}: duplicate route ${key}`);
				continue;
			}
			seen.add(key);
			entries.push(entry);
		} catch (err) {
			console.warn(`[crypto-catalog] skipping ${file}: ${err?.message || err}`);
		}
	}

	// Deterministic order so the index, the OpenAPI paths, and tests are stable.
	entries.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
	cache.set(dir, entries);
	return entries;
}

// Test/ops seam: drop a memoized directory so a fresh assembly re-reads disk.
export function clearCatalogCache() {
	cache.clear();
}
