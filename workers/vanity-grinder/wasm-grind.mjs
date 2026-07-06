// Self-contained WASM grind loop for the batch grinder container.
//
// Loads the same Rust/ed25519-dalek WASM engine the serverless grinder uses
// (src/solana/vanity/wasm), but grinds a target to COMPLETION (no wall-clock
// budget) — batch CPU has all the time it needs. First match wins; the caller
// (grind-worker.mjs, running in a worker_thread) posts the found keypair back to
// the main thread, which seals it before any write.
//
// The .wasm ships in the image next to this file (see Dockerfile COPY).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { initSync, grind } from './wasm/vanity_grinder.js';

const HERE = dirname(fileURLToPath(import.meta.url));

// Keypairs per WASM call. Big enough that per-call overhead is negligible, small
// enough that a SIGTERM (spot preemption) is observed within a fraction of a
// second between batches.
const BATCH_SIZE = 25_000;

let ready = false;
function ensureWasm() {
	if (ready) return;
	const bytes = readFileSync(join(HERE, 'wasm', 'vanity_grinder_bg.wasm'));
	initSync({ module: bytes });
	ready = true;
}

/**
 * Grind one target to completion.
 *
 * @param {object} target
 * @param {string} [target.prefix]
 * @param {string} [target.suffix]
 * @param {boolean} [target.ignoreCase]
 * @param {object} [opts]
 * @param {() => boolean} [opts.stopRequested] - return true to abort (preemption).
 * @param {(attempts:number)=>void} [opts.onProgress] - called each batch.
 * @returns {{ publicKey:string, secretKey:Uint8Array, attempts:number, durationMs:number } | null}
 *          null only if aborted before a match.
 */
export function grindToCompletion(target, opts = {}) {
	ensureWasm();
	const prefix = target.prefix || '';
	const suffix = target.suffix || '';
	const ignoreCase = !!target.ignoreCase;
	const { stopRequested, onProgress } = opts;

	const seed = new Uint8Array(32);
	const startedAt = performance.now();
	let attempts = 0;

	for (;;) {
		if (stopRequested && stopRequested()) return null;
		crypto.getRandomValues(seed);
		const hit = grind(prefix, suffix, ignoreCase, BATCH_SIZE, seed);
		attempts += BATCH_SIZE;
		if (onProgress) onProgress(attempts);
		if (hit) {
			return {
				publicKey: hit.publicKey,
				secretKey: Uint8Array.from(hit.secretKey),
				attempts,
				durationMs: performance.now() - startedAt,
			};
		}
	}
}
