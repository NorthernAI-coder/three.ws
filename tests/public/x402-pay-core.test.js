// Unit tests for the paywall's wallet-payment core (public/x402-pay-core.js).
// Exercises the pure payment-building logic — the parts that can be verified
// without a real browser wallet: requirement normalization, resource-URL
// resolution, EIP-3009 typed-data construction, payload assembly, and encoding.
//
// Test fixtures use $THREE (the only coin) for Solana asset/payTo and a clearly
// synthetic 0x… address for EVM, per CLAUDE.md.

import { describe, it, expect } from 'vitest';
import {
	normalizeAccept,
	isSolanaNetwork,
	isEvmNetwork,
	isEip3009Accept,
	resolveResourceUrl,
	buildPrepareBody,
	buildEip3009TypedData,
	buildEvmPaymentPayload,
	b64encode,
	b64decode,
	base64ToUint8Array,
	uint8ArrayToBase64,
	explorerUrl,
	friendlyError,
} from '../../public/x402-pay-core.js';

const THREE_MINT = 'FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump';
const SYNTH_EVM = '0x0000000000000000000000000000000000000003';

const solanaAccept = {
	scheme: 'exact',
	network: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
	amount: '1000',
	asset: THREE_MINT,
	payTo: THREE_MINT,
	maxTimeoutSeconds: 60,
	resource: 'https://three.ws/api/x402/demo?x=1',
	extra: { name: 'USDC', decimals: 6, feePayer: THREE_MINT },
};

const baseAccept = {
	scheme: 'exact',
	network: 'eip155:8453',
	amount: '1000',
	asset: SYNTH_EVM,
	payTo: SYNTH_EVM,
	maxTimeoutSeconds: 600,
	extra: { name: 'USD Coin', version: '2', decimals: 6 },
};

describe('network detection', () => {
	it('classifies solana and evm networks', () => {
		expect(isSolanaNetwork(solanaAccept.network)).toBe(true);
		expect(isSolanaNetwork('solana')).toBe(true);
		expect(isSolanaNetwork(baseAccept.network)).toBe(false);
		expect(isEvmNetwork(baseAccept.network)).toBe(true);
		expect(isEvmNetwork(solanaAccept.network)).toBe(false);
	});

	it('only treats eip3009 (non-permit2) EVM entries as signable', () => {
		expect(isEip3009Accept(baseAccept)).toBe(true);
		expect(
			isEip3009Accept({
				...baseAccept,
				extra: { ...baseAccept.extra, assetTransferMethod: 'permit2' },
			}),
		).toBe(false);
		expect(isEip3009Accept(solanaAccept)).toBe(false);
	});
});

describe('normalizeAccept', () => {
	it('coerces maxAmountRequired into amount', () => {
		const out = normalizeAccept({ network: 'solana', maxAmountRequired: 2500 });
		expect(out.amount).toBe('2500');
	});

	it('leaves an existing amount untouched', () => {
		expect(normalizeAccept(solanaAccept)).toBe(solanaAccept);
	});
});

describe('resolveResourceUrl', () => {
	it('prefers the accept.resource URL', () => {
		expect(resolveResourceUrl(solanaAccept, '/ignored', 'https://three.ws')).toBe(
			'https://three.ws/api/x402/demo?x=1',
		);
	});

	it('falls back to the return URL made absolute against the origin', () => {
		expect(
			resolveResourceUrl({ network: 'solana' }, '/api/x402/paid?id=7', 'https://three.ws'),
		).toBe('https://three.ws/api/x402/paid?id=7');
	});

	it('degrades to the origin root when nothing is usable', () => {
		expect(resolveResourceUrl(null, null, 'https://three.ws')).toBe('https://three.ws/');
	});
});

describe('buildPrepareBody', () => {
	it('returns the normalized accept + buyer for /api/x402-checkout?action=prepare', () => {
		const body = buildPrepareBody(
			{ ...solanaAccept, amount: undefined, maxAmountRequired: '1000' },
			THREE_MINT,
		);
		expect(body.buyer).toBe(THREE_MINT);
		expect(body.accept.amount).toBe('1000');
		expect(body.accept.extra.feePayer).toBe(THREE_MINT);
	});
});

describe('buildEip3009TypedData', () => {
	it('builds deterministic transferWithAuthorization typed data', () => {
		const { typedData, authorization } = buildEip3009TypedData({
			accept: baseAccept,
			payerAddress: SYNTH_EVM,
			chainId: 8453,
			nowSeconds: 1_000,
			nonce: '0x' + 'ab'.repeat(32),
		});
		expect(typedData.primaryType).toBe('TransferWithAuthorization');
		expect(typedData.domain).toEqual({
			name: 'USD Coin',
			version: '2',
			chainId: 8453,
			verifyingContract: SYNTH_EVM,
		});
		expect(typedData.message.from).toBe(SYNTH_EVM);
		expect(typedData.message.to).toBe(baseAccept.payTo);
		expect(typedData.message.value).toBe('1000');
		expect(typedData.message.validAfter).toBe(0);
		// validBefore = now + maxTimeoutSeconds
		expect(typedData.message.validBefore).toBe(1_000 + 600);
		expect(authorization.nonce).toBe('0x' + 'ab'.repeat(32));
	});

	it('generates a random 32-byte nonce when none is supplied', () => {
		const a = buildEip3009TypedData({
			accept: baseAccept,
			payerAddress: SYNTH_EVM,
			chainId: 8453,
		});
		const b = buildEip3009TypedData({
			accept: baseAccept,
			payerAddress: SYNTH_EVM,
			chainId: 8453,
		});
		expect(a.authorization.nonce).toMatch(/^0x[0-9a-f]{64}$/);
		expect(a.authorization.nonce).not.toBe(b.authorization.nonce);
	});
});

describe('buildEvmPaymentPayload', () => {
	it('wraps the signature + authorization into an x402 v2 payload', () => {
		const payload = buildEvmPaymentPayload({
			accept: baseAccept,
			signature: '0xdead',
			authorization: { from: SYNTH_EVM, to: baseAccept.payTo, value: '1000' },
			resourceUrl: 'https://three.ws/api/paid',
		});
		expect(payload.x402Version).toBe(2);
		expect(payload.scheme).toBe('exact');
		expect(payload.network).toBe('eip155:8453');
		expect(payload.resource.url).toBe('https://three.ws/api/paid');
		expect(payload.accepted).toBe(baseAccept);
		expect(payload.payload.signature).toBe('0xdead');
	});
});

describe('encoding helpers', () => {
	it('round-trips JSON through base64', () => {
		const obj = { a: 1, b: 'x402', nested: { c: true } };
		expect(b64decode(b64encode(obj))).toEqual(obj);
	});

	it('round-trips bytes through base64', () => {
		const bytes = new Uint8Array([0, 1, 2, 250, 255]);
		expect(Array.from(base64ToUint8Array(uint8ArrayToBase64(bytes)))).toEqual([
			0, 1, 2, 250, 255,
		]);
	});

	it('returns null for undecodable base64', () => {
		expect(b64decode('')).toBe(null);
		expect(b64decode('@@not-base64@@')).toBe(null);
	});
});

describe('explorerUrl', () => {
	it('maps networks to their explorers', () => {
		expect(explorerUrl(solanaAccept.network, 'SIG')).toBe('https://solscan.io/tx/SIG');
		expect(explorerUrl('eip155:8453', '0xabc')).toBe('https://basescan.org/tx/0xabc');
		expect(explorerUrl('eip155:8453', null)).toBe(null);
	});
});

describe('friendlyError', () => {
	it('collapses wallet rejection messages', () => {
		expect(friendlyError(new Error('User rejected the request'))).toBe('Cancelled in wallet');
		expect(friendlyError({ message: 'User denied transaction signature' })).toBe(
			'Cancelled in wallet',
		);
	});

	it('passes through and truncates other messages', () => {
		expect(friendlyError(new Error('boom'))).toBe('boom');
		expect(friendlyError(new Error('x'.repeat(500))).length).toBe(240);
	});
});
