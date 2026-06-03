// Unit tests for /api/ibm/attest — the Granite Proof on-chain AI notary.
//
// Verifies the real contract without network: candles always return; the
// forecast/narration/governance/proof fields appear only when watsonx is
// configured; the SHA-256 digest is deterministic and the on-chain memo stays
// within Solana's limit; the agent NOTARIZES when Granite Guardian passes and
// REFUSES (veto) when it flags. All upstreams are mocked.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Readable } from 'node:stream';

const ADDR = 'So11111111111111111111111111111111111111112';
const POOL = '5ByL7MZoLABYnwMPZKPKjf4MGkZ7FeBzrAnos19Pre2z';
const GUARDIAN_MODEL = 'ibm/granite-guardian-3-8b';

const state = {
	wxConfigured: false,
	guardianVerdict: 'No', // 'No' = safe, 'Yes' = flagged
	walletConfigured: false,
	walletFunded: true,
	sendSolArgs: null,
	verifyTx: null,
};

// ── Mocks ──────────────────────────────────────────────────────────────────
vi.mock('../../api/_lib/rate-limit.js', () => ({
	limits: { publicIp: vi.fn(async () => ({ success: true })) },
	clientIp: vi.fn(() => '127.0.0.1'),
}));

vi.mock('../../api/_lib/market/ohlcv.js', () => ({
	trendingPools: vi.fn(async () => [
		{ pool: POOL, name: 'MOCK / SOL', baseMint: 'mint', priceUsd: 1.5, change24h: 4.2 },
	]),
	topPoolForToken: vi.fn(async () => POOL),
	fetchOhlcv: vi.fn(async () => {
		const t0 = 1_700_000_000;
		const candles = Array.from({ length: 600 }, (_, i) => ({ t: t0 + i * 3600, o: 1, h: 1, l: 1, c: 1 + i * 0.001, v: 1 }));
		return { candles, base: { name: 'Mock', symbol: 'MOCK' }, quote: { symbol: 'USD' }, freq: '1h', timeframe: 'hour', aggregate: 1 };
	}),
}));

vi.mock('../../api/_lib/watsonx.js', () => ({
	watsonxConfig: vi.fn(() =>
		state.wxConfigured
			? { configured: true, url: 'https://wx', projectId: 'proj', apiVersion: '2024-05-31', tsApiVersion: '2025-02-11', chatModel: 'ibm/granite-3-8b-instruct' }
			: { configured: false, reason: 'WATSONX_API_KEY + project not set' },
	),
	watsonxChatComplete: vi.fn(async (_cfg, opts) =>
		opts?.model === GUARDIAN_MODEL
			? { text: state.guardianVerdict, model: GUARDIAN_MODEL }
			: { text: 'The token climbs steadily. Conviction holds into the next session.', model: 'ibm/granite-3-8b-instruct' },
	),
}));

vi.mock('../../api/_lib/watsonx-forecast.js', () => ({
	forecastModelFor: vi.fn(() => 'ibm/granite-ttm-512-96-r2'),
	watsonxForecast: vi.fn(async () => {
		const t0 = 1_700_000_000 + 600 * 3600;
		return {
			model: 'ibm/granite-ttm-512-96-r2',
			timestamps: Array.from({ length: 96 }, (_, i) => new Date((t0 + i * 3600) * 1000).toISOString()),
			values: Array.from({ length: 96 }, (_, i) => 2 + i * 0.001),
			inputWindow: 512,
		};
	}),
}));

vi.mock('../../api/_lib/avatar-wallet.js', () => ({
	avatarWalletConfig: vi.fn(() =>
		state.walletConfigured
			? { configured: true, address: ADDR, network: 'mainnet', rpcUrl: 'rpc', maxSendUsd: 2 }
			: { configured: false, address: null, network: 'mainnet' },
	),
	loadAvatarKeypair: vi.fn(() => ({ publicKey: { toBase58: () => ADDR } })),
	getConnection: vi.fn(() => ({ getParsedTransaction: vi.fn(async () => state.verifyTx) })),
	getSolBalance: vi.fn(async () => ({ lamports: state.walletFunded ? 1e7 : 0, sol: state.walletFunded ? 0.01 : 0 })),
	sendSol: vi.fn(async (args) => { state.sendSolArgs = args; return 'SIG123'; }),
	explorerTxUrl: vi.fn((s) => `https://solscan.io/tx/${s}`),
	explorerAccountUrl: vi.fn((a) => `https://solscan.io/account/${a}`),
}));

const handler = (await import('../../api/ibm/attest.js')).default;

// ── Helpers ──────────────────────────────────────────────────────────────
function makeReq({ method = 'GET', url = '/api/ibm/attest', body = null } = {}) {
	const base = body ? Readable.from([Buffer.from(JSON.stringify(body))]) : Readable.from([]);
	base.method = method;
	base.url = url;
	base.headers = { host: 'localhost', 'content-type': 'application/json', origin: 'http://localhost' };
	return base;
}
function makeRes() {
	return {
		statusCode: 200, headers: {}, body: '', writableEnded: false,
		setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
		end(chunk) { if (chunk !== undefined) this.body += chunk; this.writableEnded = true; },
	};
}
async function invoke(reqOpts) {
	const res = makeRes();
	await handler(makeReq(reqOpts), res);
	return { status: res.statusCode, body: res.body ? JSON.parse(res.body) : null };
}

beforeEach(() => {
	state.wxConfigured = false;
	state.guardianVerdict = 'No';
	state.walletConfigured = false;
	state.walletFunded = true;
	state.sendSolArgs = null;
	state.verifyTx = null;
});

const SIG = '5'.repeat(88); // base58, valid length for a Solana signature
const makeTx = (memo) => ({
	slot: 123,
	blockTime: 1_700_000_000,
	transaction: {
		message: {
			instructions: [{ program: 'spl-memo', programId: { toString: () => 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr' }, parsed: memo }],
			accountKeys: [{ pubkey: { toString: () => ADDR } }],
		},
	},
});

describe('GET /api/ibm/attest?verify (off-chain read-back)', () => {
	it('rejects a malformed signature', async () => {
		const { status, body } = await invoke({ url: '/api/ibm/attest?verify=not-a-sig' });
		expect(status).toBe(400);
		expect(body.error).toBe('bad_signature');
	});

	it('confirms a real granite-proof memo and extracts the digest', async () => {
		state.verifyTx = makeTx('three.ws granite-proof/1 MOCK +31.0% 96h ttm-512-96 gd:ok abcdef0123456789');
		const { status, body } = await invoke({ url: `/api/ibm/attest?verify=${SIG}` });
		expect(status).toBe(200);
		expect(body.found).toBe(true);
		expect(body.isGraniteProof).toBe(true);
		expect(body.digest).toBe('abcdef0123456789');
		expect(body.signer).toBe(ADDR);
		expect(body.explorer).toContain(SIG);
	});

	it('flags a transaction whose memo is not a granite proof', async () => {
		state.verifyTx = makeTx('gm');
		const { body } = await invoke({ url: `/api/ibm/attest?verify=${SIG}` });
		expect(body.found).toBe(true);
		expect(body.isGraniteProof).toBe(false);
		expect(body.digest).toBeNull();
	});

	it('reports not-found when the transaction is missing', async () => {
		state.verifyTx = null;
		const { body } = await invoke({ url: `/api/ibm/attest?verify=${SIG}` });
		expect(body.found).toBe(false);
	});
});

describe('GET /api/ibm/attest', () => {
	it('lists trending pools', async () => {
		const { status, body } = await invoke({ url: '/api/ibm/attest?list=trending' });
		expect(status).toBe(200);
		expect(body.pools).toHaveLength(1);
		expect(body.pools[0].pool).toBe(POOL);
	});

	it('returns live history but no proof when watsonx is not configured', async () => {
		const { status, body } = await invoke({ url: `/api/ibm/attest?pool=${POOL}` });
		expect(status).toBe(200);
		expect(body.history.length).toBe(600);
		expect(body.forecast).toBeNull();
		expect(body.proof).toBeNull();
		expect(body.onchain.ready).toBe(false);
		expect(body.onchain.reason).toMatch(/WATSONX/);
	});

	it('produces a governed proof when watsonx + wallet are configured', async () => {
		state.wxConfigured = true;
		state.walletConfigured = true;
		const { status, body } = await invoke({ url: `/api/ibm/attest?pool=${POOL}` });
		expect(status).toBe(200);
		expect(body.stats.direction).toBe('up');
		expect(body.governance.passed).toBe(true);
		expect(body.proof.digest).toMatch(/^[0-9a-f]{64}$/);
		expect(body.proof.claim.models.timeseries).toBe('ibm/granite-ttm-512-96-r2');
		expect(body.proof.claim.models.guardian).toBe(GUARDIAN_MODEL);
		// GET never writes on-chain, but it IS ready to.
		expect(body.onchain.submitted).toBe(false);
		expect(body.onchain.ready).toBe(true);
		expect(body.onchain.memo).toBe(body.proof.memo);
	});

	it('keeps the on-chain memo within Solana limits and embeds the digest', async () => {
		state.wxConfigured = true;
		const { body } = await invoke({ url: `/api/ibm/attest?pool=${POOL}` });
		expect(body.proof.memo.length).toBeLessThanOrEqual(180);
		expect(body.proof.memo).toContain(body.proof.digest.slice(0, 16));
		expect(body.proof.memo).toContain('granite-proof/1');
	});

	it('derives a deterministic digest for an identical claim', async () => {
		state.wxConfigured = true;
		state.walletConfigured = true;
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-06-03T00:00:00Z'));
		const a = await invoke({ url: `/api/ibm/attest?pool=${POOL}` });
		const b = await invoke({ url: `/api/ibm/attest?pool=${POOL}` });
		vi.useRealTimers();
		expect(a.body.proof.digest).toBe(b.body.proof.digest);
	});
});

describe('POST /api/ibm/attest (notarize)', () => {
	it('notarizes on-chain when Granite Guardian passes', async () => {
		state.wxConfigured = true;
		state.walletConfigured = true;
		state.guardianVerdict = 'No';
		const { status, body } = await invoke({ method: 'POST', body: { pool: POOL, submit: true } });
		expect(status).toBe(200);
		expect(body.onchain.submitted).toBe(true);
		expect(body.onchain.signature).toBe('SIG123');
		expect(body.onchain.explorer).toContain('SIG123');
		// self-transfer: the destination is the agent's OWN pubkey, so no value
		// leaves the wallet — only the proof memo is written.
		expect(state.sendSolArgs.to.toBase58()).toBe(ADDR);
		expect(state.sendSolArgs.lamports).toBe(1);
		expect(state.sendSolArgs.memo).toBe(body.proof.memo);
	});

	it('refuses to notarize (Guardian veto) when the narration is flagged', async () => {
		state.wxConfigured = true;
		state.walletConfigured = true;
		state.guardianVerdict = 'Yes';
		const { status, body } = await invoke({ method: 'POST', body: { pool: POOL, submit: true } });
		expect(status).toBe(200);
		expect(body.governance.passed).toBe(false);
		expect(body.onchain.submitted).toBe(false);
		expect(body.onchain.reason).toBe('vetoed_by_guardian');
		expect(state.sendSolArgs).toBeNull(); // never reached the chain
	});

	it('does not submit when the attester wallet is not configured', async () => {
		state.wxConfigured = true;
		state.walletConfigured = false;
		const { body } = await invoke({ method: 'POST', body: { pool: POOL, submit: true } });
		expect(body.onchain.submitted).toBe(false);
		expect(state.sendSolArgs).toBeNull();
	});
});
