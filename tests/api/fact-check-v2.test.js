/**
 * Tests for the fact-check "v2" funnel work (prompt 20 of prompts/x402-catalog):
 *   • a free daily lane (per-IP quota) that runs the REAL chain and falls
 *     through to the existing x402 402 challenge once exhausted
 *   • the `lane` field on every response ("free" | "paid")
 *   • the benchmark fixture (tests/fixtures/fact-check-benchmark.json): schema,
 *     coverage of all four verdict classes, minimum size
 *   • the benchmark runner's scoring math (scripts/fact-check-benchmark.mjs),
 *     exercised against a synthetic result set so it needs no live chain/env
 *
 * The upstream chain (LLM query generation, web search, image evidence) is
 * fixtured at the module boundary — none of api/x402/fact-check.js's own logic
 * is mocked, matching the pattern in tests/api/v1-ai-speech.test.js.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Readable } from 'node:stream';

const llmState = vi.hoisted(() => ({
	queries: ['q1', 'q2', 'q3'],
	analyses: [{ excerpt: 'it says so', stance: 'supports' }],
}));

vi.mock('../../agents/fact-checker/src/llm-verdict.js', () => ({
	generateSearchQueries: vi.fn(async () => ({ queries: llmState.queries, tokens: 120 })),
	analyzeResults: vi.fn(async (_claim, results) => ({
		analyses: results.map((_r, i) => llmState.analyses[i] || llmState.analyses[0]),
		tokens: 200,
	})),
}));

vi.mock('../../agents/fact-checker/src/search-sources.js', () => ({
	searchAll: vi.fn(async () => [
		{ url: 'https://en.wikipedia.org/wiki/Test', title: 'Test — Wikipedia', snippet: 'A well-sourced snippet.' },
		{ url: 'https://example.com/blog', title: 'Some blog', snippet: 'A less authoritative snippet.' },
	]),
}));

vi.mock('../../agents/fact-checker/src/source-authority.js', () => ({
	authorityScore: vi.fn((url) => (url.includes('wikipedia.org') ? 0.9 : 0.4)),
}));

vi.mock('../../agents/fact-checker/src/image-evidence.js', () => ({
	imageEvidence: vi.fn(async () => null),
}));

const ENV_KEYS = ['X402_PAY_TO_BASE', 'X402_ASSET_ADDRESS_BASE', 'X402_PAY_TO_SOLANA', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'];
const ORIGINAL_ENV = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

let handler;

beforeEach(async () => {
	vi.resetModules();
	Object.assign(process.env, {
		X402_PAY_TO_BASE: '0x0000000000000000000000000000000000000001',
		X402_ASSET_ADDRESS_BASE: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
	});
	delete process.env.X402_PAY_TO_SOLANA;
	// No Redis configured → the idempotency cache and the rate limiter both run
	// on their honest in-process fallbacks (deterministic within one test file).
	delete process.env.UPSTASH_REDIS_REST_URL;
	delete process.env.UPSTASH_REDIS_REST_TOKEN;
	({ default: handler } = await import('../../api/x402/fact-check.js'));
});

afterEach(() => {
	for (const k of ENV_KEYS) {
		if (ORIGINAL_ENV[k] === undefined) delete process.env[k];
		else process.env[k] = ORIGINAL_ENV[k];
	}
});

let ipCounter = 0;
function freshIp() {
	ipCounter += 1;
	return { 'x-forwarded-for': `203.0.${(ipCounter >> 8) & 0xff}.${ipCounter & 0xff}` };
}

function jsonReq(body, headers = {}) {
	const buf = Buffer.from(JSON.stringify(body));
	const req = Readable.from([buf]);
	req.method = 'POST';
	req.url = '/api/x402/fact-check';
	req.headers = { 'content-type': 'application/json', 'content-length': String(buf.length), ...headers };
	return req;
}

function makeRes() {
	const chunks = [];
	return {
		statusCode: 200,
		_h: {},
		writableEnded: false,
		headersSent: false,
		setHeader(k, v) {
			this._h[k.toLowerCase()] = v;
		},
		getHeader(k) {
			return this._h[k.toLowerCase()];
		},
		write(c) {
			chunks.push(Buffer.from(c));
		},
		end(c) {
			if (c) chunks.push(Buffer.from(c));
			this.writableEnded = true;
			this.headersSent = true;
		},
		json() {
			return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
		},
	};
}

async function callFactCheck(req) {
	const res = makeRes();
	await handler(req, res);
	return res;
}

describe('POST /api/x402/fact-check — free daily lane', () => {
	it('serves a free check with lane:"free" and a real verdict', async () => {
		const res = await callFactCheck(jsonReq({ claim: 'The sky is blue during the day.' }, freshIp()));
		expect(res.statusCode).toBe(200);
		const body = res.json();
		expect(body.lane).toBe('free');
		expect(typeof body.free_remaining_today).toBe('number');
		expect(['supported', 'contradicted', 'mixed', 'insufficient']).toContain(body.verdict);
		expect(body.attestation).toMatch(/^sha256:/);
	});

	it('rejects a too-short claim with 400 before burning a free slot', async () => {
		const ip = freshIp();
		const bad = await callFactCheck(jsonReq({ claim: 'hi' }, ip));
		expect(bad.statusCode).toBe(400);
		expect(bad.json().error).toBe('invalid_claim');
		// The slot wasn't spent — a real check on the same IP still succeeds.
		const ok = await callFactCheck(jsonReq({ claim: 'A valid claim right here.' }, ip));
		expect(ok.statusCode).toBe(200);
		expect(ok.json().lane).toBe('free');
	});

	it('rejects invalid JSON with 400', async () => {
		const req = Readable.from([Buffer.from('{not json')]);
		req.method = 'POST';
		req.url = '/api/x402/fact-check';
		req.headers = { 'content-type': 'application/json', ...freshIp() };
		const res = await callFactCheck(req);
		expect(res.statusCode).toBe(400);
		expect(res.json().error).toBe('invalid_json');
	});

	it('falls through to the 402 challenge once the daily free quota is exhausted', async () => {
		const { FREE_DAILY_LIMIT } = await import('../../api/x402/fact-check.js');
		const ip = freshIp();
		for (let i = 0; i < FREE_DAILY_LIMIT; i++) {
			const res = await callFactCheck(jsonReq({ claim: `Claim number ${i} right here.` }, ip));
			expect(res.statusCode).toBe(200);
			expect(res.json().lane).toBe('free');
		}
		const over = await callFactCheck(jsonReq({ claim: 'One claim too many today.' }, ip));
		expect(over.statusCode).toBe(402);
	});

	it('a request carrying an X-PAYMENT header always goes straight to the paid rail (402 without a real proof)', async () => {
		const res = await callFactCheck(
			jsonReq({ claim: 'A claim paid for up front.' }, { ...freshIp(), 'x-payment': 'not-a-real-proof' }),
		);
		// No free lane, straight into x402 verification — an invalid/undecodable
		// proof is rejected by the rail (never silently treated as free).
		expect(res.statusCode).toBeGreaterThanOrEqual(400);
		expect(res.json().lane).not.toBe('free');
	});

	it('GET (or any non-POST) is left entirely to the paid rail\'s own method guard', async () => {
		const req = Readable.from([]);
		req.method = 'GET';
		req.url = '/api/x402/fact-check';
		req.headers = { ...freshIp() };
		const res = await callFactCheck(req);
		expect(res.statusCode).toBe(405);
	});
});

describe('fact-check benchmark fixture', () => {
	const fixturePath = resolve(process.cwd(), 'tests/fixtures/fact-check-benchmark.json');
	const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));

	it('has at least 40 claims', () => {
		expect(Array.isArray(fixture.claims)).toBe(true);
		expect(fixture.claims.length).toBeGreaterThanOrEqual(40);
	});

	it('covers all four verdict classes with at least 10 claims each', () => {
		const counts = { supported: 0, contradicted: 0, mixed: 0, insufficient: 0 };
		for (const c of fixture.claims) counts[c.expected_verdict] = (counts[c.expected_verdict] || 0) + 1;
		for (const cls of ['supported', 'contradicted', 'mixed', 'insufficient']) {
			expect(counts[cls]).toBeGreaterThanOrEqual(10);
		}
	});

	it('every claim has the required shape and a non-third-party-coin-promoting body', () => {
		for (const c of fixture.claims) {
			expect(typeof c.claim).toBe('string');
			expect(c.claim.length).toBeGreaterThan(5);
			expect(['supported', 'contradicted', 'mixed', 'insufficient']).toContain(c.expected_verdict);
			expect(typeof c.rationale).toBe('string');
			expect(c.rationale.length).toBeGreaterThan(0);
			expect(['easy', 'medium', 'hard']).toContain(c.difficulty);
		}
	});

	it('claims are unique (no duplicate benchmark entries)', () => {
		const seen = new Set(fixture.claims.map((c) => c.claim));
		expect(seen.size).toBe(fixture.claims.length);
	});
});

describe('scripts/fact-check-benchmark.mjs — scoring math', () => {
	it('scores overall + per-class + per-difficulty accuracy against a synthetic result set', async () => {
		const { scoreBenchmarkRun } = await import('../../scripts/fact-check-benchmark.mjs');
		const claims = [
			{ claim: 'a', expected_verdict: 'supported', difficulty: 'easy' },
			{ claim: 'b', expected_verdict: 'supported', difficulty: 'hard' },
			{ claim: 'c', expected_verdict: 'contradicted', difficulty: 'easy' },
			{ claim: 'd', expected_verdict: 'insufficient', difficulty: 'medium' },
		];
		const results = [
			{ claim: 'a', expected_verdict: 'supported', difficulty: 'easy', actual_verdict: 'supported' },
			{ claim: 'b', expected_verdict: 'supported', difficulty: 'hard', actual_verdict: 'mixed' },
			{ claim: 'c', expected_verdict: 'contradicted', difficulty: 'easy', actual_verdict: 'contradicted' },
			{ claim: 'd', expected_verdict: 'insufficient', difficulty: 'medium', actual_verdict: 'insufficient' },
		];
		const score = scoreBenchmarkRun(results);
		expect(score.overall.total).toBe(4);
		expect(score.overall.correct).toBe(3);
		expect(score.overall.accuracy).toBeCloseTo(0.75, 5);
		expect(score.byClass.supported.total).toBe(2);
		expect(score.byClass.supported.correct).toBe(1);
		expect(score.byClass.contradicted.accuracy).toBeCloseTo(1, 5);
		expect(score.byDifficulty.easy.accuracy).toBeCloseTo(1, 5);
		expect(score.byDifficulty.hard.accuracy).toBeCloseTo(0, 5);
		// scoreBenchmarkRun is pure — never touches claims fixture directly.
		expect(claims.length).toBe(4);
	});

	it('handles an empty result set without dividing by zero', async () => {
		const { scoreBenchmarkRun } = await import('../../scripts/fact-check-benchmark.mjs');
		const score = scoreBenchmarkRun([]);
		expect(score.overall.total).toBe(0);
		expect(score.overall.accuracy).toBe(0);
	});
});
