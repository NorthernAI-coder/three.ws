// Unit tests for the /admin/ring read model — api/admin/ring-dashboard.js.
//
// The aggregation + threshold helpers are pure (fixture rows → shaped payload,
// no I/O), so these tests pin the pulse status colors, the zero-filled pulse
// strip, activity classification/status, fee efficiency math, endpoint staleness,
// and the integrity source split. A second block asserts the page is wired into
// the router (vercel.json rewrite, vite build input + dev alias) and that the
// admin surface links to it — the acceptance criteria for "findable".

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
	pulseStatus,
	buildPulseStrip,
	classifyKind,
	activityStatus,
	slugFromUrl,
	endpointAge,
	buildFeesPanel,
	splitIntegrity,
	FEE_FLOOR_LAMPORTS,
	ENDPOINT_STALE_MINUTES,
} from '../api/_lib/x402/ring-dashboard-model.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const p = (...parts) => resolve(__dirname, '..', ...parts);

describe('ring dashboard — pulse status thresholds', () => {
	it('≤1 min is green (per-minute tick alive)', () => {
		expect(pulseStatus(0)).toBe('green');
		expect(pulseStatus(1)).toBe('green');
		expect(pulseStatus(0.5)).toBe('green');
	});
	it('>1 and ≤5 min is amber (tick degraded)', () => {
		expect(pulseStatus(2)).toBe('amber');
		expect(pulseStatus(5)).toBe('amber');
	});
	it('>5 min is red (ring stalled)', () => {
		expect(pulseStatus(6)).toBe('red');
		expect(pulseStatus(120)).toBe('red');
	});
	it('null (no settle on record) is red', () => {
		expect(pulseStatus(null)).toBe('red');
		expect(pulseStatus(undefined)).toBe('red');
	});
});

describe('ring dashboard — pulse strip zero-fill', () => {
	const now = new Date('2026-07-03T12:00:30Z');

	it('always returns a full 60-minute window, oldest → newest', () => {
		const strip = buildPulseStrip([], now);
		expect(strip).toHaveLength(60);
		expect(new Date(strip[0].ts).getTime()).toBeLessThan(new Date(strip[59].ts).getTime());
		expect(strip.every((m) => m.count === 0)).toBe(true);
	});

	it('places settlement counts in the correct minute bucket and zero-fills gaps', () => {
		const rows = [
			{ minute: '2026-07-03T12:00:00Z', n: 3, fee: 15000 },
			{ minute: '2026-07-03T11:58:00Z', n: 1, fee: 5000 },
		];
		const strip = buildPulseStrip(rows, now);
		const last = strip[strip.length - 1]; // current minute (12:00)
		expect(last.count).toBe(3);
		expect(last.fee_lamports).toBe(15000);
		// 11:59 has no row → visible gap
		expect(strip[strip.length - 2].count).toBe(0);
		// 11:58 → 1 settle
		expect(strip[strip.length - 3].count).toBe(1);
	});
});

describe('ring dashboard — activity classification', () => {
	it('classifies kind off the endpoint path', () => {
		expect(classifyKind('/api/x402/ring-settle')).toBe('settle');
		expect(classifyKind('/api/x402/dance-tip')).toBe('tip');
		expect(classifyKind('/api/x402/crypto-intel')).toBe('intel');
		expect(classifyKind('/api/x402/agent-reputation')).toBe('intel');
		expect(classifyKind('/api/x402/skill-checkout')).toBe('commerce');
		expect(classifyKind('/api/x402/did')).toBe('service');
		expect(classifyKind('')).toBe('service');
	});

	it('marks paid vs ok vs skipped vs failed', () => {
		expect(activityStatus({ success: true, amount_atomic: 1000 })).toBe('paid');
		expect(activityStatus({ success: true, amount_atomic: 0 })).toBe('ok');
		expect(activityStatus({ success: false, error_msg: 'cap_would_exceed' })).toBe('skipped');
		expect(activityStatus({ success: false, error_msg: 'fee_ceiling_exceeded:10500' })).toBe(
			'skipped',
		);
		expect(activityStatus({ success: false, error_msg: 'fee_wallet_below_floor:1<2' })).toBe(
			'skipped',
		);
		expect(activityStatus({ success: false, error_msg: 'RPC timeout' })).toBe('failed');
	});

	it('derives a short slug from a full URL or a path', () => {
		expect(slugFromUrl('https://three.ws/api/x402/crypto-intel?x=1')).toBe('crypto-intel');
		expect(slugFromUrl('/api/x402/dance-tip')).toBe('dance-tip');
		expect(slugFromUrl('')).toBe('—');
	});
});

describe('ring dashboard — endpoint staleness', () => {
	const now = new Date('2026-07-03T12:00:00Z');
	it('flags stale past the 2h hourly-coverage guarantee', () => {
		const fresh = endpointAge(new Date('2026-07-03T11:30:00Z'), now);
		expect(fresh.stale).toBe(false);
		expect(fresh.age_minutes).toBe(30);

		const stale = endpointAge(new Date('2026-07-03T09:00:00Z'), now);
		expect(stale.stale).toBe(true);
		expect(stale.age_minutes).toBe(180);
	});
	it('never-called endpoints are stale with null age', () => {
		expect(endpointAge(null, now)).toEqual({ age_minutes: null, stale: true });
	});
	it('exposes the 120-minute threshold constant', () => {
		expect(ENDPOINT_STALE_MINUTES).toBe(120);
	});
});

describe('ring dashboard — fee efficiency', () => {
	it('computes avg fee, floor ratio, SOL/$100, and budget usage', () => {
		const fees = buildFeesPanel({
			feeLamports24h: 50_000, // 10 settles @ 5000
			settles24h: 10,
			grossUsdc24h: 1000, // $1000 gross
			burnedTodayLamports: 30_000,
			budgetLamports: 100_000,
			solUsd: 150,
		});
		expect(fees.floor_lamports).toBe(FEE_FLOOR_LAMPORTS);
		expect(fees.avg_lamports_per_settle).toBe(5000);
		expect(fees.floor_ratio).toBe(1); // exactly at the 1-sig floor
		// 50000 lamports = 0.00005 SOL over $1000 → per $100 = 0.000005
		expect(fees.sol_per_100_usd).toBeCloseTo(0.000005, 9);
		expect(fees.budget_used_pct).toBe(30);
		expect(fees.over_budget).toBe(false);
	});

	it('flags over-budget burn', () => {
		const fees = buildFeesPanel({
			feeLamports24h: 0,
			settles24h: 0,
			grossUsdc24h: 0,
			burnedTodayLamports: 120_000,
			budgetLamports: 100_000,
		});
		expect(fees.over_budget).toBe(true);
		expect(fees.budget_used_pct).toBe(120);
		expect(fees.avg_lamports_per_settle).toBeNull();
		expect(fees.sol_per_100_usd).toBeNull();
	});

	it('handles an unset daily budget without dividing by zero', () => {
		const fees = buildFeesPanel({ budgetLamports: null });
		expect(fees.budget_used_pct).toBeNull();
		expect(fees.over_budget).toBe(false);
	});
});

describe('ring dashboard — integrity source split', () => {
	it('separates ring leak-scan sources from revenue reconciliation', () => {
		const split = splitIntegrity([
			{ source: 'x402_ring_settle', total: 40, open: 2, last_checked: '2026-07-03T11:00:00Z' },
			{ source: 'x402_ring_sweep', total: 10, open: 0, last_checked: '2026-07-03T11:30:00Z' },
			{ source: 'autonomous_log', total: 100, open: 1, last_checked: '2026-07-03T10:00:00Z' },
			{ source: 'payment_intent', total: 5, open: 0, last_checked: '2026-07-03T09:00:00Z' },
		]);
		expect(split.leak_scan.sources).toBe(2);
		expect(split.leak_scan.total).toBe(50);
		expect(split.leak_scan.open).toBe(2);
		expect(split.leak_scan.last_checked_at).toBe('2026-07-03T11:30:00.000Z');
		expect(split.reconcile.sources).toBe(2);
		expect(split.reconcile.open).toBe(1);
	});
	it('is all-zero for an empty verdict set', () => {
		const split = splitIntegrity([]);
		expect(split.leak_scan.open).toBe(0);
		expect(split.reconcile.open).toBe(0);
		expect(split.leak_scan.last_checked_at).toBeNull();
	});
});

describe('ring dashboard — routing + navigation wiring', () => {
	const vercel = JSON.parse(readFileSync(p('vercel.json'), 'utf8'));
	const viteConfig = readFileSync(p('vite.config.js'), 'utf8');
	const adminIndex = readFileSync(p('public/admin/index.html'), 'utf8');
	const pages = JSON.parse(readFileSync(p('data/pages.json'), 'utf8'));

	it('has vercel rewrites for /admin/ring (with and without trailing slash)', () => {
		const routes = vercel.routes || vercel.rewrites || [];
		const dests = routes.filter((r) => r.src === '/admin/ring' || r.src === '/admin/ring/');
		expect(dests).toHaveLength(2);
		expect(dests.every((r) => r.dest === '/admin/ring.html')).toBe(true);
	});

	it('registers the page as a vite build input and dev alias', () => {
		expect(viteConfig).toContain("'admin-ring': resolve(__dirname, 'pages/admin/ring.html')");
		expect(viteConfig).toContain("'/admin/ring': resolve(root, 'pages/admin/ring.html')");
	});

	it('is linked from the admin surface so it is findable', () => {
		expect(adminIndex).toContain('href="/admin/ring"');
	});

	it('is registered in pages.json as an admin, noindex surface', () => {
		const all = pages.sections.flatMap((s) => s.pages);
		const entry = all.find((p2) => p2.path === '/admin/ring');
		expect(entry).toBeTruthy();
		expect(entry.indexable).toBe(false);
		expect(entry.auth).toBe('admin');
	});

	it('ships the page, controller, and endpoint files', () => {
		for (const f of [
			'pages/admin/ring.html',
			'src/admin-ring.js',
			'src/admin-ring.css',
			'api/admin/ring-dashboard.js',
		]) {
			expect(() => readFileSync(p(f), 'utf8')).not.toThrow();
		}
	});
});
