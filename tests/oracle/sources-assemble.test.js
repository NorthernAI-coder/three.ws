// Oracle source adapter — assembleIntel outage semantics.
//
// Regression guard: the primary coin lookup must distinguish a genuinely-unknown
// coin (empty result → null) from a database outage (query throws → propagate).
// Collapsing both into null made /api/oracle/coin return a misleading 404 during
// a DB/connection outage, which clients and the CDN then cached as an
// authoritative "this mint doesn't exist". A thrown error must reach the caller
// so it can answer 503 instead.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const sqlMock = vi.fn();
vi.mock('../../api/_lib/db.js', () => ({
	sql: (...args) => sqlMock(...args),
}));

const { assembleIntel } = await import('../../api/_lib/oracle/sources.js');

describe('assembleIntel — outage vs unknown', () => {
	beforeEach(() => sqlMock.mockReset());

	it('returns null when the coin is genuinely unknown (empty primary result)', async () => {
		sqlMock.mockResolvedValue([]);
		await expect(assembleIntel('MintUnknownAAA', 'mainnet')).resolves.toBeNull();
	});

	it('throws when the primary lookup fails (DB outage) — never a silent null', async () => {
		sqlMock.mockRejectedValue(new Error('db query exceeded 15000ms deadline'));
		let caught = null;
		try {
			await assembleIntel('MintXYZ', 'mainnet');
		} catch (err) {
			caught = err;
		}
		expect(caught).toBeInstanceOf(Error);
		expect(caught.message).toMatch(/deadline/);
	});
});
