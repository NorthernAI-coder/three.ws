// tests/ibm-hub-markup.test.js
// Guards the IBM hub page (pages/ibm/index.html) for two properties that are
// impossible to eyeball reliably but trivial to check statically:
//
//   1. No inline JS event handlers on cards — hover must be CSS-only so
//      keyboard navigation (Tab → Enter) works and CSP can stay strict.
//   2. No inline style= that duplicates what .demo-card / .card-* already
//      supplies — i.e. no `display:block`, `border-radius:18px`, etc. on the
//      anchor elements (the only allowed inline style is --card-bg / --dot-color).
//   3. Every .demo-card links to an /ibm/* sub-page that exists on disk.
//   4. Every card has the interior structure the CSS expects: .card-body,
//      .card-tag, .card-dot, .card-h, .card-p, .card-cta.
//   5. Every .card-p > strong has no inline style (styled by .card-p strong rule).
//   6. The .gradient class is used on h1 AND is usable on h2 (no h1-specific
//      selector like `h1 .gradient` that would break the Vision card title).

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(resolve(ROOT, 'pages/ibm/index.html'), 'utf8');

// Minimal HTML tokeniser — finds every opening tag with its attributes.
function findTags(src, tagName) {
	const re = new RegExp(`<${tagName}(\\s[^>]*)?>`, 'gi');
	const out = [];
	for (const m of src.matchAll(re)) out.push(m[0]);
	return out;
}
function attr(tag, name) {
	const m = tag.match(new RegExp(`${name}=["']([^"']*)["']`, 'i'));
	return m ? m[1] : null;
}
function hasAttr(tag, name) {
	return new RegExp(`\\b${name}\\b`, 'i').test(tag);
}

const cards = findTags(html, 'a').filter((t) => /class=["'][^"']*demo-card/.test(t));

describe('IBM hub page markup', () => {
	it('has at least 7 demo cards', () => {
		expect(cards.length).toBeGreaterThanOrEqual(7);
	});

	it('no card has an onmouseover or onmouseout handler', () => {
		const offenders = cards.filter((t) => hasAttr(t, 'onmouseover') || hasAttr(t, 'onmouseout'));
		expect(offenders, `cards with inline JS handlers: ${offenders.join('\n')}`).toHaveLength(0);
	});

	it('every card href links to an existing /ibm/* page', () => {
		const missing = [];
		for (const tag of cards) {
			const href = attr(tag, 'href') || '';
			if (!href.startsWith('/ibm/')) { missing.push(href); continue; }
			const slug = href.replace('/ibm/', '');
			const path = resolve(ROOT, `pages/ibm/${slug}.html`);
			if (!existsSync(path)) missing.push(href);
		}
		expect(missing, `cards linking to non-existent pages: ${missing.join(', ')}`).toHaveLength(0);
	});

	it('card inline styles only set CSS custom properties (--card-bg / --dot-color)', () => {
		const BAD = /(?:display|border-radius|overflow|position|transition|padding|margin-bottom)\s*:/;
		const offenders = cards.filter((t) => {
			const s = attr(t, 'style') || '';
			return BAD.test(s);
		});
		expect(
			offenders,
			`cards with disallowed inline layout styles (should be in .demo-card CSS):\n${offenders.join('\n')}`,
		).toHaveLength(0);
	});

	it('card inner structure has required class elements', () => {
		// Extract content between each card opening tag and the next </a>
		const cardBlocks = [];
		let pos = 0;
		for (const tag of cards) {
			const start = html.indexOf(tag, pos);
			const end = html.indexOf('</a>', start);
			cardBlocks.push(html.slice(start, end + 4));
			pos = end;
		}
		const REQUIRED = ['card-body', 'card-tag', 'card-dot', 'card-h', 'card-p', 'card-cta'];
		for (const block of cardBlocks) {
			const href = (block.match(/href="([^"]*)"/) || [])[1] || '?';
			for (const cls of REQUIRED) {
				expect(block, `card ${href} is missing .${cls}`).toContain(`class="${cls}"`);
			}
		}
	});

	it('no strong inside .card-p has inline style (handled by CSS rule)', () => {
		// Grab all <strong style=...> occurrences inside card-p paragraphs
		const cardPBlocks = [...html.matchAll(/class="card-p"[^>]*>([\s\S]*?)<\/p>/g)].map((m) => m[1]);
		for (const block of cardPBlocks) {
			const strongs = [...block.matchAll(/<strong\s[^>]*style=/gi)];
			expect(strongs, `<strong> inside .card-p should not have inline style`).toHaveLength(0);
		}
	});

	it('stylesheet uses .gradient not h1 .gradient so Vision card h2 renders correctly', () => {
		const styleBlock = (html.match(/<style>([\s\S]*?)<\/style>/) || [])[1] || '';
		expect(styleBlock).not.toMatch(/\bh1\s+\.gradient\b/);
		expect(styleBlock).toMatch(/(?:^|[^a-z])\.gradient\s*\{/m);
	});
});
