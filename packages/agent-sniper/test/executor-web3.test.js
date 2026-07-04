// executor-web3 — duplicate-broadcast safety.
//
// Found live on 2026-07-03 with real funds: a Jito bundle send returned/forwarded
// the tx on-chain but threw client-side while reading the response; the old code
// recorded the signature only from that (never-returned) value, so `sent` stayed
// empty and the standard-route fallback broadcast a DUPLICATE buy (two buys, one
// order — the second failed slippage, and the engine marked the position failed
// while the first buy's tokens sat orphaned in the wallet).
//
// The fix: the signature is derived from the SIGNED tx (bs58 of signatures[0],
// zero network I/O) and recorded BEFORE the network call, so a post-broadcast
// client error still resolves to the landed signature instead of a resend.
// These tests pin that contract by driving the real submit() with a mock
// connection and asserting on the count of distinct broadcasts.
import { describe, it, expect } from 'vitest';
import { Keypair, VersionedTransaction, TransactionMessage } from '@solana/web3.js';
import bs58 from 'bs58';
import { createWeb3Executor } from '../src/adapters/solana/executor-web3.js';

const payer = Keypair.generate();
const BLOCKHASH = bs58.encode(Keypair.generate().publicKey.toBytes());

// Derive the signature the executor WILL compute for a given broadcast attempt.
// It signs a fresh-blockhash tx each attempt; all our attempts share one mock
// blockhash, so every attempt yields the same signature — which is exactly the
// property that lets a landed attempt be recognised across a retry.
function expectedSig() {
	const msg = new TransactionMessage({ payerKey: payer.publicKey, recentBlockhash: BLOCKHASH, instructions: [] }).compileToV0Message();
	// The real tx also carries compute-budget ixs; the signature differs, so we
	// can't precompute it. Instead we capture it from the broadcast spy below.
	return null;
}

function mockConnection({ landOnBroadcast = true, confirmThrows = false, statusLanded, blockHeight = 50 }) {
	const broadcasts = []; // signatures actually sent to the network
	const conn = {
		broadcasts,
		async getLatestBlockhash() { return { blockhash: BLOCKHASH, lastValidBlockHeight: 100 }; },
		async simulateTransaction() { return { value: { err: null } }; },
		async sendRawTransaction(raw) {
			const tx = VersionedTransaction.deserialize(raw);
			const sig = bs58.encode(tx.signatures[0]);
			broadcasts.push(sig);
			if (!landOnBroadcast) throw new Error('socket hang up'); // sent on-chain, client threw
			return sig;
		},
		async confirmTransaction() {
			if (confirmThrows) throw Object.assign(new Error('TransactionExpiredBlockheightExceededError'), { name: 'TransactionExpiredBlockheightExceededError' });
			return { value: { err: null } };
		},
		async getSignatureStatuses(sigs) {
			return { value: sigs.map((s) => (statusLanded && statusLanded(s) ? { err: null, confirmationStatus: 'confirmed', slot: 1 } : null)) };
		},
		async getBlockHeight() { return typeof blockHeight === 'function' ? blockHeight() : blockHeight; },
	};
	return conn;
}

const submitArgs = (connection) => ({ connection, payer, instructions: [], confirmTimeoutMs: 300 });

describe('createWeb3Executor duplicate-broadcast safety', () => {
	it('clean happy path: one broadcast, returns its signature', async () => {
		const connection = mockConnection({ landOnBroadcast: true, confirmThrows: false });
		const exec = createWeb3Executor({ simulate: true });
		const res = await exec.submit(submitArgs(connection));
		expect(connection.broadcasts.length).toBe(1);
		expect(res.signature).toBe(connection.broadcasts[0]);
		expect(res.attempts).toBe(1);
	});

	it('send throws AFTER on-chain landing → no duplicate, returns the landed signature', async () => {
		// sendRawTransaction records the broadcast then throws (the real Jito/RPC
		// post-forward failure). The tx is "landed" per status. The executor must
		// recognise it and NOT broadcast again.
		const connection = mockConnection({
			landOnBroadcast: false,
			statusLanded: (sig) => connection.broadcasts.includes(sig), // whatever was sent, landed
			blockHeight: 50,
		});
		const exec = createWeb3Executor({ simulate: true, settleBudgetMs: 5_000 });
		const res = await exec.submit(submitArgs(connection));
		expect(connection.broadcasts.length).toBe(1);      // exactly one broadcast, no dup
		expect(res.signature).toBe(connection.broadcasts[0]);
	});

	it('confirm falsely reports expiry but the tx landed → returns it, no resend', async () => {
		const connection = mockConnection({
			landOnBroadcast: true,
			confirmThrows: true,
			statusLanded: (sig) => connection.broadcasts.includes(sig),
			blockHeight: 50,
		});
		const exec = createWeb3Executor({ simulate: true, settleBudgetMs: 5_000 });
		const res = await exec.submit(submitArgs(connection));
		expect(connection.broadcasts.length).toBe(1);
		expect(res.signature).toBe(connection.broadcasts[0]);
	});

	it('provably dead (blockhash expired, never landed) → one resend, then succeeds', async () => {
		let heights = [50, 50, 101, 101, 101]; let i = 0;
		const landedSet = new Set();
		const connection = mockConnection({ landOnBroadcast: true, confirmThrows: true });
		// first broadcast never lands; after it's declared dead the resend lands.
		connection.getBlockHeight = async () => heights[Math.min(i++, heights.length - 1)];
		connection.getSignatureStatuses = async (sigs) => ({ value: sigs.map((s) => (landedSet.has(s) ? { err: null, confirmationStatus: 'confirmed', slot: 2 } : null)) });
		connection.confirmTransaction = async () => { throw Object.assign(new Error('expired'), { name: 'TransactionExpiredBlockheightExceededError' }); };
		let sends = 0;
		const realSend = connection.sendRawTransaction.bind(connection);
		connection.sendRawTransaction = async (raw) => {
			const sig = await realSend(raw);
			if (++sends >= 2) landedSet.add(sig); // the second attempt lands
			return sig;
		};
		const exec = createWeb3Executor({ simulate: true, settleBudgetMs: 4_000, maxAttempts: 3 });
		const res = await exec.submit(submitArgs(connection));
		expect(sends).toBe(2);
		expect(res.signature).toBe(connection.broadcasts[1]);
	});

	it('landing ambiguous (unknown, not expired) → throws with the sent signatures, never resends', async () => {
		const connection = mockConnection({
			landOnBroadcast: true,
			confirmThrows: true,
			statusLanded: () => false, // never confirmed
			blockHeight: 50,           // never expired → in-flight forever within budget
		});
		const exec = createWeb3Executor({ simulate: true, settleBudgetMs: 200 });
		await expect(exec.submit(submitArgs(connection))).rejects.toMatchObject({ code: 'landing_ambiguous' });
		expect(connection.broadcasts.length).toBe(1); // ambiguity never triggers a resend
	});
});
