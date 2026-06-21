#!/usr/bin/env node
/**
 * Critical-path test gate for the deploy build.
 *
 * GitHub Actions is unavailable on this account, so the Vercel deploy build is
 * the only automated checkpoint (see scripts/build-vercel.mjs). The full vitest
 * suite (`npm test`) drives a real browser via Playwright and includes specs
 * that need live DB/RPC credentials — too heavy and too environment-dependent to
 * gate every deploy on. This runs a curated subset of fast, offline-safe,
 * mock-backed unit tests that cover the highest-consequence logic — money-path
 * confirmation handling, the HTTP cache/error boundary, custody spend guards,
 * payment verification — so a regression in any of them FAILS THE DEPLOY instead
 * of shipping silently.
 *
 * Keep this list tight and green-offline. When you add a unit test that protects
 * a money/auth invariant and runs without external credentials, add it here.
 * Anything needing a live DB/RPC/browser belongs in `npm test`, not the gate.
 */
import { execFileSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const GATE_TESTS = [
	'tests/solana-confirm.test.js',        // reverted-tx → throw (no false-success money path)
	'tests/http-cache-control.test.js',    // cache/no-store boundary; errors never cached
	'tests/agent-custody-guards.test.js',  // custodial ownership / spend guards
	'tests/agent-wallet-vanity.test.js',   // vanity flow guards
	'tests/api/x402.test.js',              // x402 payment manifest/verify surface
	'tests/api/three-token-leaderboard.test.js', // holder snapshot read path
	'tests/api/healthz.test.js',           // smoke
];

console.log(`[test-gate] running ${GATE_TESTS.length} critical-path test files…`);
try {
	execFileSync('npx', ['vitest', 'run', ...GATE_TESTS], {
		cwd: ROOT,
		stdio: 'inherit',
		env: process.env,
	});
	console.log('[test-gate] ✓ all critical-path tests passed');
} catch {
	console.error('[test-gate] ✗ critical-path tests failed — blocking deploy');
	process.exit(1);
}
