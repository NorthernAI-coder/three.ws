#!/usr/bin/env node
/**
 * One-time sweep: re-encrypt any plaintext pump.fun creator keys at rest.
 *
 * Pre-encryption launches stored coin_launches.metadata.creator_secret_b64 as
 * raw base64 plaintext. Those keys sign collectCreatorFee — a DB snapshot, log,
 * or read-replica leak hands over live signing keys. This sweep encrypts every
 * plaintext value via the same AES-256-GCM scheme the launcher now uses
 * (encryptSecret → "v2:"-prefixed blob) and writes it back, leaving no plaintext.
 *
 * SAFE BY DEFAULT: dry-run unless --apply is passed. Reads DATABASE_URL and
 * WALLET_ENCRYPTION_KEY from env / .env.local / .env.
 *
 * Usage:
 *   node scripts/reencrypt-creator-keys.mjs            # report what would change
 *   node scripts/reencrypt-creator-keys.mjs --apply    # encrypt + persist
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { neon } from '@neondatabase/serverless';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..');

for (const envFile of ['.env.local', '.env']) {
	try {
		const raw = readFileSync(path.resolve(REPO_ROOT, envFile), 'utf8');
		for (const line of raw.split('\n')) {
			const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
			if (!m || process.env[m[1]]) continue;
			let val = m[2].trim();
			if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
				val = val.slice(1, -1);
			process.env[m[1]] = val;
		}
		break;
	} catch { /* not present */ }
}

const APPLY = process.argv.includes('--apply');

if (!process.env.DATABASE_URL) {
	console.error('DATABASE_URL is not set.');
	process.exit(2);
}
if (!process.env.WALLET_ENCRYPTION_KEY || process.env.WALLET_ENCRYPTION_KEY.length < 32) {
	console.error('WALLET_ENCRYPTION_KEY must be set (>=32 chars) to encrypt creator keys.');
	process.exit(2);
}

// Imported AFTER env is loaded so secret-box resolves the master key correctly.
const { encryptSecret, isEncryptedSecret } = await import('../api/_lib/secret-box.js');

const sql = neon(process.env.DATABASE_URL);

async function main() {
	const rows = await sql`
		SELECT id, mint, metadata
		FROM coin_launches
		WHERE metadata ? 'creator_secret_b64'
		  AND metadata->>'creator_secret_b64' IS NOT NULL
	`;

	let plaintext = 0;
	let alreadyEncrypted = 0;
	let updated = 0;

	for (const row of rows) {
		const value = row.metadata?.creator_secret_b64;
		if (!value) continue;
		if (isEncryptedSecret(value)) {
			alreadyEncrypted++;
			continue;
		}
		plaintext++;
		console.log(`  plaintext creator key — coin ${row.id} (mint ${row.mint})`);
		if (!APPLY) continue;

		const encrypted = await encryptSecret(value);
		const nextMeta = { ...row.metadata, creator_secret_b64: encrypted };
		await sql`
			UPDATE coin_launches
			SET metadata = ${JSON.stringify(nextMeta)}::jsonb
			WHERE id = ${row.id}
		`;
		updated++;
	}

	console.log('');
	console.log(`Scanned ${rows.length} launch(es) with a creator key.`);
	console.log(`  already encrypted: ${alreadyEncrypted}`);
	console.log(`  plaintext:         ${plaintext}`);
	if (APPLY) console.log(`  re-encrypted:      ${updated}`);
	else if (plaintext) console.log(`\nRe-run with --apply to encrypt ${plaintext} plaintext key(s).`);
	else console.log('\nNothing to do — no plaintext keys found.');
}

main().catch((e) => {
	console.error('FAILED:', e.message);
	process.exitCode = 1;
});
