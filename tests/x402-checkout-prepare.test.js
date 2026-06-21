import { describe, it, expect } from 'vitest';
import { PublicKey } from '@solana/web3.js';

import { acceptSchema, prepareSchema, ataExists } from '../api/x402-checkout.js';

// The 402 challenge's `accept` is built from operator env (X402_PAY_TO_SOLANA /
// X402_FEE_PAYER_SOLANA). Those values are pasted into dashboards and routinely
// carry a trailing newline. An untrimmed address makes prepare throw
// "Non-base58 character" inside `new PublicKey()` — an opaque 500 that took down
// every USDC checkout at the club door. The schema must trim it back to a valid
// address so the transaction still builds.
const PAY_TO = 'wwwwwDxFWRn7grgr3Esrsg5C6NvDoDHSA4gaCffccrU';
const FEE_PAYER = '2wKupLR9q6wXYppw8Gr2NvWxKBUqm4PPJKkQfoxHDBg4';
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const BUYER = 'wwwPqsM4N7T9J69tB82nLyzxqsH159j4orftLTQfUGV';

const challengeAccept = (overrides = {}) => ({
	scheme: 'exact',
	amount: '10000',
	maxTimeoutSeconds: 60,
	network: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
	payTo: PAY_TO,
	asset: USDC,
	extra: { name: 'USDC', decimals: 6, feePayer: FEE_PAYER },
	...overrides,
});

describe('x402-checkout acceptSchema — whitespace-tolerant addresses', () => {
	it('trims a trailing newline on payTo so PublicKey construction succeeds', () => {
		const accept = challengeAccept({ payTo: `${PAY_TO}\n` });
		const parsed = acceptSchema.parse(accept);
		expect(parsed.payTo).toBe(PAY_TO);
		// The exact call that 500'd in prepare before the trim landed.
		expect(() => new PublicKey(parsed.payTo)).not.toThrow();
	});

	it('trims whitespace on every address field (asset, feePayer)', () => {
		const accept = challengeAccept({
			asset: `  ${USDC}`,
			extra: { name: 'USDC', decimals: 6, feePayer: `${FEE_PAYER}\r\n` },
		});
		const parsed = acceptSchema.parse(accept);
		expect(parsed.asset).toBe(USDC);
		expect(parsed.extra.feePayer).toBe(FEE_PAYER);
	});

	it('still rejects an address that is malformed beyond whitespace', () => {
		expect(() => acceptSchema.parse(challengeAccept({ payTo: 'too-short' }))).toThrow();
	});
});

describe('x402-checkout prepareSchema', () => {
	it('trims the buyer address from the posted body', () => {
		const parsed = prepareSchema.parse({ accept: challengeAccept(), buyer: `${BUYER}\n` });
		expect(parsed.buyer).toBe(BUYER);
		expect(() => new PublicKey(parsed.buyer)).not.toThrow();
	});

	it('trims donation (tip) recipient addresses', () => {
		const parsed = prepareSchema.parse({
			accept: challengeAccept(),
			buyer: BUYER,
			tips: [{ to: `${USDC}\n`, amount: '1000' }],
		});
		expect(parsed.tips[0].to).toBe(USDC);
	});
});

describe('x402-checkout ataExists — fail-open on a flaky RPC', () => {
	const ata = new PublicKey('HgwbNyweQUiV5diWJ1a7ocxgzf3AYSLhTpphEYRLujtN');

	it('reports existing when the RPC returns account data', async () => {
		const conn = { getAccountInfo: async () => ({ data: Buffer.alloc(165), owner: ata }) };
		expect(await ataExists(conn, ata)).toBe(true);
	});

	it('reports missing when the RPC returns a clean null', async () => {
		const conn = { getAccountInfo: async () => null };
		expect(await ataExists(conn, ata)).toBe(false);
	});

	it('assumes missing (fail-open) when getAccountInfo throws StructError — the prepare-step 500 this guards', async () => {
		const conn = {
			getAccountInfo: async () => {
				throw new Error('failed to get info about account: StructError: Expected the value to satisfy a union');
			},
		};
		// Must NOT propagate — assuming-missing only adds an idempotent ATA-create,
		// safe whether or not the account exists.
		await expect(ataExists(conn, ata)).resolves.toBe(false);
	});
});
