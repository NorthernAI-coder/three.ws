#!/usr/bin/env node
// Orphan & duplicate page audit (task A07).
//
// Cross-references every HTML file under pages/ and public/ against the Vite
// build inputs (vite.config.js) and the Vercel route table (vercel.json) to
// classify each file and flag broken routes.
//
// Build model (see vite.config.js):
//   pages/<path>.html  (a Rollup input)  -> dist/pages/<path>.html -> flattened to dist/<path>.html
//   pages/dashboard-next/*.html          -> auto-discovered inputs (dn-<name>)
//   public/**                            -> copied verbatim to dist/**
// A Vercel route `dest: /X.html` resolves only if dist/X.html exists, i.e. X is
// produced by a flattened pages input OR shipped as public/X.html.
//
// Usage: node scripts/orphan-audit.mjs            (human summary)
//        node scripts/orphan-audit.mjs --json     (machine output)
//        node scripts/orphan-audit.mjs --check    (exit 1 if broken routes exist)

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { resolve, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const r = (...p) => resolve(ROOT, ...p);

function walkHtml(dir) {
	const out = [];
	if (!existsSync(dir)) return out;
	for (const name of readdirSync(dir)) {
		const full = resolve(dir, name);
		const st = statSync(full);
		if (st.isDirectory()) {
			if (['node_modules', '.git', 'dist'].includes(name)) continue;
			out.push(...walkHtml(full));
		} else if (name.endsWith('.html')) {
			out.push(full);
		}
	}
	return out;
}

// --- 1. Enumerate every HTML file ---------------------------------------
const pagesFiles = walkHtml(r('pages')).map((f) => relative(ROOT, f));
const publicFiles = walkHtml(r('public')).map((f) => relative(ROOT, f));
const rootFiles = readdirSync(ROOT)
	.filter((f) => f.endsWith('.html'))
	.map((f) => f);

// --- 2. Parse Vite build inputs -----------------------------------------
const viteSrc = readFileSync(r('vite.config.js'), 'utf8');
// `resolve(__dirname, 'pages/<x>.html')` only ever appears in the rollup input
// map, so scanning the whole file is safe (the flatten/promote plugins use
// dist/ paths, never pages/*.html).
const inputPagePaths = new Set();
for (const m of viteSrc.matchAll(/resolve\(__dirname,\s*'(pages\/[^']+\.html)'\)/g)) {
	inputPagePaths.add(m[1]);
}
// Auto-discovered dashboard-next inputs.
for (const f of pagesFiles) {
	if (f.startsWith('pages/dashboard-next/') && f.endsWith('.html')) inputPagePaths.add(f);
}

// Flattened dist name for a pages input: drop the leading "pages/".
const flatten = (p) => p.replace(/^pages\//, '');
const builtDist = new Set([...inputPagePaths].map(flatten)); // e.g. "features/ar.html"

// Public files ship verbatim: dist path = path relative to public/.
const publicDist = new Set(publicFiles.map((f) => f.replace(/^public\//, '')));

// Build-time copied trees (vite.config closeBundle cpSync): docs/ -> dist/docs,
// blog/ -> dist/blog. These never live under pages/ or public/ but DO ship.
const copiedDist = new Set();
for (const top of ['docs', 'blog']) {
	for (const f of walkHtml(r(top))) copiedDist.add(`${top}/${relative(r(top), f)}`);
}

// Final set of HTML files that will exist in dist (keyed by dist-root-relative path).
const distHtml = new Set([...builtDist, ...publicDist, ...copiedDist]);
// Directory prefixes that have at least one backing dist file — used to validate
// parameterized ($1) route dests like /events/$1.html or /blog/$1.html.
const distDirs = new Set();
for (const f of distHtml) {
	const parts = f.split('/');
	for (let i = 1; i < parts.length; i++) distDirs.add(parts.slice(0, i).join('/'));
}

// --- 3. Parse Vercel routes ---------------------------------------------
const vercel = JSON.parse(readFileSync(r('vercel.json'), 'utf8'));
const routes = vercel.routes || [];
const brokenRoutes = []; // literal dest .html with no backing dist file
const dynamicRoutes = []; // parameterized ($n) dests, validated by directory
const htmlDestTargets = new Set(); // literal dist paths referenced by a route dest

for (const route of routes) {
	const dest = route.dest;
	if (!dest || typeof dest !== 'string') continue;
	// Only care about html destinations; strip query + leading slash.
	const destPath = dest.split('?')[0].replace(/^\//, '');
	if (!destPath.endsWith('.html')) continue;

	if (destPath.includes('$')) {
		// Parameterized dest (e.g. events/$1.html). Can't resolve the exact file,
		// so validate that the directory prefix ships at least one html file.
		const prefix = destPath.slice(0, destPath.indexOf('$')).replace(/\/$/, '');
		const dir = prefix.includes('/') ? prefix.slice(0, prefix.lastIndexOf('/')) : prefix;
		const ok = dir === '' || distDirs.has(dir) || distHtml.has(`${dir}.html`);
		dynamicRoutes.push({ src: route.src, dest, backed: ok });
		if (!ok) brokenRoutes.push({ src: route.src, dest, note: 'parameterized: no backing dir' });
		continue;
	}
	htmlDestTargets.add(destPath);
	if (!distHtml.has(destPath)) {
		brokenRoutes.push({ src: route.src, dest });
	}
}

// --- 4. Classify pages/ files -------------------------------------------
// A pages file is "built" if it's a Vite input; otherwise it never ships.
const orphanPages = pagesFiles.filter((f) => !inputPagePaths.has(f));
const builtPages = pagesFiles.filter((f) => inputPagePaths.has(f));

// --- 5. Routability of dist files ---------------------------------------
// cleanUrls: a dist file at <path>.html is reachable at /<path> and /<path>.html
// even without an explicit route, as long as it's not shadowed. We treat any
// dist html as reachable-by-path; explicit route presence is informational.
const builtPagesUnreferenced = [...builtDist].filter((d) => !htmlDestTargets.has(d));

const result = {
	counts: {
		pagesFiles: pagesFiles.length,
		publicFiles: publicFiles.length,
		rootFiles: rootFiles.length,
		viteInputs: inputPagePaths.size,
		distHtml: distHtml.size,
		routeHtmlDests: htmlDestTargets.size,
		dynamicRoutes: dynamicRoutes.length,
	},
	brokenRoutes,
	orphanPages, // pages/*.html NOT wired as a build input -> dead in prod
	rootFiles, // root *.html — should not exist per repo hygiene
	builtPagesUnreferenced, // built but no explicit vercel route (served via cleanUrls)
};

if (process.argv.includes('--json')) {
	console.log(JSON.stringify(result, null, 2));
} else {
	console.log('=== Orphan / duplicate page audit ===\n');
	console.log('Counts:', JSON.stringify(result.counts, null, 2));
	console.log(`\nBROKEN ROUTES (dest .html with no backing dist file): ${brokenRoutes.length}`);
	for (const b of brokenRoutes) console.log(`  ${b.src}  ->  ${b.dest}`);
	console.log(`\nORPHAN pages/ files (not a build input, dead in prod): ${orphanPages.length}`);
	for (const f of orphanPages) console.log(`  ${f}`);
	console.log(`\nROOT *.html (violate repo hygiene): ${rootFiles.length}`);
	for (const f of rootFiles) console.log(`  ${f}`);
}

if (process.argv.includes('--check') && brokenRoutes.length) {
	console.error(`\n✗ ${brokenRoutes.length} broken route(s).`);
	process.exit(1);
}
