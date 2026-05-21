// Integration test for api/_lib/siwx-storage.js against the live Neon
// Postgres pointed at by $DATABASE_URL. Hits real tables; each run namespaces
// its rows under `test-resource-<uuid>` and deletes them afterwards so
// concurrent CI runs don't collide. Skipped when DATABASE_URL is absent.

import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { beforeAll, afterAll, describe, expect, it } from 'vitest';

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

const hasDb = !!process.env.DATABASE_URL;
const describeIfDb = hasDb ? describe : describe.skip;

const RES_PREFIX = `test-resource-${randomUUID()}`;
const NONCE_PREFIX = `test-nonce-${randomUUID()}`;

describeIfDb('siwx-storage (real Postgres)', () => {
	/** @type {import('../api/_lib/siwx-storage.js')} */
	let mod;
	/** @type {any} */
	let sql;

	beforeAll(async () => {
		mod = await import('../api/_lib/siwx-storage.js');
		({ sql } = await import('../api/_lib/db.js'));
	});

	afterAll(async () => {
		await sql`delete from siwx_payments where resource like ${RES_PREFIX + '%'}`;
		await sql`delete from siwx_nonces where resource like ${RES_PREFIX + '%'} or nonce like ${NONCE_PREFIX + '%'}`;
	});

	it('hasPaid returns false for an unknown wallet', async () => {
		const resource = `${RES_PREFIX}/unknown`;
		const result = await mod.siwxStorage.hasPaid(
			resource,
			'0xdEAd000000000000000000000000000000000000',
		);
		expect(result).toBe(false);
	});

	it('round-trips an EVM payment with mixed-case address', async () => {
		const resource = `${RES_PREFIX}/evm`;
		const checksummed = '0xAaBbCcDdEeFf0011223344556677889900AaBbCc';
		await mod.siwxStorage.recordPayment(resource, checksummed, {
			network: 'eip155:8453',
		});
		expect(await mod.siwxStorage.hasPaid(resource, checksummed)).toBe(true);
		expect(await mod.siwxStorage.hasPaid(resource, checksummed.toLowerCase())).toBe(true);
		expect(await mod.siwxStorage.hasPaid(resource, checksummed.toUpperCase())).toBe(true);
		const rows = await sql`
			select address from siwx_payments where resource = ${resource}
		`;
		expect(rows[0].address).toBe(checksummed.toLowerCase());
	});

	it('round-trips a Solana payment with case-sensitive Base58', async () => {
		const resource = `${RES_PREFIX}/sol`;
		const address = 'BSmWDgE9ex6dZYbiTsJGcwMEgFp8q4aWh92hdErQPeVW';
		await mod.siwxStorage.recordPayment(resource, address, {
			network: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
		});
		expect(await mod.siwxStorage.hasPaid(resource, address)).toBe(true);
		expect(await mod.siwxStorage.hasPaid(resource, address.toLowerCase())).toBe(false);
	});

	it('honors ttlSeconds — payment expires', async () => {
		const resource = `${RES_PREFIX}/ttl`;
		const address = '0x1111111111111111111111111111111111111111';
		await mod.siwxStorage.recordPayment(resource, address, {
			network: 'eip155:8453',
			ttlSeconds: 1,
		});
		expect(await mod.siwxStorage.hasPaid(resource, address)).toBe(true);
		await new Promise((r) => setTimeout(r, 1500));
		expect(await mod.siwxStorage.hasPaid(resource, address)).toBe(false);
	});

	it('round-trips a nonce and is idempotent', async () => {
		const nonce = `${NONCE_PREFIX}-once`;
		const resource = `${RES_PREFIX}/nonce`;
		expect(await mod.siwxStorage.hasUsedNonce(nonce)).toBe(false);
		await mod.siwxStorage.recordNonce(nonce, {
			resource,
			address: '0xabc0000000000000000000000000000000000000',
		});
		expect(await mod.siwxStorage.hasUsedNonce(nonce)).toBe(true);
		await mod.siwxStorage.recordNonce(nonce, {
			resource,
			address: '0xabc0000000000000000000000000000000000000',
		});
		expect(await mod.siwxStorage.hasUsedNonce(nonce)).toBe(true);
	});

	it('pruneOldNonces(0) clears all nonces inserted by the test', async () => {
		const n1 = `${NONCE_PREFIX}-prune-1`;
		const n2 = `${NONCE_PREFIX}-prune-2`;
		await mod.siwxStorage.recordNonce(n1, { resource: `${RES_PREFIX}/p`, address: '0x' });
		await mod.siwxStorage.recordNonce(n2, { resource: `${RES_PREFIX}/p`, address: '0x' });
		const removed = await mod.pruneOldNonces(0);
		expect(removed).toBeGreaterThanOrEqual(2);
		expect(await mod.siwxStorage.hasUsedNonce(n1)).toBe(false);
		expect(await mod.siwxStorage.hasUsedNonce(n2)).toBe(false);
	});

	it('pruneExpiredPayments deletes rows past grace window', async () => {
		const resource = `${RES_PREFIX}/expired`;
		const address = '0x2222222222222222222222222222222222222222';
		await mod.siwxStorage.recordPayment(resource, address, {
			network: 'eip155:8453',
			ttlSeconds: 1,
		});
		await new Promise((r) => setTimeout(r, 1500));
		const removed = await mod.pruneExpiredPayments(0);
		expect(removed).toBeGreaterThanOrEqual(1);
		expect(await mod.siwxStorage.hasPaid(resource, address)).toBe(false);
	});

	it('normalizeAddress rejects unknown CAIP-2 namespaces', () => {
		expect(() => mod.normalizeAddress('cosmos:cosmoshub-4', 'cosmos1abc')).toThrow();
	});
});
