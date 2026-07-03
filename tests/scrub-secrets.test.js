import { describe, it, expect } from 'vitest';
import { scrubSecrets } from '../api/_lib/scrub-secrets.js';

describe('scrubSecrets', () => {
	it('redacts secret-bearing keys at the top level', () => {
		const out = scrubSecrets({ amount: 5, secret: 'abc', privateKey: 'xyz' });
		expect(out).toEqual({ amount: 5, secret: '[redacted]', privateKey: '[redacted]' });
	});

	it('redacts nested secrets at any depth', () => {
		const out = scrubSecrets({
			wallet: { address: 'W1', encrypted_solana_secret: 'deadbeef', meta: { mnemonic: 'a b c' } },
		});
		expect(out.wallet.address).toBe('W1');
		expect(out.wallet.encrypted_solana_secret).toBe('[redacted]');
		expect(out.wallet.meta.mnemonic).toBe('[redacted]');
	});

	it('walks arrays element-wise', () => {
		const out = scrubSecrets({ keys: [{ apiKey: 'k1' }, { apiKey: 'k2' }] });
		expect(out.keys).toEqual([{ apiKey: '[redacted]' }, { apiKey: '[redacted]' }]);
	});

	it('matches case-insensitively and as a substring (keypair, signingKey, bearer)', () => {
		const out = scrubSecrets({ KeyPair: 'x', signingKey: 'y', bearerToken: 'z', mint: 'MINT' });
		expect(out).toEqual({ KeyPair: '[redacted]', signingKey: '[redacted]', bearerToken: '[redacted]', mint: 'MINT' });
	});

	it('leaves non-secret data (mints, signatures, amounts) untouched', () => {
		const detail = { mint: 'So111…', signature: '5xk…', amount_sol: 0.01, symbol: 'THREE' };
		expect(scrubSecrets(detail)).toEqual(detail);
	});

	it('passes primitives through and handles cycles without throwing', () => {
		expect(scrubSecrets(42)).toBe(42);
		expect(scrubSecrets('hi')).toBe('hi');
		expect(scrubSecrets(null)).toBe(null);
		const a = { name: 'a' };
		a.self = a; // circular
		expect(() => scrubSecrets(a)).not.toThrow();
		expect(scrubSecrets(a).name).toBe('a');
	});

	it('does not mutate the input object', () => {
		const input = { secret: 'keep-me-in-original' };
		scrubSecrets(input);
		expect(input.secret).toBe('keep-me-in-original');
	});
});
