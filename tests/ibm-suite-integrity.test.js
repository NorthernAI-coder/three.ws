// IBM watsonx suite — integrity guardrail.
// ----------------------------------------------------------------------------
// The IBM suite (pages/ibm/*) is built by many hands and changes fast. This
// test pins the invariants that make it "always working" so regressions fail
// here instead of in someone's browser:
//   • every page has real SEO/social metadata (title, description, canonical,
//     og:image + twitter card) and the og:image asset actually exists;
//   • every page is reachable — registered as a Vite build input AND routed in
//     vercel.json to its clean URL;
//   • every controller script a page references exists on disk;
//   • every demo page can navigate back to the hub;
//   • the backing API endpoints exist and export a handler.
//
// It discovers pages dynamically, so a newly-added page is covered automatically
// (and fails loudly until it's wired). Pure filesystem reads — no network, no
// browser, fully deterministic.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(root, p), 'utf8');
const exists = (p) => existsSync(resolve(root, p));

const IBM_DIR = 'pages/ibm';
const pages = readdirSync(resolve(root, IBM_DIR))
	.filter((f) => f.endsWith('.html'))
	.map((f) => ({ file: `${IBM_DIR}/${f}`, name: f.replace(/\.html$/, '') }));

const viteConfig = read('vite.config.js');
const vercelJson = read('vercel.json');

// Map a same-origin asset URL (absolute https://three.ws/x or root-relative /x)
// to the on-disk file that serves it: public/x, or the source tree for /src/*.
function assetToDiskPath(url) {
	let p = url.replace(/^https:\/\/three\.ws/, '').replace(/[?#].*$/, '');
	if (!p.startsWith('/')) return null;
	if (p.startsWith('/src/')) return p.slice(1); // served from the source tree
	return `public${p}`; // everything else is a public/ asset
}

it('discovers the IBM suite pages', () => {
	expect(pages.length).toBeGreaterThanOrEqual(5);
});

it('ships the shared branded OG card', () => {
	expect(exists('public/ibm-og.png')).toBe(true);
});

describe.each(pages)('pages/ibm/$name', ({ file, name }) => {
	const html = read(file);
	// Whitespace-collapsed copy so matchers are robust to multi-line <meta> tags
	// and varied attribute spacing (both are common across the suite).
	const flat = html.replace(/\s+/g, ' ');
	const isHub = name === 'index';
	const cleanRoute = isHub ? '/ibm' : `/ibm/${name}`;

	it('has a title, description and canonical', () => {
		expect(flat).toMatch(/<title>[^<]{8,}<\/title>/i);
		expect(flat, 'meta description present with content').toMatch(
			/name="description"[^>]*content="[^"]{20,}"/i,
		);
		expect(flat, 'canonical link present').toMatch(/rel="canonical"/i);
	});

	it('is mobile-ready and language-tagged (a11y)', () => {
		expect(flat, 'responsive viewport meta').toMatch(/name="viewport"[^>]*content="[^"]*width=device-width/i);
		expect(flat, '<html lang=…> for screen readers').toMatch(/<html[^>]*\blang="/i);
	});

	it('has social cards with an og:image that exists on disk', () => {
		const og = flat.match(/property="og:image"[^>]*content="([^"]+)"/i);
		expect(og, 'og:image meta is present').toBeTruthy();
		expect(flat).toMatch(/name="twitter:card"/i);
		const disk = assetToDiskPath(og[1]);
		expect(disk, `og:image URL ${og[1]} maps to a disk path`).toBeTruthy();
		expect(exists(disk), `og:image asset exists: ${disk}`).toBe(true);
	});

	it('is registered as a Vite build input', () => {
		expect(viteConfig, `${file} missing from vite.config input`).toContain(`${IBM_DIR}/${name}.html`);
	});

	it(`is routed in vercel.json to its clean URL (${cleanRoute})`, () => {
		expect(vercelJson).toContain(`"${cleanRoute}"`);
		expect(vercelJson).toContain(`/ibm/${isHub ? 'index' : name}.html`);
	});

	it('references only controller scripts that exist', () => {
		const refs = [...html.matchAll(/\/src\/(ibm-[a-z0-9-]+\.js)/gi)].map((m) => m[1]);
		for (const r of new Set(refs)) {
			expect(exists(`src/${r}`), `controller src/${r} exists`).toBe(true);
		}
	});

	if (true) {
		it('can navigate back to the three.ws home or IBM hub', () => {
			// Hub links onward; every demo must offer a path home.
			const hasHome = /href="\/(ibm)?"/.test(html) || /href="\/"/.test(html);
			expect(hasHome, 'a link to / or /ibm is present').toBe(true);
		});
	}
});

describe('IBM API surface', () => {
	const endpoints = [
		'api/guardian/assess.js',
		'api/ibm/attest.js',
		'api/ibm/oracle.js',
		'api/ibm/galaxy.js',
		'api/ibm/vision.js',
	];
	it.each(endpoints)('%s exists and exports a default handler', (ep) => {
		expect(exists(ep), `${ep} exists`).toBe(true);
		expect(read(ep)).toMatch(/export\s+default/);
	});
});
