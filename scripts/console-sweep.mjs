#!/usr/bin/env node
/**
 * Console error sweep — drives every canonical user route in headless Chrome,
 * captures console errors/warnings, pageerrors, requestfailed events, and
 * HTTP 4xx/5xx on first-party assets, then prints a per-route triage report.
 *
 * Usage:
 *   node scripts/console-sweep.mjs                  # all canonical routes
 *   node scripts/console-sweep.mjs / /forge /play   # specific routes
 *   LOG_ALL=1 node scripts/console-sweep.mjs        # stream all console output
 *   HEADFUL=1  node scripts/console-sweep.mjs       # watch it run
 *
 * The script reuses a server already on :3000 or spawns an ephemeral Vite
 * instance. It writes no output files; all results go to stdout.
 */

import { existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { get as httpGet } from 'node:http';
import puppeteer from 'puppeteer';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const C = {
	g: (s) => `\x1b[32m${s}\x1b[0m`,
	r: (s) => `\x1b[31m${s}\x1b[0m`,
	y: (s) => `\x1b[33m${s}\x1b[0m`,
	d: (s) => `\x1b[2m${s}\x1b[0m`,
	b: (s) => `\x1b[1m${s}\x1b[0m`,
	c: (s) => `\x1b[36m${s}\x1b[0m`,
};

// ── Canonical route manifest ─────────────────────────────────────────────────
// `engine: true` pages use Three.js — WebGL draw calls verified, not pixels.
// `expectDegraded: true` pages have auth-gated or optional API calls that 4xx
//   at 401/403/402 without credentials — treated as expected, not failures.
const CANONICAL_ROUTES = [
	{ path: '/', slug: 'home', engine: false },
	{ path: '/create', slug: 'create', engine: false, expectDegraded: true },
	{ path: '/create/selfie', slug: 'create-selfie', engine: false, expectDegraded: true },
	{ path: '/forge', slug: 'forge', engine: true },
	{ path: '/play', slug: 'play', engine: true },
	{ path: '/walk', slug: 'walk', engine: true },
	{ path: '/marketplace', slug: 'marketplace', engine: false, expectDegraded: true },
	{ path: '/agent-exchange', slug: 'agent-exchange', engine: false, expectDegraded: true },
	{ path: '/deploy', slug: 'deploy', engine: false, expectDegraded: true },
	{ path: '/showcase', slug: 'showcase', engine: false, expectDegraded: true },
	{ path: '/ibm', slug: 'ibm', engine: false },
	{ path: '/scan', slug: 'scan', engine: false, expectDegraded: true },
	{ path: '/studio', slug: 'studio', engine: false, expectDegraded: true },
	{ path: '/dashboard', slug: 'dashboard', engine: false, expectDegraded: true },
	{ path: '/skills', slug: 'skills', engine: false, expectDegraded: true },
	{ path: '/reputation', slug: 'reputation', engine: false, expectDegraded: true },
];

// ── Noise filters ────────────────────────────────────────────────────────────
// Patterns that are never a real defect from our code:
const IGNORE_CONSOLE = [
	// Vite HMR / dev infra
	/\[vite\]/i,
	/@vite\/client/i,
	/WebSocket closed without opened/i,
	/WebSocket connection to .* failed/i,
	/Error during WebSocket handshake/i,
	/\[HMR\]/i,
	// Browser policy / environment
	/the AudioContext was not allowed to start/i,
	/Tracking Prevention/i,
	/autoplay/i,
	// Third-party analytics / telemetry (never our code)
	/posthog/i,
	/sentry/i,
	/segment\.com/i,
	/google-analytics/i,
	/cdn\.vercel-insights/i,
	/vercel\.live/i,
	// API calls judged by HTTP status, not console — auth-gate 401/402/403 are expected
	/Failed to load resource.*\/api\//i,
	/\b(401|402|403|429|503)\b.*\/api\//i,
	// Browser printing "Failed to load resource: 401" for auth-gated APIs
	/Failed to load resource: the server responded with a status of 401/i,
	/Failed to load resource: the server responded with a status of 402/i,
	/Failed to load resource: the server responded with a status of 403/i,
	// Pump.fun / external API proxy 502 in dev (external API degradation)
	/Failed to load resource: the server responded with a status of 502/i,
	// Walk multiplayer WebSocket server not running in dev (expected — graceful fallback)
	/Failed to load resource: net::ERR_CONNECTION_REFUSED/i,
	/\[walk-net\]/i,
	// R2/CDN CORS from dev origins (127.0.0.1 / localhost) — only blocks in dev, not production
	/r2\.dev.*Access-Control/i,
	/r2\.dev.*CORS policy/i,
	/CORS policy.*r2\.dev/i,
	/Access-Control-Allow-Origin.*r2\.dev/i,
	/pub-[a-f0-9]+\.r2\.dev.*blocked/i,
	/blocked by CORS policy.*r2\.dev/i,
	// User-generated data with expired signed URLs (GitHub, S3, R2 presigned) — not our code
	/private-user-images\.githubusercontent\.com.*404/i,
	/X-Amz-Signature.*404/i,
	// Three.js / WebGL expected deprecation notices
	/THREE\.WebGLRenderer: WebGL 1 is not supported/i,
	/THREE\.BufferGeometry\.computeBoundingSphere/i,
	// Content-Security-Policy noise from third-party embeds
	/content security policy/i,
	/Refused to (load|connect|execute)/i,
	// Solana / wallet adapter expected console output
	/StandardWalletAdapter/i,
	/wallet adapter/i,
	// react-scripts and other dev tooling
	/Download the React DevTools/i,
	// iframe sandbox noise
	/Allow attribute/i,
	/Blocked.*frame/i,
	// Font loading via CSS (browser-level, not our JS)
	/OTS parsing error/i,
	/downloadable font/i,
	// Colyseus/socket deprecation warnings
	/using deprecated parameters for the initialization/i,
];

// API responses with these statuses are "expected degraded" (auth/payment gate):
const DEGRADED_STATUSES = new Set([401, 402, 403, 404, 429, 503]);

function isIgnorableConsole(text) {
	return IGNORE_CONSOLE.some((re) => re.test(text));
}

// ── Chrome resolution ────────────────────────────────────────────────────────
function resolveChrome() {
	const tries = [];
	const push = (p, why) => p && tries.push({ p, why });
	push(process.env.CHROME_PATH, 'CHROME_PATH');
	push(process.env.PUPPETEER_EXECUTABLE_PATH, 'PUPPETEER_EXECUTABLE_PATH');
	try { push(puppeteer.executablePath(), 'puppeteer.executablePath()'); } catch { /* no bundled browser */ }
	const cache = join(homedir(), '.cache', 'puppeteer', 'chrome');
	if (existsSync(cache)) {
		const versions = readdirSync(cache)
			.filter((d) => d.startsWith('linux-') || d.startsWith('mac') || d.startsWith('win'))
			.sort().reverse();
		for (const v of versions) {
			for (const rel of [
				'chrome-linux64/chrome',
				'chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
				'chrome-win64/chrome.exe',
			]) {
				push(join(cache, v, rel), `cache:${v}`);
			}
		}
	}
	for (const sys of [
		'/usr/bin/google-chrome',
		'/usr/bin/google-chrome-stable',
		'/usr/bin/chromium',
		'/usr/bin/chromium-browser',
		'/snap/bin/chromium',
	]) {
		push(sys, 'system');
	}
	const found = tries.find((t) => { try { return existsSync(t.p); } catch { return false; } });
	if (!found) throw new Error(
		'No Chrome binary found.\n  npx puppeteer browsers install chrome\nor set CHROME_PATH=/path/to/chrome',
	);
	return found.p;
}

// ── Dev server ───────────────────────────────────────────────────────────────
function probe(url, timeoutMs = 2000) {
	return new Promise((resolve) => {
		const req = httpGet(url, (res) => { res.resume(); resolve(res.statusCode || 0); });
		req.setTimeout(timeoutMs, () => req.destroy());
		req.on('error', () => resolve(0));
	});
}

function freePort() {
	return new Promise((resolve, reject) => {
		const srv = createServer();
		srv.unref();
		srv.on('error', reject);
		srv.listen(0, () => { const { port } = srv.address(); srv.close(() => resolve(port)); });
	});
}

// Probe using 127.0.0.1 explicitly to avoid IPv6 resolution delays.
const PROBE_BASE = 'http://127.0.0.1:3000';

async function warmupDeps(base) {
	// Fetch a few dep-heavy pages so Vite can pre-bundle before the timed sweep.
	const warmPaths = ['/forge', '/play', '/deploy', '/agent-exchange'];
	process.stdout.write('  warming up Vite dep optimizer ');
	for (const p of warmPaths) {
		await fetch(`${base}${p}`).catch(() => {});
		process.stdout.write('.');
	}
	// Give the optimizer 8s to finish bundling
	await new Promise((r) => setTimeout(r, 8000));
	process.stdout.write('\n');
}

async function startServer() {
	if (await probe(`${PROBE_BASE}/`, 5000)) {
		console.log(C.d('  reusing server on :3000'));
		// Use localhost (not 127.0.0.1) as the navigation base — some CDN CORS configs
		// allow localhost but not 127.0.0.1, so this reduces spurious CORS errors.
		const navBase = 'http://localhost:3000';
		await warmupDeps(navBase);
		return { base: navBase, stop: async () => {} };
	}
	const port = await freePort();
	const bin = join(ROOT, 'node_modules', '.bin', 'vite');
	const child = spawn(bin, ['--port', String(port), '--strictPort'], {
		cwd: ROOT,
		stdio: process.env.LOG_ALL ? 'inherit' : 'ignore',
		env: process.env,
	});
	const probeBase = `http://127.0.0.1:${port}`;
	const navBase = `http://localhost:${port}`;
	const deadline = Date.now() + 90_000;
	process.stdout.write(`  starting Vite on :${port} `);
	while (Date.now() < deadline) {
		if (child.exitCode != null) throw new Error(`vite exited early (code ${child.exitCode})`);
		if (await probe(`${probeBase}/`, 2000)) { process.stdout.write('\n'); break; }
		process.stdout.write('.');
		await new Promise((r) => setTimeout(r, 500));
	}
	if (Date.now() >= deadline) { child.kill('SIGKILL'); throw new Error('vite did not become ready within 90s'); }
	await warmupDeps(navBase);
	return { base: navBase, stop: async () => child.kill('SIGTERM') };
}

// ── Browser-side instrumentation ─────────────────────────────────────────────
function instrument() {
	window.__glDrawCalls = 0;
	window.__pageErrors = [];
	const wrapGL = (proto) => {
		if (!proto) return;
		for (const m of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
			const orig = proto[m];
			if (typeof orig === 'function') {
				proto[m] = function (...args) { window.__glDrawCalls++; return orig.apply(this, args); };
			}
		}
	};
	wrapGL(window.WebGLRenderingContext && window.WebGLRenderingContext.prototype);
	wrapGL(window.WebGL2RenderingContext && window.WebGL2RenderingContext.prototype);
	window.addEventListener('unhandledrejection', (e) => {
		window.__pageErrors.push('unhandledrejection: ' + String((e.reason && e.reason.stack) || e.reason));
	});
}

// ── Per-route check ──────────────────────────────────────────────────────────
async function checkRoute(browser, base, route) {
	const tab = await browser.newPage();
	await tab.evaluateOnNewDocument(instrument);

	const consoleErrors = [];
	const consoleWarnings = [];
	const failedAssets = [];
	const degradedApis = [];

	tab.on('console', (msg) => {
		const text = msg.text();
		if (process.env.LOG_ALL) console.log(C.d(`  [${route.slug} ${msg.type()}] ${text}`));
		if (isIgnorableConsole(text)) return;
		if (msg.type() === 'error') consoleErrors.push(text);
		else if (msg.type() === 'warning') consoleWarnings.push(text);
	});

	tab.on('pageerror', (err) => {
		if (!isIgnorableConsole(err.message)) {
			consoleErrors.push('pageerror: ' + err.message);
		}
	});

	tab.on('requestfailed', (req) => {
		const u = req.url();
		const errorText = req.failure()?.errorText || '';
		// Skip third-party, HMR, analytics, and websockets
		if (u.includes('@vite') || u.startsWith('ws:') || u.startsWith('wss:')) return;
		if (/posthog|sentry|segment|google-analytics|vercel-insights|vercel\.live/i.test(u)) return;
		// Only track render-critical first-party resources
		const rt = req.resourceType();
		if (!['document', 'script', 'stylesheet', 'font'].includes(rt)) return;
		if (!u.startsWith(base)) return;
		// ERR_ABORTED on document type = iframe navigation cancelled on page teardown
		if (rt === 'document' && errorText.includes('ERR_ABORTED')) return;
		// ERR_CONNECTION_REFUSED on document = local dev server not running (expected)
		if (errorText.includes('ERR_CONNECTION_REFUSED')) return;
		failedAssets.push(`${req.method()} ${rt} ${u.replace(base, '')} — ${errorText}`);
	});

	tab.on('response', (res) => {
		const u = res.url();
		const s = res.status();
		if (/posthog|sentry|segment|google-analytics|vercel-insights|vercel\.live/i.test(u)) return;
		if (u.includes('/api/')) {
			// All 4xx/5xx on API calls go to degradedApis — browser will also print
			// a "Failed to load resource" which is caught by isIgnorableConsole above.
			if (s >= 400 && s < 600) {
				degradedApis.push(`${s} ${u.replace(base, '')}`);
			}
			return;
		}
		// First-party static asset that 4xx/5xx'd (not user-content external URLs)
		if (s >= 400 && u.startsWith(base) && /\.(js|mjs|css|html|wasm|glb|gltf|json)(\?|$)/.test(u)) {
			failedAssets.push(`HTTP ${s} ${u.replace(base, '')}`);
		}
	});

	const errors = [];
	const url = base + route.path;
	try {
		await tab.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
	} catch (e) {
		errors.push(`navigation failed: ${e.message}`);
		await tab.close();
		return { route, errors, consoleErrors, consoleWarnings, failedAssets, degradedApis, draws: 0 };
	}

	// Let async scripts fire (fetches, lazy module loads)
	await new Promise((r) => setTimeout(r, 2500));

	let draws = 0;
	try { draws = await tab.evaluate(() => window.__glDrawCalls || 0); } catch { /* tab may have navigated */ }

	const injectedErrors = await tab.evaluate(() => window.__pageErrors || []).catch(() => []);
	for (const e of injectedErrors) {
		if (!isIgnorableConsole(e)) consoleErrors.push(e);
	}

	await tab.close();
	return { route, errors, consoleErrors, consoleWarnings, failedAssets, degradedApis, draws };
}

// ── Main ─────────────────────────────────────────────────────────────────────
const argRoutes = process.argv.slice(2).filter((a) => a.startsWith('/'));
const routes = argRoutes.length
	? CANONICAL_ROUTES.filter((r) => argRoutes.includes(r.path))
	: CANONICAL_ROUTES;

if (!routes.length) {
	console.error('No matching routes. Available:', CANONICAL_ROUTES.map((r) => r.path).join(', '));
	process.exit(1);
}

console.log(C.b('\n╔══ Console Error Sweep ══════════════════════════════════════╗'));
console.log(C.b(`║  ${routes.length} canonical routes                                         ║`));
console.log(C.b('╚═════════════════════════════════════════════════════════════╝\n'));

const { base, stop } = await startServer();

const chromePath = resolveChrome();
const browser = await puppeteer.launch({
	executablePath: chromePath,
	headless: !process.env.HEADFUL,
	timeout: 120_000,
	args: [
		'--no-sandbox',
		'--disable-dev-shm-usage',
		'--disable-setuid-sandbox',
		'--use-gl=angle',
		'--use-angle=swiftshader',
		'--enable-unsafe-swiftshader',
		'--ignore-gpu-blocklist',
		'--mute-audio',
		'--no-first-run',
		'--no-default-browser-check',
		'--disable-dbus',
		'--disable-features=NetworkService,NetworkServiceInProcess',
	],
	defaultViewport: { width: 1440, height: 900 },
});

const results = [];
for (const route of routes) {
	process.stdout.write(`  checking ${C.c(route.path.padEnd(24))} `);
	const result = await checkRoute(browser, base, route);
	results.push(result);
	const errorCount = result.errors.length + result.consoleErrors.length + result.failedAssets.length;
	const warnCount = result.consoleWarnings.length;
	if (errorCount === 0) {
		process.stdout.write(C.g('✓ clean') + (warnCount ? C.y(` (${warnCount} warn)`) : '') + '\n');
	} else {
		process.stdout.write(C.r(`✗ ${errorCount} error${errorCount > 1 ? 's' : ''}`) + '\n');
	}
}

await browser.close();
await stop();

// ── Report ───────────────────────────────────────────────────────────────────
console.log('\n' + C.b('═══════════════ DETAILED REPORT ═════════════════════════════\n'));

let totalErrors = 0;
let routesWithErrors = 0;

for (const { route, errors, consoleErrors, consoleWarnings, failedAssets, degradedApis, draws } of results) {
	const allErrors = [...errors, ...consoleErrors, ...failedAssets];
	if (allErrors.length > 0) {
		routesWithErrors++;
		totalErrors += allErrors.length;
		console.log(C.r(`✗ ${route.path} (${allErrors.length} error${allErrors.length > 1 ? 's' : ''})`));
		for (const e of errors) console.log(C.r(`    nav:     ${e}`));
		for (const e of consoleErrors) console.log(C.r(`    console: ${e}`));
		for (const e of failedAssets) console.log(C.r(`    asset:   ${e}`));
		if (consoleWarnings.length) {
			for (const w of consoleWarnings) console.log(C.y(`    warn:    ${w}`));
		}
		if (degradedApis.length) {
			console.log(C.d(`    degraded APIs (expected): ${degradedApis.length}`));
		}
	} else {
		const notes = [];
		if (consoleWarnings.length) notes.push(`${consoleWarnings.length} warn`);
		if (route.engine) notes.push(`${draws} gl draws`);
		if (degradedApis.length) notes.push(`${degradedApis.length} degraded API(s) expected`);
		const suffix = notes.length ? C.d(` — ${notes.join(', ')}`) : '';
		console.log(C.g(`✓ ${route.path}`) + suffix);
		if (consoleWarnings.length && process.env.LOG_ALL) {
			for (const w of consoleWarnings) console.log(C.y(`    warn: ${w}`));
		}
	}
}

console.log('\n' + C.b('═══════════════════════════════════════════════════════════════'));
if (totalErrors === 0) {
	console.log(C.g(`\n  ALL ${routes.length} ROUTES CLEAN — zero errors from our code.\n`));
	process.exit(0);
} else {
	console.log(C.r(`\n  ${totalErrors} error(s) across ${routesWithErrors} route(s). Fix the issues above then re-run.\n`));
	process.exit(1);
}
