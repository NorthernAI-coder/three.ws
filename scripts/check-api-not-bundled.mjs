#!/usr/bin/env node
/**
 * Guards against the documented `npx vercel build` footgun: it overwrites the
 * hand-written api/*.js source files in place with huge esbuild bundles. A
 * bundle committed by accident is near-impossible to review and impossible to
 * patch — so fail loudly the moment one lands.
 *
 * Detection: esbuild's CJS/ESM interop preamble emits these markers near the
 * top of every bundle. Real source never contains them. We scan only the first
 * slice of each file so a legitimate string mentioning one of these tokens deep
 * in a file can't trip the check.
 *
 * Run by CI (.github/workflows/ci.yml) and safe to run by hand:
 *   node scripts/check-api-not-bundled.mjs
 * Exits 0 when clean, 1 (listing offenders) when a bundle is detected.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const API_DIR = fileURLToPath(new URL('../api', import.meta.url));
const MARKERS = ['__defProp', 'createRequire(', '__toESM(', '__toCommonJS('];
const HEAD_BYTES = 4096; // esbuild's preamble always sits at the very top

/** @returns {string[]} every .js path under dir, recursively */
function jsFiles(dir) {
	const out = [];
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) out.push(...jsFiles(full));
		else if (entry.endsWith('.js')) out.push(full);
	}
	return out;
}

const offenders = [];
for (const file of jsFiles(API_DIR)) {
	const head = readFileSync(file, 'utf8').slice(0, HEAD_BYTES);
	const hit = MARKERS.find((m) => head.includes(m));
	if (hit) offenders.push({ file, hit });
}

if (offenders.length) {
	console.error('\n✖ esbuild bundle(s) detected in api/ — these clobbered the source files:\n');
	for (const { file, hit } of offenders) {
		console.error(`  ${file.replace(API_DIR, 'api')}  (marker: ${hit})`);
	}
	console.error('\nRecover the source with:  git restore -- api/ public/\n');
	process.exit(1);
}

console.log(`✓ api/ is clean — no esbuild bundles among the source files`);
