#!/usr/bin/env node
/**
 * Build the package.
 *
 * Two artifacts:
 *   dist/x402-modal.mjs   — ESM, side-effect-free. The public API (`pay`,
 *                           `configure`, `init`, `CheckoutModal`, …) with no
 *                           `window` / auto-bind on import. For bundler + npm
 *                           consumers. The dynamic CDN imports (Solana web3.js,
 *                           a keccak for EVM SIWX) are left as runtime imports.
 *   dist/x402.global.js   — IIFE, minified. Reads `data-x402-*` off its own
 *                           <script> tag, auto-binds `[data-x402-endpoint]`,
 *                           and exposes `window.X402`. The drop-in CDN <script>.
 */

import { build } from 'esbuild';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, 'dist');
mkdirSync(outDir, { recursive: true });

// Build a banner from package metadata so it stays correct without edits.
const pkg = JSON.parse(readFileSync(resolve(here, 'package.json'), 'utf8'));
const banner = `/*! ${pkg.name} v${pkg.version}${pkg.license ? ` | ${pkg.license}` : ''} */`;

const common = {
	bundle: true,
	sourcemap: true,
	target: ['es2020'],
	logLevel: 'info',
	banner: { js: banner },
	// The Solana web3.js / @noble/hashes imports are runtime CDN URLs resolved in
	// the browser — never bundle them.
	external: ['https://*'],
};

// 1) ESM core, side-effect-free.
await build({
	...common,
	entryPoints: [resolve(here, 'src/x402-modal.js')],
	format: 'esm',
	outfile: resolve(outDir, 'x402-modal.mjs'),
});

// 2) Standalone IIFE drop-in <script>, auto-init + window.X402.
await build({
	...common,
	entryPoints: [resolve(here, 'src/global.js')],
	format: 'iife',
	globalName: 'X402Modal',
	minify: true,
	outfile: resolve(outDir, 'x402.global.js'),
});

console.log(`[${pkg.name}] built dist/x402-modal.mjs, dist/x402.global.js`);
