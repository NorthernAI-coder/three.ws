/**
 * Export all custodial agent Solana wallets (offline backup).
 * ---------------------------------------------------------------------------
 * Decrypts every agent's `encrypted_solana_secret` (AES-256-GCM, key derived
 * from JWT_SECRET via HKDF — identical to api/_lib/agent-wallet.js) and writes a
 * backup file. For each wallet it emits the address plus the secret in two
 * import formats: base58 (Phantom/Solflare) and the 64-byte array (solana-cli
 * keypair JSON). It verifies each decrypted key matches its stored address.
 *
 * SECURITY — read before running:
 *   • This file will contain EVERY agent's PRIVATE KEY. Treat it as the crown
 *     jewels: anyone with it can drain all 249 wallets.
 *   • Run it ONLY in an environment that already has JWT_SECRET set (e.g. after
 *     `vercel env pull`). NEVER paste JWT_SECRET into a chat or commit it.
 *   • Provide EXPORT_PASSPHRASE to encrypt the output at rest (strongly
 *     recommended). Without it the file is plaintext (mode 0600) and the script
 *     warns loudly.
 *   • The script prints only addresses + counts — never secrets.
 *
 * Usage (in YOUR secure shell):
 *   DATABASE_URL='postgres://…' \
 *   JWT_SECRET='…' \
 *   EXPORT_PASSPHRASE='a-long-random-passphrase' \
 *   node scripts/export-agent-wallets.mjs --out ~/agent-wallets.backup.enc
 *
 * Decrypt later:
 *   EXPORT_PASSPHRASE='…' node scripts/export-agent-wallets.mjs --decrypt ~/agent-wallets.backup.enc --out ~/agent-wallets.json
 */

import fs from 'fs';
import { webcrypto } from 'node:crypto';

const subtle = globalThis.crypto?.subtle || webcrypto.subtle;
const arg = (flag) => {
	const i = process.argv.indexOf(flag);
	return i >= 0 ? process.argv[i + 1] : null;
};

// ── File-at-rest encryption (passphrase → scrypt → AES-256-GCM) ──────────────
import { scrypt as _scrypt, randomBytes } from 'node:crypto';
const scrypt = (pw, salt, len) =>
	new Promise((res, rej) => _scrypt(pw, salt, len, (e, k) => (e ? rej(e) : res(k))));

async function encryptFile(plaintext, passphrase) {
	const salt = randomBytes(16);
	const keyBytes = await scrypt(passphrase, salt, 32);
	const key = await subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt']);
	const iv = randomBytes(12);
	const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext));
	return JSON.stringify({
		v: 1,
		kdf: 'scrypt',
		salt: Buffer.from(salt).toString('base64'),
		iv: Buffer.from(iv).toString('base64'),
		ct: Buffer.from(new Uint8Array(ct)).toString('base64'),
	});
}

async function decryptFile(blob, passphrase) {
	const { salt, iv, ct } = JSON.parse(blob);
	const keyBytes = await scrypt(passphrase, Buffer.from(salt, 'base64'), 32);
	const key = await subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['decrypt']);
	const plain = await subtle.decrypt(
		{ name: 'AES-GCM', iv: Buffer.from(iv, 'base64') },
		key,
		Buffer.from(ct, 'base64'),
	);
	return new TextDecoder().decode(plain);
}

// ── Wallet-secret decryption (must match api/_lib/agent-wallet.js exactly) ────
async function deriveWalletKey(jwtSecret) {
	const raw = new TextEncoder().encode(jwtSecret);
	const base = await subtle.importKey('raw', raw, 'HKDF', false, ['deriveKey']);
	return subtle.deriveKey(
		{ name: 'HKDF', hash: 'SHA-256', salt: new TextEncoder().encode('agent-wallet-v1'), info: new Uint8Array(0) },
		base,
		{ name: 'AES-GCM', length: 256 },
		false,
		['decrypt'],
	);
}

async function decryptSecret(ciphertextB64, key) {
	const raw = Buffer.from(ciphertextB64, 'base64');
	const iv = raw.subarray(0, 12);
	const ct = raw.subarray(12);
	const plain = await subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
	return new TextDecoder().decode(plain); // base64 of the 64-byte secretKey
}

async function main() {
	const out = arg('--out');

	// Decrypt-an-existing-backup mode.
	const dec = arg('--decrypt');
	if (dec) {
		const pass = process.env.EXPORT_PASSPHRASE;
		if (!pass) throw new Error('EXPORT_PASSPHRASE required to --decrypt');
		const plain = await decryptFile(fs.readFileSync(dec, 'utf8'), pass);
		if (out) {
			fs.writeFileSync(out, plain, { mode: 0o600 });
			const n = JSON.parse(plain).wallets.length;
			console.log(`decrypted ${n} wallets → ${out} (mode 600)`);
		} else {
			console.log(plain);
		}
		return;
	}

	// Export mode.
	if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL required');
	if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET required (run where it is set; do NOT paste it into chat)');
	if (!out) throw new Error('--out <path> required');

	const [{ neon }, { Keypair }, bs58mod] = await Promise.all([
		import('@neondatabase/serverless'),
		import('@solana/web3.js'),
		import('bs58'),
	]);
	const bs58 = bs58mod.default || bs58mod;
	const sql = neon(process.env.DATABASE_URL);
	const key = await deriveWalletKey(process.env.JWT_SECRET);

	const rows = await sql`
		select id, name,
		       meta->>'solana_address' as address,
		       meta->>'encrypted_solana_secret' as secret,
		       meta->>'solana_wallet_source' as source
		from agent_identities
		where deleted_at is null and meta->>'encrypted_solana_secret' is not null
		order by created_at asc
	`;

	const wallets = [];
	const failures = [];
	for (const r of rows) {
		try {
			const secretB64 = await decryptSecret(r.secret, key);
			const secretKey = Buffer.from(secretB64, 'base64');
			const kp = Keypair.fromSecretKey(Uint8Array.from(secretKey));
			const derived = kp.publicKey.toBase58();
			if (r.address && derived !== r.address) {
				failures.push({ id: r.id, reason: `address mismatch: stored ${r.address} != derived ${derived}` });
				continue;
			}
			wallets.push({
				agent_id: r.id,
				name: r.name || null,
				source: r.source || null,
				address: derived,
				secret_base58: bs58.encode(secretKey), // Phantom/Solflare import
				secret_array: Array.from(secretKey), // solana-cli keypair JSON
			});
		} catch (e) {
			failures.push({ id: r.id, reason: e.message });
		}
	}

	const payload = JSON.stringify(
		{ exported_at: new Date().toISOString(), count: wallets.length, wallets },
		null,
		2,
	);

	const pass = process.env.EXPORT_PASSPHRASE;
	if (pass) {
		fs.writeFileSync(out, await encryptFile(payload, pass), { mode: 0o600 });
		console.log(`✅ exported ${wallets.length} wallets → ${out} (AES-256-GCM, mode 600)`);
		console.log(`   decrypt with: EXPORT_PASSPHRASE=… node scripts/export-agent-wallets.mjs --decrypt ${out} --out wallets.json`);
	} else {
		fs.writeFileSync(out, payload, { mode: 0o600 });
		console.log(`⚠️  exported ${wallets.length} wallets → ${out} (PLAINTEXT, mode 600)`);
		console.log('   No EXPORT_PASSPHRASE set — this file holds raw private keys. Encrypt or move it offline NOW.');
	}
	if (failures.length) {
		console.log(`\n${failures.length} could not be exported:`);
		failures.slice(0, 20).forEach((f) => console.log(`   ${f.id}: ${f.reason}`));
	}
	console.log('\nfirst 5 addresses (sanity):');
	wallets.slice(0, 5).forEach((w) => console.log(`   ${w.address}  ${w.name || ''}`));
}

main().catch((e) => {
	console.error('✗', e.message);
	process.exit(1);
});
