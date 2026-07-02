import { describe, it, expect, beforeAll, afterEach } from 'vitest';

// secret-box freezes IS_PROD at import time; keep the test env non-prod so the
// JWT_SECRET fallback path (the thing under test) is reachable. walletMasterSecret
// and env.JWT_SECRET are read live per call, so we can flip keys between calls
// without re-importing the module.
const JWT = 'test-jwt-secret-value-1234567890-abcdef_'; // >=32
const DEDICATED = 'dedicated-wallet-encryption-key-0987654321-XYZ'; // >=32, distinct

beforeAll(() => {
	process.env.NODE_ENV = 'test';
	delete process.env.VERCEL_ENV;
	process.env.JWT_SECRET = JWT;
});

afterEach(() => {
	delete process.env.WALLET_ENCRYPTION_KEY;
});

const load = () => import('../api/_lib/secret-box.js');

describe('secret-box encrypt/decrypt', () => {
	it('round-trips with a dedicated WALLET_ENCRYPTION_KEY', async () => {
		const { encryptSecret, decryptSecret } = await load();
		process.env.WALLET_ENCRYPTION_KEY = DEDICATED;
		const ct = await encryptSecret('super-secret-plaintext');
		expect(ct.startsWith('v2:')).toBe(true);
		expect(await decryptSecret(ct)).toBe('super-secret-plaintext');
	});

	it('decrypts a JWT_SECRET-keyed v2 record even after a dedicated key is introduced', async () => {
		const { encryptSecret, decryptSecret } = await load();
		// (1) Write while only JWT_SECRET exists — the record is keyed by JWT_SECRET.
		delete process.env.WALLET_ENCRYPTION_KEY;
		const legacyV2 = await encryptSecret('funds-behind-this-key');
		expect(legacyV2.startsWith('v2:')).toBe(true);
		// (2) A dedicated key is later introduced. The primary key no longer matches,
		//     but the fallback to JWT_SECRET must still recover the record.
		process.env.WALLET_ENCRYPTION_KEY = DEDICATED;
		expect(await decryptSecret(legacyV2)).toBe('funds-behind-this-key');
	});

	it('throws (never returns garbage) when no candidate key matches', async () => {
		const { encryptSecret, decryptSecret } = await load();
		// Encrypt under an unrelated key, then present neither that key nor JWT_SECRET.
		process.env.WALLET_ENCRYPTION_KEY = 'unrelated-key-that-will-be-lost-0000000000';
		const ct = await encryptSecret('unrecoverable');
		process.env.WALLET_ENCRYPTION_KEY = DEDICATED; // primary mismatch
		process.env.JWT_SECRET = 'a-different-jwt-secret-value-000000000000'; // fallback mismatch
		await expect(decryptSecret(ct)).rejects.toBeTruthy();
		process.env.JWT_SECRET = JWT; // restore for other tests
	});
});
