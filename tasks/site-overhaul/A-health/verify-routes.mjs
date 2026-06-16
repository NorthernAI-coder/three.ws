#!/usr/bin/env node
// A07 route-integrity verifier.
//
// Flags two failure modes that produce dead pages / 404 routes in production:
//   (1) a vercel.json route whose literal .html dest has no build target
//   (2) a pages/*.html file that is NOT a Vite Rollup input (never built → any
//       route pointing at it 404s; the dev server's /<slug> fallback hides this)
//
// Run from the repo root:  node tasks/site-overhaul/A-health/verify-routes.mjs
// Exits non-zero if either check fails, so it can gate CI.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

// --- Rollup inputs declared in vite.config.js (the prod build's source of truth) ---
// `resolve(__dirname, '<pages|public>/<x>.html')` only ever appears in the
// rollup input map (the flatten/promote plugins use dist/ paths), so scanning
// the whole file is robust against the input block's exact whitespace.
const cfg = readFileSync(resolve(ROOT, 'vite.config.js'), 'utf8');
const inputs = new Set();
const re = /resolve\(__dirname,\s*'((?:pages|public)\/[^']+\.html)'\)/g;
let m;
while ((m = re.exec(cfg))) inputs.add(m[1]);
// dashboard-next sub-pages are auto-discovered as inputs at build time
const dnDir = resolve(ROOT, 'pages/dashboard-next');
if (existsSync(dnDir))
	for (const f of readdirSync(dnDir)) if (f.endsWith('.html')) inputs.add('pages/dashboard-next/' + f);

// --- Predicted dist/ html set ---
const findHtml = (dir) =>
	execSync(`find ${dir} -name '*.html'`, { cwd: ROOT }).toString().trim().split('\n').filter(Boolean);
const dist = new Set();
for (const f of findHtml('public')) dist.add(f.replace(/^public\//, ''));
for (const f of inputs) dist.add(f.replace(/^(pages|public)\//, ''));
dist.add('docs/index.html');
for (const top of ['docs', 'blog'])
	if (existsSync(resolve(ROOT, top)))
		for (const f of findHtml(top)) dist.add(`${top}/` + f.replace(new RegExp(`^${top}/`), ''));

// Directory prefixes that ship at least one html file — used to validate
// parameterized ($1) route dests (e.g. /events/$1.html, /blog/$1.html).
const distDirs = new Set();
for (const f of dist) {
	const parts = f.split('/');
	for (let i = 1; i < parts.length; i++) distDirs.add(parts.slice(0, i).join('/'));
}

// --- Check (1): vercel route dests with no build target ---
const vercel = JSON.parse(readFileSync(resolve(ROOT, 'vercel.json'), 'utf8'));
const deadRoutes = [];
for (const r of vercel.routes || []) {
	if (!r.dest) continue;
	let d = r.dest.split('?')[0].replace(/^\//, '');
	if (!d.endsWith('.html')) continue;
	if (d.includes('$')) {
		// Parameterized dest: can't resolve the exact file, so require that the
		// directory prefix ships at least one html file (catches dests pointed at
		// a directory that doesn't exist at all).
		const prefix = d.slice(0, d.indexOf('$')).replace(/\/$/, '');
		const dir = prefix.includes('/') ? prefix.slice(0, prefix.lastIndexOf('/')) : prefix;
		if (dir !== '' && !distDirs.has(dir) && !dist.has(`${dir}.html`))
			deadRoutes.push(`${r.src} -> ${r.dest} (parameterized: no backing dir '${dir}')`);
		continue;
	}
	if (!dist.has(d)) deadRoutes.push(`${r.src} -> ${r.dest}`);
}

// --- Check (2): pages/*.html not built ---
const unbuilt = findHtml('pages').filter((f) => !inputs.has(f));

let ok = true;
console.log('(1) vercel routes whose .html dest has no build target:');
if (deadRoutes.length) {
	ok = false;
	for (const x of deadRoutes) console.log('    404 ' + x);
} else console.log('    (none) ✓');

console.log('(2) pages/*.html not registered as a Vite input (never built):');
if (unbuilt.length) {
	ok = false;
	for (const x of unbuilt) console.log('    unbuilt ' + x);
} else console.log('    (none) ✓');

process.exit(ok ? 0 : 1);
