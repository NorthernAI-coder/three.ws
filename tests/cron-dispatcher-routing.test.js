import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// The cron dispatcher (api/cron/[name].js) is reachable in production ONLY
// through the explicit `/api/cron/(…)` entry in vercel.json's legacy `routes`
// array — Vercel does not auto-route dynamic [name] segments when `routes` is
// present. A handler added to the map without a matching route name 404s in
// production while working fine locally; that gap silently killed every
// dispatcher job (payouts, subscriptions, buybacks, pumpfun monitors) until
// July 2026. These tests pin the two lists together.

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function handlerNames() {
	const src = readFileSync(join(ROOT, 'api/cron/[name].js'), 'utf8');
	const block = src.match(/const HANDLERS = \{([\s\S]*?)\n\};/);
	expect(block, 'HANDLERS map not found in api/cron/[name].js').toBeTruthy();
	return [...new Set([...block[1].matchAll(/'([a-z0-9-]+)':/g)].map((m) => m[1]))];
}

function cronRoute() {
	const vercel = JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8'));
	return (vercel.routes || []).find(
		(r) => typeof r.src === 'string' && r.src.startsWith('/api/cron/(') && r.dest === '/api/cron/[name]?name=$1',
	);
}

describe('cron dispatcher routing (vercel.json ↔ [name].js)', () => {
	it('the /api/cron/(…) → [name] route exists', () => {
		expect(cronRoute(), 'missing /api/cron/(…) → /api/cron/[name]?name=$1 entry in vercel.json routes').toBeTruthy();
	});

	it('every HANDLERS job name is routable (no silent production 404s)', () => {
		const route = cronRoute();
		const rx = new RegExp(`^${route.src}$`);
		const unrouted = handlerNames().filter((n) => !rx.test(`/api/cron/${n}`));
		expect(unrouted, `add these to the /api/cron/(…) route alternation in vercel.json: ${unrouted.join(', ')}`).toEqual([]);
	});

	it('every routed name has a handler (no dead route entries)', () => {
		const route = cronRoute();
		const names = route.src.match(/\(([^)]*)\)/)[1].split('|');
		const handlers = new Set(handlerNames());
		const dead = names.filter((n) => !handlers.has(n));
		expect(dead, `these routed names have no HANDLERS entry: ${dead.join(', ')}`).toEqual([]);
	});

	it('the route never shadows a dedicated api/cron/*.js file', () => {
		const route = cronRoute();
		const rx = new RegExp(`^${route.src}$`);
		const dedicated = readdirSync(join(ROOT, 'api/cron'))
			.filter((f) => f.endsWith('.js') && f !== '[name].js')
			.map((f) => f.slice(0, -3));
		const shadowed = dedicated.filter((n) => rx.test(`/api/cron/${n}`));
		expect(shadowed, `route alternation shadows dedicated cron files: ${shadowed.join(', ')}`).toEqual([]);
	});
});
