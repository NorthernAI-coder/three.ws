// Unit tests for the DB connection-retry helper. Pure logic — `withDbRetry`
// takes a thunk, so no DB or network mocking is needed.

import { describe, it, expect, vi } from 'vitest';
import { withDbRetry } from '../api/_lib/db-retry.js';

function transientError() {
	// Shape Neon's HTTP driver produces on a cold-start / network blip.
	return new Error('NeonDbError: Error connecting to database: fetch failed');
}

function constraintError() {
	// A real SQL error carries a Postgres SQLSTATE and a deterministic message.
	return Object.assign(new Error('duplicate key value violates unique constraint "agent_identities_pkey"'), {
		code: '23505',
	});
}

describe('withDbRetry', () => {
	it('returns the result without retrying when the operation succeeds', async () => {
		const run = vi.fn().mockResolvedValue('ok');
		await expect(withDbRetry(run)).resolves.toBe('ok');
		expect(run).toHaveBeenCalledTimes(1);
	});

	it('retries a transient connection error and succeeds on the next attempt', async () => {
		const run = vi
			.fn()
			.mockRejectedValueOnce(transientError())
			.mockResolvedValueOnce('recovered');
		await expect(withDbRetry(run)).resolves.toBe('recovered');
		expect(run).toHaveBeenCalledTimes(2);
	});

	it('does NOT retry a SQL/constraint error — it fails fast', async () => {
		const err = constraintError();
		const run = vi.fn().mockRejectedValue(err);
		await expect(withDbRetry(run)).rejects.toBe(err);
		expect(run).toHaveBeenCalledTimes(1);
	});

	it('gives up after the attempt cap on a persistent transient failure', async () => {
		const run = vi.fn().mockRejectedValue(transientError());
		await expect(withDbRetry(run)).rejects.toThrow(/fetch failed/);
		expect(run).toHaveBeenCalledTimes(3); // MAX_DB_ATTEMPTS
	});

	it('unwraps a transient cause carried on sourceError', async () => {
		// NeonDbError nests the underlying fetch failure on `sourceError`.
		const wrapped = Object.assign(new Error('query failed'), {
			sourceError: new Error('fetch failed'),
		});
		const run = vi.fn().mockRejectedValueOnce(wrapped).mockResolvedValueOnce('ok');
		await expect(withDbRetry(run)).resolves.toBe('ok');
		expect(run).toHaveBeenCalledTimes(2);
	});
});
