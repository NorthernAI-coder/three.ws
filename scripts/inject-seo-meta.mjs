#!/usr/bin/env node
// inject-seo-meta.mjs — idempotently backfill SEO <head> tags on every
// canonical, indexable static page listed in data/pages.json.
//
// For each page it ensures a real <title>, <meta name="description">, an
// absolute <link rel="canonical">, Open Graph + Twitter Card tags, and a
// WebPage/WebSite JSON-LD block. Copy comes from data/pages.json (the single
// source of truth that also feeds the sitemap, llms.txt and the human
// sitemap), so the meta a crawler sees matches the catalog exactly.
//
// It NEVER overwrites a tag a page already has — page bodies are owned by
// other agents; we only fill genuine gaps. Re-running is a no-op once a page
// is fully covered. Pass --write to mutate files; default is a dry-run report.
//
// Route → file resolution uses vercel.json's `routes` table (the real router),
// falling back to conventional file locations.

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const ORIGIN = 'https://three.ws';
const DEFAULT_OG = `${ORIGIN}/og-image.png`;
const WRITE = process.argv.includes('--write');

function htmlEscape(s) {
	return String(s)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

async function loadJson(rel) {
	return JSON.parse(await readFile(path.join(ROOT, rel), 'utf8'));
}

// Build an ordered list of {re, dest} from vercel.json routes for resolution.
function buildRouter(vercel) {
	const routes = Array.isArray(vercel.routes) ? vercel.routes : [];
	const out = [];
	for (const r of routes) {
		if (!r || typeof r.src !== 'string' || typeof r.dest !== 'string') continue;
		if (r.methods && !r.methods.includes('GET')) continue;
		// Only care about routes that land on a static .html file.
		const destPath = r.dest.split('?')[0];
		if (!destPath.endsWith('.html')) continue;
		let re;
		try {
			re = new RegExp(r.src.startsWith('^') ? r.src : `^${r.src}$`);
		} catch {
			continue;
		}
		out.push({ re, dest: destPath });
	}
	return out;
}

function resolveFile(p, router) {
	// 1) vercel.json router match.
	for (const { re, dest } of router) {
		if (re.test(p)) {
			const rel = dest.replace(/^\//, '');
			for (const base of ['pages', 'public']) {
				const f = path.join(ROOT, base, rel);
				if (existsSync(f)) return f;
			}
		}
	}
	// 2) conventional fallbacks.
	const slug = p.replace(/^\//, '');
	const flat = slug.replace(/\//g, '-');
	const candidates = [
		`pages/${slug}.html`,
		`public/${slug}.html`,
		`public/${slug}/index.html`,
		`pages/${slug}/index.html`,
		`pages/${flat}.html`,
		`public/${flat}.html`,
	];
	if (p === '/') candidates.unshift('pages/home.html', 'public/index.html');
	for (const c of candidates) {
		const f = path.join(ROOT, c);
		if (existsSync(f)) return f;
	}
	return null;
}

// Detect presence of a given meta/link/jsonld in a <head> string.
const has = {
	title: (h) => /<title[\s>]/i.test(h),
	description: (h) => /<meta[^>]+name=["']description["']/i.test(h),
	canonical: (h) => /<link[^>]+rel=["']canonical["']/i.test(h),
	ogTitle: (h) => /<meta[^>]+property=["']og:title["']/i.test(h),
	ogDescription: (h) => /<meta[^>]+property=["']og:description["']/i.test(h),
	ogImage: (h) => /<meta[^>]+property=["']og:image["']/i.test(h),
	ogUrl: (h) => /<meta[^>]+property=["']og:url["']/i.test(h),
	ogType: (h) => /<meta[^>]+property=["']og:type["']/i.test(h),
	ogSiteName: (h) => /<meta[^>]+property=["']og:site_name["']/i.test(h),
	twitterCard: (h) => /<meta[^>]+name=["']twitter:card["']/i.test(h),
	twitterTitle: (h) => /<meta[^>]+name=["']twitter:title["']/i.test(h),
	twitterDescription: (h) => /<meta[^>]+name=["']twitter:description["']/i.test(h),
	twitterImage: (h) => /<meta[^>]+name=["']twitter:image["']/i.test(h),
	jsonld: (h) => /<script[^>]+application\/ld\+json/i.test(h),
};

// Pull an existing og:image URL so twitter:image can mirror it.
function existingOgImage(head) {
	const m = head.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
	return m ? m[1] : null;
}

function buildTags(page, head) {
	const url = `${ORIGIN}${page.path === '/' ? '/' : page.path}`;
	const title = `${page.title} · three.ws`;
	const desc = page.description || '';
	const ogImage = existingOgImage(head) || DEFAULT_OG;
	const lines = [];
	const indent = '\t';

	if (!has.canonical(head)) lines.push(`<link rel="canonical" href="${url}">`);
	if (!has.ogType(head)) lines.push(`<meta property="og:type" content="website">`);
	if (!has.ogSiteName(head)) lines.push(`<meta property="og:site_name" content="three.ws">`);
	if (!has.ogTitle(head)) lines.push(`<meta property="og:title" content="${htmlEscape(title)}">`);
	if (!has.ogDescription(head) && desc)
		lines.push(`<meta property="og:description" content="${htmlEscape(desc)}">`);
	if (!has.ogUrl(head)) lines.push(`<meta property="og:url" content="${url}">`);
	if (!has.ogImage(head)) {
		lines.push(`<meta property="og:image" content="${ogImage}">`);
		lines.push(`<meta property="og:image:width" content="1200">`);
		lines.push(`<meta property="og:image:height" content="630">`);
	}
	if (!has.twitterCard(head)) lines.push(`<meta name="twitter:card" content="summary_large_image">`);
	if (!has.twitterTitle(head)) lines.push(`<meta name="twitter:title" content="${htmlEscape(title)}">`);
	if (!has.twitterDescription(head) && desc)
		lines.push(`<meta name="twitter:description" content="${htmlEscape(desc)}">`);
	if (!has.twitterImage(head)) lines.push(`<meta name="twitter:image" content="${ogImage}">`);
	if (!has.jsonld(head)) {
		const ld = {
			'@context': 'https://schema.org',
			'@type': 'WebPage',
			name: page.title,
			description: desc || undefined,
			url,
			isPartOf: { '@type': 'WebSite', name: 'three.ws', url: ORIGIN },
		};
		lines.push(
			`<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`,
		);
	}
	// A bare <meta name="description"> if the page somehow lacks one.
	if (!has.description(head) && desc)
		lines.unshift(`<meta name="description" content="${htmlEscape(desc)}">`);

	return lines.map((l) => indent + l).join('\n');
}

function injectIntoHead(html, tagsBlock) {
	// Insert right before </head>, preserving indentation of that line.
	const idx = html.search(/<\/head>/i);
	if (idx === -1) return null;
	const block = `\n${tagsBlock}\n`;
	return html.slice(0, idx) + block + html.slice(idx);
}

function headOf(html) {
	const m = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
	return m ? m[1] : html.slice(0, 4000);
}

async function main() {
	const [pages, vercel] = await Promise.all([loadJson('data/pages.json'), loadJson('vercel.json')]);
	const router = buildRouter(vercel);

	// `blog` is owned by inject-blog-seo.mjs (BlogPosting + BreadcrumbList JSON-LD,
	// resolved from the root /blog dir) — don't double-process it here.
	const SKIP_SECTIONS = new Set(['news', 'machine', 'blog']);
	// Agent-instance surfaces (A05 owns the restructure) resolve to shared
	// editor/SPA files that serve many routes — a single static canonical/og:url
	// would be wrong, so we leave their meta to the owning agent.
	const SKIP_PATHS = new Set(['/agent', '/agent/new', '/labs']);
	// `/features/*` landing pages are authored per-page by their owning agent
	// (F02). This injector defines the shared convention they follow; it does
	// not stamp their heads, to avoid double-writing the same tags.
	const skip = (p) => SKIP_PATHS.has(p) || /^\/features\/[^/]+$/.test(p);
	const targets = [];
	for (const s of pages.sections || []) {
		if (SKIP_SECTIONS.has(s.id)) continue;
		for (const p of s.pages || []) {
			if (p.indexable === false || p.auth === 'required') continue;
			if (!p.path || p.path.startsWith('http')) continue;
			if (skip(p.path)) continue;
			targets.push(p);
		}
	}

	let resolved = 0;
	let unresolved = [];
	let changed = 0;
	let alreadyComplete = 0;

	for (const page of targets) {
		const file = resolveFile(page.path, router);
		if (!file) {
			unresolved.push(page.path);
			continue;
		}
		resolved++;
		const html = await readFile(file, 'utf8');
		const head = headOf(html);
		const tags = buildTags(page, head);
		if (!tags.trim()) {
			alreadyComplete++;
			continue;
		}
		const added = tags
			.trim()
			.split('\n')
			.map((l) => l.trim().match(/(rel|property|name)=["']([^"']+)["']|<(title|script)/i))
			.map((m) => (m ? m[2] || m[3] : '?'))
			.join(', ');
		const relFile = path.relative(ROOT, file);
		console.log(`${page.path}  →  ${relFile}`);
		console.log(`    + ${added}`);
		changed++;
		if (WRITE) {
			const next = injectIntoHead(html, tags);
			if (next) await writeFile(file, next);
			else console.log(`    ! no </head> — skipped`);
		}
	}

	console.log('\n──────────────────────────────────────────');
	console.log(`targets: ${targets.length}  resolved: ${resolved}  complete-already: ${alreadyComplete}  ${WRITE ? 'written' : 'would-change'}: ${changed}`);
	if (unresolved.length) console.log(`UNRESOLVED (${unresolved.length}): ${unresolved.join(', ')}`);
	if (!WRITE) console.log('\n(dry-run — pass --write to apply)');
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
