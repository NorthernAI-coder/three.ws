import { describe, it, expect } from 'vitest';
import bs58 from 'bs58';

import {
	sealToRecipient,
	openSealed,
	openSealedText,
	generateRecipientKeypair,
	parseX25519Key,
	SEALED_ENVELOPE_SCHEME,
} from '../src/solana/vanity/sealed-envelope.js';
import { grindVanityNode } from '../src/solana/vanity/grinder-node.js';
import { grindVanityMnemonic } from '../src/solana/vanity/mnemonic-grinder.js';
import { deriveSolanaKeypair } from '../src/solana/vanity/mnemonic.js';

function toBase64url(bytes) {
	return Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Flip the first byte of a Base64url payload — a guaranteed-significant mutation
// (flipping a trailing char can be a no-op on the decoded bytes).
function flipFirstByte(b64u) {
	const buf = Buffer.from(b64u.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
	buf[0] ^= 0xff;
	return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

describe('sealed-envelope', () => {
	it('round-trips a string through seal → open with the matching key', async () => {
		const { publicKey, secretKey } = generateRecipientKeypair();
		const plaintext = JSON.stringify({ secret: 'top', n: 42 });
		const env = await sealToRecipient(plaintext, publicKey);

		expect(env.scheme).toBe(SEALED_ENVELOPE_SCHEME);
		expect(env.recipient).toBe(publicKey);
		expect(typeof env.epk).toBe('string');
		expect(typeof env.nonce).toBe('string');
		// The ciphertext must not leak the plaintext.
		expect(env.ciphertext).not.toContain('top');

		expect(await openSealedText(env, secretKey)).toBe(plaintext);
	});

	it('round-trips raw bytes', async () => {
		const { publicKey, secretKey } = generateRecipientKeypair();
		const bytes = new Uint8Array([0, 1, 2, 255, 128, 64]);
		const env = await sealToRecipient(bytes, publicKey);
		expect(Array.from(await openSealed(env, secretKey))).toEqual(Array.from(bytes));
	});

	it('rejects opening with the wrong private key', async () => {
		const { publicKey } = generateRecipientKeypair();
		const env = await sealToRecipient('secret', publicKey);
		const wrong = generateRecipientKeypair().secretKey;
		await expect(openSealed(env, wrong)).rejects.toThrow();
	});

	it('rejects a tampered ciphertext (AES-GCM tag)', async () => {
		const { publicKey, secretKey } = generateRecipientKeypair();
		const env = await sealToRecipient('secret', publicKey);
		const tampered = { ...env, ciphertext: flipFirstByte(env.ciphertext) };
		await expect(openSealed(tampered, secretKey)).rejects.toThrow();
	});

	it('rejects a swapped ephemeral public key (epk bound as AAD)', async () => {
		const { publicKey, secretKey } = generateRecipientKeypair();
		const env = await sealToRecipient('secret', publicKey);
		// Replace epk with a different valid X25519 public key.
		const otherEpk = generateRecipientKeypair().publicKey;
		await expect(openSealed({ ...env, epk: otherEpk }, secretKey)).rejects.toThrow();
	});

	it('rejects an unsupported scheme', async () => {
		const { publicKey, secretKey } = generateRecipientKeypair();
		const env = await sealToRecipient('secret', publicKey);
		await expect(openSealed({ ...env, scheme: 'rot13' }, secretKey)).rejects.toThrow(/scheme/);
	});

	it('accepts the recipient key as Base58, hex, or Base64url', async () => {
		const { publicKey, secretKey } = generateRecipientKeypair();
		const raw = parseX25519Key(publicKey);
		const hex = Buffer.from(raw).toString('hex');
		const b64 = toBase64url(raw);
		for (const form of [publicKey, hex, b64]) {
			const env = await sealToRecipient('ok', form);
			expect(await openSealedText(env, secretKey)).toBe('ok');
		}
	});

	it('throws a 400-tagged error on a wrong-length recipient key', () => {
		try {
			parseX25519Key('deadbeef'); // 4 bytes, not 32
			throw new Error('should have thrown');
		} catch (e) {
			expect(e.code).toBe('invalid_recipient_key');
			expect(e.status).toBe(400);
		}
	});
});

describe('sealed vanity delivery (endpoint sealSecret path)', () => {
	// Mirrors api/x402/vanity.js: seal a JSON bundle of the secret, then a client
	// opens it with their X25519 private key. We exercise both output formats.
	it('seals a ground keypair so only the recipient can recover the secret', async () => {
		const { publicKey, secretKey } = generateRecipientKeypair();
		const g = grindVanityNode({ suffix: 'z', ignoreCase: true, timeBudgetMs: 15_000 });
		const bundle = {
			format: 'keypair',
			secretKeyBase58: bs58.encode(g.secretKey),
			secretKey: Array.from(g.secretKey),
		};
		const sealed = await sealToRecipient(JSON.stringify(bundle), publicKey);

		const opened = JSON.parse(await openSealedText(sealed, secretKey));
		expect(opened.secretKeyBase58).toBe(bundle.secretKeyBase58);
		// The recovered secret key must reproduce the ground address.
		const recovered = bs58.decode(opened.secretKeyBase58);
		expect(bs58.encode(recovered.slice(32))).toBe(g.publicKey);
	});

	it('seals a ground mnemonic that re-derives to the vanity address', async () => {
		const { publicKey, secretKey } = generateRecipientKeypair();
		const g = grindVanityMnemonic({ suffix: 'z', ignoreCase: true, timeBudgetMs: 20_000 });
		const bundle = {
			format: 'mnemonic',
			mnemonic: g.mnemonic,
			derivationPath: g.derivationPath,
		};
		const sealed = await sealToRecipient(JSON.stringify(bundle), publicKey);

		const opened = JSON.parse(await openSealedText(sealed, secretKey));
		// Recovering the phrase and deriving at the wallet path lands on the address.
		const derived = deriveSolanaKeypair(opened.mnemonic).keypair.publicKey.toBase58();
		expect(derived).toBe(g.publicKey);
	});
});
