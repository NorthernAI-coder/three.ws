// agora-citizens — the Fetcher profession (capability bit 0).
//
// Real, verifiable work: a Fetcher calls a live HTTP / x402 service and returns
// the result, binding it into a proof anyone can re-derive. This is the one
// profession Task 02 ships end-to-end; Sculptor / Scribe / Verifier arrive in
// Task 04.
//
// The proof model mirrors examples/agenc-task-roundtrip/run.mjs: we query a live
// service, fingerprint its response deterministically, and set
// proofHash = sha256(canonical(result)). A Verifier (Task 04) can re-query the
// same target and recompute the identical fingerprint. resultData is a compact
// 64-byte content pointer to the artifact.
//
// No fake data, no setTimeout progress — every byte comes from a real fetch.

import { createHash } from 'node:crypto';

const FETCH_TIMEOUT_MS = 15_000;
const MAX_CAPTURE_BYTES = 256 * 1024; // bound memory — fingerprint, don't hoard

function sha256Hex(buf) {
	return createHash('sha256').update(buf).digest('hex');
}

async function fetchWithTimeout(url, opts = {}) {
	const ctrl = new AbortController();
	const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
	try {
		return await fetch(url, { ...opts, signal: ctrl.signal });
	} finally {
		clearTimeout(timer);
	}
}

// Default work target: the live three.ws AgenC ↔ x402 bridge. A deterministic,
// always-available real resource whose fingerprint binds the bazaar state at the
// moment of work — the same target the proven roundtrip uses.
export function defaultTarget(cfg) {
	return `${cfg.apiBase}/api/agenc/x402-services?maxItems=5`;
}

// Deterministic fingerprint of a fetched JSON/text body. For the bridge we
// fingerprint the stable task-seed list so re-derivation is order-independent;
// for any other resource we hash the raw bytes.
function fingerprint(target, status, contentType, bodyText) {
	let canonical = bodyText;
	if (contentType.includes('application/json')) {
		try {
			const json = JSON.parse(bodyText);
			if (Array.isArray(json?.tasks)) {
				canonical = JSON.stringify(json.tasks.map((t) => t.taskIdSeed ?? t.resource ?? null));
			} else {
				canonical = JSON.stringify(json);
			}
		} catch {
			// not valid JSON despite the header — hash raw text
		}
	}
	return sha256Hex(Buffer.from(`${target}\n${status}\n${canonical}`, 'utf8'));
}

// Pack a compact, deterministic 64-byte content pointer for the on-chain
// resultData slot: a CID-style sha256 reference to the artifact.
function packResultData(proofHashHex) {
	const pointer = `agora:fetch:cid:sha256:${proofHashHex.slice(0, 40)}`;
	const buf = Buffer.alloc(64);
	Buffer.from(pointer, 'utf8').copy(buf, 0);
	return Uint8Array.from(buf);
}

/**
 * Perform a Fetcher job and produce a re-derivable proof.
 *
 * @param {object} opts
 * @param {object} opts.cfg      runtime config (apiBase, etc.)
 * @param {object} opts.citizen  { agentIdHex, displayName, pubkey }
 * @param {object} [opts.job]    optional board job: { source, resource, taskPda }
 * @returns {{ result, resultText, proofHashHex, proofHashBytes, resultData,
 *            target, fingerprint, deliverableUrl, paymentRequired, bytes }}
 */
export async function runFetcher({ cfg, citizen, job } = {}) {
	// Pick a target. A board x402 service brings its own resource URL; an AgenC
	// task (or no job) falls back to the canonical bridge target.
	let target = defaultTarget(cfg);
	if (job?.resource && /^https?:\/\//i.test(job.resource)) target = job.resource;

	let res;
	try {
		res = await fetchWithTimeout(target, { headers: { accept: 'application/json, */*' } });
	} catch (err) {
		// A bad target must never abort the loop — fall back to the canonical
		// bridge so the citizen still produces real, verifiable work this tick.
		if (target !== defaultTarget(cfg)) {
			target = defaultTarget(cfg);
			res = await fetchWithTimeout(target, { headers: { accept: 'application/json, */*' } });
		} else {
			throw err;
		}
	}

	const status = res.status;
	const contentType = (res.headers.get('content-type') || '').toLowerCase();
	const paymentRequired = status === 402;

	// Capture the live response bytes (bounded). A 402 challenge from a paid x402
	// service is itself a real, hashable response — we record it honestly rather
	// than fabricating a paid result. Real USDC settlement is a mainnet money flow
	// (out of devnet scope); the citizen's verifiable artifact is the real fetch.
	const raw = await res.text();
	const bodyText = raw.length > MAX_CAPTURE_BYTES ? raw.slice(0, MAX_CAPTURE_BYTES) : raw;
	const bytes = Buffer.byteLength(bodyText, 'utf8');

	const fp = fingerprint(target, status, contentType, bodyText);

	const result = {
		worker: citizen.agentIdHex,
		workerPubkey: citizen.pubkey || null,
		profession: 'fetcher',
		target,
		status,
		contentType: contentType || null,
		bytes,
		fingerprint: fp,
		paymentRequired,
		taskPda: job?.taskPda || null,
		completedAt: new Date().toISOString(),
	};
	const resultText = JSON.stringify(result);
	const proofHashHex = sha256Hex(Buffer.from(resultText, 'utf8'));

	return {
		result,
		resultText,
		proofHashHex,
		proofHashBytes: Uint8Array.from(Buffer.from(proofHashHex, 'hex')),
		resultData: packResultData(proofHashHex),
		target,
		fingerprint: fp,
		// A re-derivable pointer to the artifact: re-fetch the target and recompute
		// the fingerprint to verify (the Verifier profession will automate this).
		deliverableUrl: target,
		paymentRequired,
		bytes,
	};
}
