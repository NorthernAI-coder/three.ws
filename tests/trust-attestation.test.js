import { describe, it, expect } from 'vitest';
import {
	canonicalize,
	sha256Hex,
	buildReceipt,
	computeReceiptHash,
	verifyChain,
	createSigner,
	importVerifier,
	AttestationLedger,
	GENESIS,
} from '../src/trust/attestation.js';

const turn = (u, a) => ({ user: { text: u }, assistant: { text: a } });
const gov = { brain: 'ibm/granite-3-8b-instruct', guardian: 'ibm/granite-guardian-3-8b', flagged: false };

describe('canonicalize', () => {
	it('is stable regardless of key order', () => {
		expect(canonicalize({ b: 1, a: 2 })).toBe(canonicalize({ a: 2, b: 1 }));
	});
	it('drops undefined values and handles nesting + arrays', () => {
		expect(canonicalize({ a: undefined, b: [3, { y: 1, x: 2 }] })).toBe('{"b":[3,{"x":2,"y":1}]}');
	});
});

describe('sha256Hex', () => {
	it('matches the known SHA-256 of "abc"', async () => {
		expect(await sha256Hex('abc')).toBe(
			'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
		);
	});
});

describe('receipt + chain', () => {
	async function buildChain() {
		const r0 = await buildReceipt({ seq: 0, prevHash: GENESIS, ts: '2026-06-03T00:00:00Z', turn: turn('hi', 'hello'), governance: gov });
		const r1 = await buildReceipt({ seq: 1, prevHash: r0.hash, ts: '2026-06-03T00:01:00Z', turn: turn('ok', 'sure'), governance: gov });
		return [r0, r1];
	}

	it('builds receipts whose hash is reproducible', async () => {
		const [r0] = await buildChain();
		expect(r0.hash).toBe(await computeReceiptHash(r0));
		expect(r0.prevHash).toBe(GENESIS);
	});

	it('verifies an untampered chain', async () => {
		const chain = await buildChain();
		const res = await verifyChain(chain);
		expect(res.valid).toBe(true);
		expect(res.length).toBe(2);
		expect(res.head).toBe(chain[1].hash);
	});

	it('detects content tampering at the exact receipt', async () => {
		const chain = await buildChain();
		chain[1].turn.assistant.text = 'malicious edit';
		const res = await verifyChain(chain);
		expect(res.valid).toBe(false);
		expect(res.brokenAt).toBe(1);
		expect(res.reason).toMatch(/altered content/);
	});

	it('detects a broken hash link', async () => {
		const chain = await buildChain();
		chain[1].prevHash = GENESIS; // unlink from r0
		const res = await verifyChain(chain);
		expect(res.valid).toBe(false);
		expect(res.brokenAt).toBe(1);
		expect(res.reason).toMatch(/broken link/);
	});

	it('detects a re-ordered / re-indexed receipt', async () => {
		const chain = await buildChain();
		chain[1].seq = 5;
		const res = await verifyChain(chain);
		expect(res.valid).toBe(false);
		expect(res.reason).toMatch(/sequence mismatch/);
	});
});

describe('signing', () => {
	it('signs receipt hashes and verifies them with the published public key', async () => {
		const signer = await createSigner();
		expect(['Ed25519', 'ECDSA-P256']).toContain(signer.alg);
		const r0 = await buildReceipt({ seq: 0, prevHash: GENESIS, ts: 't', turn: turn('a', 'b'), governance: gov });
		const sig = await signer.sign(r0.hash);

		const verifier = await importVerifier({ alg: signer.alg, publicKeyHex: signer.publicKeyHex });
		expect(await verifier.verify(r0.hash, sig)).toBe(true);
		// A different hash must not verify under the same signature.
		const other = await sha256Hex('different');
		expect(await verifier.verify(other, sig)).toBe(false);
	});
});

describe('AttestationLedger', () => {
	it('appends signed turns, verifies, and exports a portable document', async () => {
		const ledger = new AttestationLedger();
		await ledger.init();
		await ledger.append({ ts: 't0', turn: turn('hi', 'hello'), governance: gov });
		await ledger.append({ ts: 't1', turn: turn('more', 'sure'), governance: gov });

		const res = await ledger.verify();
		expect(res.valid).toBe(true);
		expect(res.signed).toBe(true);
		expect(res.length).toBe(2);

		const doc = ledger.export();
		expect(doc.count).toBe(2);
		expect(doc.publicKey).toBeTruthy();
		expect(doc.head).toBe(ledger.head);
		// The exported chain verifies on its own (as a fresh verifier would).
		const independent = await verifyChain(doc.receipts, { alg: doc.alg, publicKeyHex: doc.publicKey });
		expect(independent.valid).toBe(true);
	});

	it('fails verification if a signed receipt is tampered after sealing', async () => {
		const ledger = new AttestationLedger();
		await ledger.init();
		await ledger.append({ ts: 't0', turn: turn('hi', 'hello'), governance: gov });
		ledger.receipts[0].turn.user.text = 'rewritten';
		const res = await ledger.verify();
		expect(res.valid).toBe(false);
	});
});
