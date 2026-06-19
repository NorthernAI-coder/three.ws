// Per-agent vanity wallet — the grind primitive and the shared wallet chip.
//
// Covers the two pure pieces of the opt-in vanity feature that don't need a DB
// or an RPC: the server-side keypair grinder (api/_lib/pump-vanity.js, also used
// by POST /api/agents/:id/solana/vanity) and the wallet-chip status normalizer
// every agent/avatar surface renders from (src/shared/agent-wallet-chip.js).

import { describe, it, expect } from 'vitest';

import { grindMintKeypair, estimateAttempts, isValidVanityPrefix, BASE58_ALPHABET } from '../api/_lib/pump-vanity.js';
import { getWalletStatus, hasWallet, walletChipHTML } from '../src/shared/agent-wallet-chip.js';

describe('grindMintKeypair', () => {
	it('finds an address with the requested prefix', async () => {
		// One base58 char ≈ 58 attempts expected — comfortably inside the cap.
		const { keypair, iterations } = await grindMintKeypair({ prefix: 'a', ignoreCase: true, maxIterations: 200_000 });
		const addr = keypair.publicKey.toBase58();
		expect(addr.toLowerCase().startsWith('a')).toBe(true);
		expect(iterations).toBeGreaterThan(0);
	});

	it('finds an address with the requested suffix', async () => {
		const { keypair } = await grindMintKeypair({ suffix: 'z', ignoreCase: true, maxIterations: 200_000 });
		expect(keypair.publicKey.toBase58().toLowerCase().endsWith('z')).toBe(true);
	});

	it('honours case-sensitive prefixes exactly', async () => {
		const { keypair } = await grindMintKeypair({ prefix: 'A', ignoreCase: false, maxIterations: 500_000 });
		expect(keypair.publicKey.toBase58().startsWith('A')).toBe(true);
	});

	it('rejects non-base58 patterns', async () => {
		// 0, O, I, l are not in the base58 alphabet.
		await expect(grindMintKeypair({ prefix: '0' })).rejects.toThrow();
		expect(BASE58_ALPHABET).not.toContain('0');
		expect(isValidVanityPrefix('0')).toBe(false);
		expect(isValidVanityPrefix('ab')).toBe(true);
	});

	it('estimates difficulty as alphabet^length', () => {
		expect(estimateAttempts({ prefix: 'a' })).toBe(58);
		expect(estimateAttempts({ prefix: 'ab' })).toBe(58 * 58);
		// case-insensitive folds the alphabet to ~33 distinct buckets
		expect(estimateAttempts({ prefix: 'ab', ignoreCase: true })).toBe(33 * 33);
	});
});

describe('getWalletStatus / wallet chip', () => {
	const VANITY = 'agntSo1111111111111111111111111111111111ws';
	const PLAIN = '4Nd1mDQkSp9Xb6hT2pXc8QwJ5kR7yZ3aB9cD1eF2gH3';

	it('returns null when there is no solana wallet', () => {
		expect(getWalletStatus({ id: 'x' })).toBeNull();
		expect(hasWallet({ id: 'x' })).toBe(false);
	});

	it('reads the address from any record shape', () => {
		expect(getWalletStatus({ id: 'a', solana_address: PLAIN }).address).toBe(PLAIN);
		expect(getWalletStatus({ id: 'a', meta: { solana_address: PLAIN } }).address).toBe(PLAIN);
		expect(getWalletStatus({ id: 'a', wallet: PLAIN }).address).toBe(PLAIN);
	});

	it('detects vanity from top-level or meta fields', () => {
		const top = getWalletStatus({ id: 'a', solana_address: VANITY, solana_vanity_prefix: 'agnt', solana_vanity_suffix: 'ws' });
		expect(top.isVanity).toBe(true);
		expect(top.prefix).toBe('agnt');
		expect(top.suffix).toBe('ws');
		const viaMeta = getWalletStatus({ id: 'a', meta: { solana_address: VANITY, solana_vanity_prefix: 'agnt' } });
		expect(viaMeta.isVanity).toBe(true);
		expect(getWalletStatus({ id: 'a', solana_address: PLAIN }).isVanity).toBe(false);
	});

	it('renders an owner make-vanity entry point only for non-vanity owner wallets', () => {
		const ownerPlain = walletChipHTML({ id: 'agent-1', solana_address: PLAIN }, { isOwner: true });
		expect(ownerPlain).toContain('/agent/agent-1/wallet#vanity');
		expect(ownerPlain).toContain('data-twc-copy');

		const ownerVanity = walletChipHTML({ id: 'agent-1', solana_address: VANITY, solana_vanity_prefix: 'agnt' }, { isOwner: true });
		expect(ownerVanity).toContain('vanity');
		expect(ownerVanity).not.toContain('#vanity'); // already vanity — no upgrade CTA

		const visitor = walletChipHTML({ id: 'agent-1', solana_address: PLAIN }, { isOwner: false });
		expect(visitor).not.toContain('#vanity');
	});

	it('renders a pending chip when asked and no wallet exists', () => {
		expect(walletChipHTML({ id: 'a' }, { showPending: true })).toContain('Wallet pending');
		expect(walletChipHTML({ id: 'a' }, { showPending: false })).toBe('');
	});

	it('omits interactive controls in link:false mode (safe inside card anchors)', () => {
		const ro = walletChipHTML({ id: 'a', solana_address: PLAIN }, { link: false });
		expect(ro).not.toContain('data-twc-copy');
		expect(ro).not.toContain('<a');
	});
});
