/**
 * confirmOrThrow — unit tests.
 *
 * Solana's `Connection.confirmTransaction` resolves normally for a transaction
 * that landed in a block but reverted during execution; the on-chain error is
 * carried in `result.value.err`, NOT thrown. Every server-signed money path
 * routes its confirmation through confirmOrThrow so a revert becomes a thrown
 * error the caller handles, instead of being silently recorded as confirmed.
 *
 * These tests exercise the helper against a fake Connection so no RPC is hit.
 */

import { describe, it, expect, vi } from 'vitest';
import { confirmOrThrow } from '../api/_lib/solana/confirm.js';

function fakeConn(value) {
	return {
		confirmTransaction: vi.fn().mockResolvedValue({ context: { slot: 1 }, value }),
	};
}

describe('confirmOrThrow', () => {
	it('returns the confirmation result for a successful tx (value.err === null)', async () => {
		const conn = fakeConn({ err: null });
		const out = await confirmOrThrow(conn, 'sig123', 'confirmed');
		expect(out.value.err).toBeNull();
		expect(conn.confirmTransaction).toHaveBeenCalledWith('sig123', 'confirmed');
	});

	it('throws when the tx landed but reverted (value.err set)', async () => {
		const conn = fakeConn({ err: { InstructionError: [0, { Custom: 6001 }] } });
		await expect(confirmOrThrow(conn, 'sigABC', 'confirmed')).rejects.toThrow(/reverted on-chain/);
	});

	it('tags the thrown error with code, signature, and the on-chain err', async () => {
		const onChainErr = { InstructionError: [1, 'ProgramFailedToComplete'] };
		const conn = fakeConn({ err: onChainErr });
		await expect(confirmOrThrow(conn, 'deadbeef', 'confirmed')).rejects.toMatchObject({
			code: 'tx_reverted',
			signature: 'deadbeef',
			onChainErr,
		});
	});

	it('extracts the signature from the object strategy form', async () => {
		const conn = fakeConn({ err: { foo: 'bar' } });
		await expect(
			confirmOrThrow(conn, { signature: 'objSig', blockhash: 'bh', lastValidBlockHeight: 9 }, 'confirmed'),
		).rejects.toMatchObject({ signature: 'objSig', code: 'tx_reverted' });
	});

	it('defaults the commitment to "confirmed"', async () => {
		const conn = fakeConn({ err: null });
		await confirmOrThrow(conn, 'sig');
		expect(conn.confirmTransaction).toHaveBeenCalledWith('sig', 'confirmed');
	});

	it('does not swallow a genuinely thrown RPC/timeout error', async () => {
		const conn = { confirmTransaction: vi.fn().mockRejectedValue(new Error('block height exceeded')) };
		await expect(confirmOrThrow(conn, 'sig')).rejects.toThrow(/block height exceeded/);
	});
});
