#!/usr/bin/env node
// Apply the paid_assets migration against $DATABASE_URL.
// Usage: DATABASE_URL=... node scripts/apply-paid-assets-migration.mjs
//
// Idempotent — the migration uses IF NOT EXISTS on every CREATE.

import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
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
			if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
				val = val.slice(1, -1);
			}
			process.env[m[1]] = val;
		}
		break;
	} catch {
		/* file not present */
	}
}

const url = process.env.DATABASE_URL;
if (!url) {
	console.error('DATABASE_URL not set');
	process.exit(1);
}
const sql = neon(url);
const text = await readFile(
	new URL('../api/_lib/migrations/2026-05-21-paid-assets.sql', import.meta.url),
	'utf8',
);

const statements = text
	.split(/;\s*$/m)
	.map((s) => s.trim())
	.filter((s) => s && !/^--/.test(s));

for (const s of statements) {
	await sql.query(s);
	console.log('OK:', s.slice(0, 80).replace(/\s+/g, ' '));
}
console.log('paid_assets table ready');
