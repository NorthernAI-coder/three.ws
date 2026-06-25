#!/usr/bin/env node
/**
 * Routing & 404 verifier for vercel.json.
 *
 * The site routes through the legacy Vercel `routes` array (first match wins,
 * a `{ "handle": "filesystem" }` boundary, then a `/(.*)` → `/404.html` status
 * 404 catch-all). This script proves three things without needing a deploy:
 *
 *   1. COVERAGE   — every catalog page in data/pages.json is reachable by its
 *                   canonical (extensionless, no-trailing-slash) pretty URL, and
 *                   every page also resolves with a trailing slash.
 *   2. 404 STATUS — unknown paths land on the designed /404.html with a real 404
 *                   (not a silent dead-end, not a 200).
 *   3. NO SHADOWS — every literal page route actually serves its own destination
 *                   (no earlier broad pattern swallows it).
 *
 * It does this two ways:
 *   • STATIC (default) — a faithful re-implementation of the Vercel legacy-routes
 *     matcher, run against a model of the built `dist/` file set (rollup HTML
 *     inputs from vite.config.js + auto-discovered dashboard-next + verbatim
 *     public/ , docs/ , blog/ , ibm/ copies). Deterministic, offline, CI-safe.
 *   • LIVE (--base=<url>) — real HTTP requests against a running preview / prod
 *     (`vercel dev`, `vercel build` preview, or https://three.ws), asserting the
 *     status code and, for redirects, the Location.
 *
 * Usage:
 *   node scripts/verify-routes.mjs            # static, advisory (exit 0, lists issues)
 *   node scripts/verify-routes.mjs --strict   # static, CI mode (exit 1 on any failure)
 *   node scripts/verify-routes.mjs --base=https://three.ws            # live sample
 *   node scripts/verify-routes.mjs --base=http://localhost:3000 --all # live, every route
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const strict = argv.includes('--strict');
const all = argv.includes('--all');
const baseArg = argv.find((a) => a.startsWith('--base='));
const BASE = baseArg ? baseArg.slice('--base='.length).replace(/\/$/, '') : null;

const vercel = JSON.parse(readFileSync(resolve(ROOT, 'vercel.json'), 'utf8'));
const pages = JSON.parse(readFileSync(resolve(ROOT, 'data/pages.json'), 'utf8'));
const routes = vercel.routes || [];

// ───────────────────────── model the built dist/ file set ─────────────────────────
function walk(dir, base = dir, exts = null) {
	const out = [];
	let entries;
	try {
		entries = readdirSync(dir);
	} catch {
		return out;
	}
	for (const e of entries) {
		const full = resolve(dir, e);
		let st;
		try {
			st = statSync(full);
		} catch {
			continue;
		}
		if (st.isDirectory()) out.push(...walk(full, base, exts));
		else if (!exts || exts.some((x) => e.endsWith(x))) out.push(full.slice(base.length + 1));
	}
	return out;
}

// Which pages/*.html actually reach dist: rollup inputs + dashboard-next glob + ibm copy.
const viteSrc = readFileSync(resolve(ROOT, 'vite.config.js'), 'utf8');
const viteInputs = new Set();
for (const m of viteSrc.matchAll(/resolve\(__dirname,\s*['"]([^'"]+\.html)['"]\)/g)) viteInputs.add(m[1]);

const served = new Set(); // dist-relative file paths that will exist on disk
for (const f of walk(resolve(ROOT, 'pages'), resolve(ROOT, 'pages'), ['.html'])) {
	if (viteInputs.has('pages/' + f) || f.startsWith('dashboard-next/') || f.startsWith('ibm/')) served.add(f);
}
for (const f of walk(resolve(ROOT, 'public'))) served.add(f); // public/ copied verbatim (all files)
for (const f of walk(resolve(ROOT, 'docs'))) served.add('docs/' + f);
for (const f of walk(resolve(ROOT, 'blog'))) served.add('blog/' + f);

const apiFile = (p) => {
	// /api/foo or /api/foo/bar → is there an api/foo.js or api/foo/bar.js (or [param])?
	const rel = p.replace(/^\//, '').split('?')[0];
	if (!rel.startsWith('api/')) return false;
	const base = resolve(ROOT, rel);
	return existsSync(base + '.js') || existsSync(base) || existsSync(resolve(ROOT, rel.replace(/\/[^/]+$/, '')) ); // dynamic segment tolerated
};

// ───────────────────────── faithful legacy-routes resolver ─────────────────────────
const fsIdx = routes.findIndex((r) => r.handle === 'filesystem');
const mainRoutes = fsIdx === -1 ? routes : routes.slice(0, fsIdx);
const postRoutes = fsIdx === -1 ? [] : routes.slice(fsIdx + 1);

function compile(src) {
	try {
		return new RegExp('^' + src + '$');
	} catch {
		return null;
	}
}
function subst(dest, m) {
	return dest.replace(/\$(\d+)/g, (_, n) => (m && m[+n] != null ? m[+n] : ''));
}
// Does the filesystem serve `path`? (path is dist-relative, leading slash stripped)
function fileServes(path) {
	const clean = path.replace(/^\//, '').split('?')[0];
	if (clean === '') return served.has('home.html') || served.has('index.html');
	if (served.has(clean)) return true;
	if (served.has(clean + '.html')) return true;
	if (served.has(clean + '/index.html')) return true;
	if (clean.endsWith('/') && served.has(clean + 'index.html')) return true;
	return false;
}

// Returns { kind: 'file'|'redirect'|'api'|'external'|'notfound', status, dest, to }
function resolvePath(pathname, depth = 0) {
	if (depth > 6) return { kind: 'loop', status: 508 };
	let path = pathname;
	for (const r of mainRoutes) {
		if (!r.src) continue;
		if (r.has || r.missing) continue; // conditional (bot UA / query) — not the default GET
		const re = compile(r.src);
		if (!re) continue;
		const m = path.match(re);
		if (!m) continue;
		if (r.continue) continue; // header-only layer
		if (r.status && r.headers && r.headers.Location)
			return { kind: 'redirect', status: r.status, to: subst(r.headers.Location, m) };
		if (r.status === 404) return { kind: 'notfound', status: 404 };
		if (r.dest) {
			const d = subst(r.dest, m);
			if (/^https?:\/\//.test(d)) return { kind: 'external', status: 200, to: d };
			path = d.split('?')[0];
			break; // rewrite ends the main phase → filesystem check
		}
	}
	// filesystem check
	if (path.replace(/^\//, '').split('?')[0].startsWith('api/')) {
		return apiFile(path) ? { kind: 'api', status: 200, dest: path } : { kind: 'api-missing', status: 500, dest: path };
	}
	if (fileServes(path)) return { kind: 'file', status: 200, dest: path };
	// post-filesystem (handle:filesystem) phase
	for (const r of postRoutes) {
		if (!r.src) continue;
		const re = compile(r.src);
		if (!re) continue;
		const m = path.match(re);
		if (!m) continue;
		if (r.status === 404) return { kind: 'notfound', status: 404, dest: subst(r.dest || '', m) };
		if (r.dest) {
			const d = subst(r.dest, m);
			if (fileServes(d)) return { kind: 'file', status: r.status || 200, dest: d };
		}
	}
	return { kind: 'notfound', status: 404, dest: '(implicit)' };
}

// ───────────────────────── checks ─────────────────────────
const norm = (p) => (p !== '/' && p.endsWith('/') ? p.slice(0, -1) : p);
const dynamic = (p) => /[:*]|\$/.test(p);
const reachable = (r) => ['file', 'redirect', 'api', 'external'].includes(r.kind);

const failures = [];
const warnings = [];

// 1. COVERAGE — canonical reachability (hard) + trailing-slash (soft)
const catalog = [];
for (const s of pages.sections || []) for (const p of s.pages || []) catalog.push(p.path);
let covered = 0;
for (const path of catalog) {
	if (dynamic(path)) continue;
	const noSlash = norm(path);
	const a = resolvePath(noSlash);
	if (!reachable(a)) {
		failures.push(`COVERAGE  ${path}  canonical → ${a.kind} (${a.status}) ${a.dest || a.to || ''}`);
		continue;
	}
	covered++;
	// A trailing slash only makes sense for "directory-like" pretty URLs — not for
	// file resources (robots.txt, openapi.json), well-known endpoints, or APIs,
	// where `…/` is never requested and would be wrong to serve.
	const isResource = /\.[a-z0-9]+$/i.test(noSlash) || noSlash.startsWith('/.well-known/') || noSlash.startsWith('/api/');
	if (isResource) continue;
	const withSlash = noSlash === '/' ? '/' : noSlash + '/';
	const b = resolvePath(withSlash);
	if (!reachable(b)) warnings.push(`TRAILSLASH ${path}/  → ${b.kind} (lands on designed 404)`);
}

// 2. 404 STATUS — known-bad paths must hit the designed 404 with status 404
const BAD = [
	'/this-page-does-not-exist',
	'/zzzz-nope',
	'/agents/____/nope',
	'/forge/not/a/real/sub/path/xyz',
	'/dashboard/zzz-not-a-tab-xyz',
	'/.well-known/not-a-real-thing-xyz',
];
for (const p of BAD) {
	const r = resolvePath(p);
	if (!(r.kind === 'notfound' && r.status === 404)) {
		failures.push(`404STATUS ${p}  → ${r.kind} (${r.status}) ${r.dest || r.to || ''} (expected 404 → /404.html)`);
	} else if (r.dest && r.dest !== '/404.html' && r.dest !== '(implicit)') {
		warnings.push(`404DEST   ${p} → ${r.dest} (expected /404.html)`);
	}
}
// And the 404 destination file must exist.
if (!served.has('404.html')) failures.push('404PAGE   dist/404.html is missing (public/404.html not built)');

// 3. NO SHADOWS — each literal HTML page route serves its own dest
let litChecked = 0;
for (const r of mainRoutes) {
	if (!r.src || r.continue || r.has || r.missing || !r.dest) continue;
	if (!/\.html$/.test(r.dest.split('?')[0])) continue;
	const lit = r.src.replace(/\\(.)/g, '$1');
	if (/[()\[\]+*?|]/.test(lit.replace(/\/\?$/, ''))) continue; // patterned src — skip
	const canonical = lit.replace(/\/\?$/, '');
	const want = r.dest.split('?')[0];
	const got = resolvePath(canonical || '/');
	litChecked++;
	if (got.kind === 'file' && '/' + got.dest.replace(/^\//, '') !== want) {
		// Only a real shadow if it serves a DIFFERENT html page than intended.
		if (got.dest.replace(/^\//, '') !== want.replace(/^\//, ''))
			failures.push(`SHADOW    ${r.src} → ${want}  but resolves to /${got.dest.replace(/^\//, '')}`);
	}
}

// ───────────────────────── live mode (optional) ─────────────────────────
async function live() {
	const targets = new Set([...BAD]);
	for (const path of catalog) if (!dynamic(path)) targets.add(norm(path));
	if (!all) {
		// sample: first ~40 catalog pages + all bad paths is plenty for a smoke pass
		const sample = [...targets].slice(0, 40 + BAD.length);
		targets.clear();
		for (const t of sample) targets.add(t);
	}
	let liveFail = 0;
	for (const path of targets) {
		const expectBad = BAD.includes(path);
		let res;
		try {
			res = await fetch(BASE + path, { redirect: 'manual', headers: { 'user-agent': 'three-ws-route-verifier' } });
		} catch (e) {
			console.log(`  ✗ ${path} — request failed: ${e.message}`);
			liveFail++;
			continue;
		}
		const st = res.status;
		const okBad = expectBad ? st === 404 : st >= 200 && st < 400;
		if (!okBad) {
			console.log(`  ✗ ${path} — HTTP ${st}${expectBad ? ' (expected 404)' : ''}`);
			liveFail++;
		} else if (process.env.VERBOSE) {
			console.log(`  ✓ ${path} — HTTP ${st}`);
		}
	}
	console.log(`\nLive check against ${BASE}: ${targets.size - liveFail}/${targets.size} OK.`);
	return liveFail;
}

// ───────────────────────── report ─────────────────────────
console.log(`Route verify — ${catalog.length} catalog pages, ${mainRoutes.length} main routes, ${postRoutes.length} post-filesystem routes.`);
console.log(`  modeled dist files: ${served.size} · canonical-covered: ${covered} · literal page routes checked for shadows: ${litChecked}`);
console.log(`  filesystem boundary (handle:filesystem) present: ${fsIdx !== -1 ? 'yes' : 'NO'}`);

if (warnings.length) {
	console.log(`\nℹ ${warnings.length} advisory note(s):`);
	for (const w of warnings.slice(0, 50)) console.log('   ' + w);
	if (warnings.length > 50) console.log(`   …and ${warnings.length - 50} more`);
}

if (failures.length) {
	console.log(`\n✗ ${failures.length} FAILURE(s):`);
	for (const f of failures) console.log('   ' + f);
} else {
	console.log('\n✓ static checks pass: every catalog page reachable, unknown paths → designed 404, no shadowed page routes.');
}

let exitCode = failures.length && strict ? 1 : 0;
if (BASE) {
	const liveFail = await live();
	if (liveFail && strict) exitCode = 1;
}
process.exit(exitCode);
