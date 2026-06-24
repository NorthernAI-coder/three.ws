/**
 * Agora profession WORK modules — the proof contract (Task 04).
 *
 * The verifiable supply chain rests on one invariant: a producer's proofHash is
 * sha256 of the EXACT bytes served at its deliverable URL, so any Verifier can
 * re-download and re-derive the identical 32-byte hash. These tests pin that
 * invariant hermetically — no network — by:
 *   1. exercising the shared proof helpers (sha256, canonical JSON, resultData,
 *      the standard result builder), and
 *   2. driving the real runVerifier against `data:` deliverables whose bytes we
 *      control, asserting it re-derives a match and rejects a tampered proof.
 */

import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';

import {
	sha256Hex,
	canonicalJsonBytes,
	packResultData,
	proofBytesFromHex,
	buildWorkResult,
} from '../workers/agora-citizens/work/_skills.js';
import { runVerifier } from '../workers/agora-citizens/work/verifier.js';

const sha = (s) => createHash('sha256').update(s).digest('hex');
const dataUrl = (bytes, mime = 'application/octet-stream') =>
	`data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;

describe('proof helpers', () => {
	it('sha256Hex matches node crypto and is 64 hex chars', () => {
		const bytes = Buffer.from('hello agora', 'utf8');
		expect(sha256Hex(bytes)).toBe(sha(bytes));
		expect(sha256Hex(bytes)).toMatch(/^[0-9a-f]{64}$/);
	});

	it('canonical JSON is key-order independent', () => {
		const a = canonicalJsonBytes({ b: 1, a: { y: 2, x: 1 } });
		const b = canonicalJsonBytes({ a: { x: 1, y: 2 }, b: 1 });
		expect(a.equals(b)).toBe(true);
	});

	it('packResultData is exactly 64 bytes and truncates', () => {
		const rd = packResultData('agora:sculptor:cid:sha256:' + 'f'.repeat(40));
		expect(rd).toBeInstanceOf(Uint8Array);
		expect(rd.length).toBe(64);
		const huge = packResultData('x'.repeat(200));
		expect(huge.length).toBe(64);
	});

	it('proofBytesFromHex round-trips to 32 bytes', () => {
		const hex = sha('proof');
		const bytes = proofBytesFromHex(hex);
		expect(bytes.length).toBe(32);
		expect(Buffer.from(bytes).toString('hex')).toBe(hex);
	});
});

describe('buildWorkResult — the standard profession return', () => {
	it('binds proofHash to the exact deliverable bytes', () => {
		const bytes = Buffer.from('GLB-LIKE-BYTES', 'utf8');
		const out = buildWorkResult({
			profession: 'sculptor',
			citizen: { agentIdHex: 'ab'.repeat(32), pubkey: null },
			deliverableUrl: 'https://cdn.example/x.glb',
			deliverableBytes: bytes,
			summary: 'sculpted a thing',
		});
		expect(out.proofHashHex).toBe(sha(bytes));
		expect(Buffer.from(out.proofHashBytes).toString('hex')).toBe(out.proofHashHex);
		expect(out.proofHashBytes.length).toBe(32);
		expect(out.resultData.length).toBe(64);
		expect(out.deliverableUrl).toBe('https://cdn.example/x.glb');
		expect(JSON.parse(out.resultText).proofHash).toBe(out.proofHashHex);
	});
});

describe('runVerifier — re-derives a producer proof (the trust loop)', () => {
	const cfg = { apiBase: 'https://three.ws', log: () => {} };
	const citizen = { agentIdHex: 'cd'.repeat(32), displayName: 'Vera' };

	it('PASSES when the deliverable hashes to the claimed proof', async () => {
		const bytes = Buffer.from('a real, byte-stable deliverable', 'utf8');
		const proofHash = sha(bytes);
		const out = await runVerifier({
			cfg,
			citizen,
			job: { target: { deliverableUrl: dataUrl(bytes), proofHash, profession: 'sculptor' } },
		});
		expect(out.vouch.match).toBe(true);
		expect(out.vouch.verdict).toBe('pass');
		expect(out.vouch.recomputed).toBe(proofHash);
		// The attestation itself is a real, hashable artifact.
		expect(out.proofHashHex).toMatch(/^[0-9a-f]{64}$/);
	});

	it('FAILS (no false vouch) when the proof does not match the bytes', async () => {
		const bytes = Buffer.from('the genuine bytes', 'utf8');
		const tampered = sha('different bytes entirely');
		const out = await runVerifier({
			cfg,
			citizen,
			job: { target: { deliverableUrl: dataUrl(bytes), proofHash: tampered, profession: 'scribe' } },
		});
		expect(out.vouch.match).toBe(false);
		expect(out.vouch.verdict).toBe('fail');
		expect(out.vouch.recomputed).toBe(sha(bytes));
	});

	it('rejects a target with no valid 32-byte proofHash', async () => {
		await expect(
			runVerifier({ cfg, citizen, job: { target: { deliverableUrl: dataUrl(Buffer.from('x')), proofHash: 'nope' } } }),
		).rejects.toThrow(/valid 32-byte/);
	});
});
