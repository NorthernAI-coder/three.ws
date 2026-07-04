// executor-web3 — duplicate-broadcast safety.
//
// Found live on 2026-07-03: a degraded RPC made confirmTransaction throw
// "blockheight exceeded" for buys that actually landed; the retry loop then
// broadcast fresh-blockhash duplicates (3 landed buys for one order) and the
// caller recorded the position as failed — orphaned tokens. These tests pin the
// contract: never resend while a prior attempt can still land, return the
// landed signature instead of resending, and surface ambiguity honestly.
import { describe, it, expect } from 'vitest';
import { Keypair } from '@solana/web3.js';
import { createWeb3Executor } from '../src/adapters/solana/executor-web3.js';

const payer = Keypair.generate();
const BLOCKHASH = Keypair.generate().publicKey.toBase58();

function mockConnection({ sigs, confirmErrors, statuses, blockHeight }) {
	let sendCount = 0;
	const calls = { send: 0, statuses: 0 };
	return {
		calls,
		async getLatestBlockhash() { return { blockhash: BLOCKHASH, lastValidBlockHeight: 100 }; },
		async sendRawTransaction() { calls.send++; return sigs[Math.min(sendCount++, sigs.length - 1)]; },
		async confirmTransaction({ signature }) {
			const err = confirmErrors[signature];
			if (err) throw Object.assign(new Error(err), { name: err });
			return { value: { err: null } };
		},
		async getSignatureStatuses(query) {
			calls.statuses++;
			return { value: query.map((sig) => statuses(sig)) };
		},
		async getBlockHeight() { return typeof blockHeight === 'function' ? blockHeight() : blockHeight; },
	};
}

const submitArgs = (connection) => ({ connection, payer, instructions: [], confirmTimeoutMs: 300 });

describe('createWeb3Executor duplicate-broadcast safety', () => {
	it('returns the landed signature instead of resending when confirm falsely reports expiry', async () => {
		const connection = mockConnection({
			sigs: ['SIG1', 'SIG2'],
			confirmErrors: { SIG1: 'TransactionExpiredBlockheightExceededError' },
			statuses: (sig) => (sig === 'SIG1' ? { err: null, confirmationStatus: 'confirmed', slot: 1 } : null),
			blockHeight: 50,
		});
		const exec = createWeb3Executor({ simulate: false, settleBudgetMs: 5_000 });
		const res = await exec.submit(submitArgs(connection));
		expect(res.signature).toBe('SIG1');
		expect(connection.calls.send).toBe(1); // never resent
	});

	it('resends only after the previous attempt provably died (blockhash expired, no status)', async () => {
		const connection = mockConnection({
			sigs: ['SIG1', 'SIG2'],
			confirmErrors: { SIG1: 'TransactionExpiredBlockheightExceededError' },
			statuses: () => null,       // SIG1 never lands
			blockHeight: 101,           // > lastValidBlockHeight → provably dead
		});
		const exec = createWeb3Executor({ simulate: false, settleBudgetMs: 5_000 });
		const res = await exec.submit(submitArgs(connection));
		expect(res.signature).toBe('SIG2');
		expect(connection.calls.send).toBe(2);
	});

	it('throws landing_ambiguous (with the sent signatures) while the attempt could still land', async () => {
		const connection = mockConnection({
			sigs: ['SIG1'],
			confirmErrors: { SIG1: 'TransactionExpiredBlockheightExceededError' },
			statuses: () => null,   // unknown
			blockHeight: 50,        // NOT expired — tx may still land
		});
		const exec = createWeb3Executor({ simulate: false, settleBudgetMs: 200 });
		await expect(exec.submit(submitArgs(connection))).rejects.toMatchObject({
			code: 'landing_ambiguous',
			sentSignatures: ['SIG1'],
		});
		expect(connection.calls.send).toBe(1); // ambiguity never triggers a resend
	});

	it('lands cleanly on the first attempt with a healthy RPC (no status sweeps needed)', async () => {
		const connection = mockConnection({ sigs: ['SIG1'], confirmErrors: {}, statuses: () => null, blockHeight: 50 });
		const exec = createWeb3Executor({ simulate: false });
		const res = await exec.submit(submitArgs(connection));
		expect(res.signature).toBe('SIG1');
		expect(res.attempts).toBe(1);
		expect(connection.calls.send).toBe(1);
	});
});
