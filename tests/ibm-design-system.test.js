import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const ibmCssPath = resolve(repoRoot, 'public/ibm.css');
const ibmPagesDir = resolve(repoRoot, 'pages/ibm');

/**
 * Guards the three.ws × IBM design system (public/ibm.css).
 *
 * WHY THIS EXISTS
 * ---------------
 * Every /ibm page used to carry its own :root with the same IBM Carbon colors
 * spelled eight different ways — that drift is why the pages looked like eight
 * sites. We unified them onto one shared stylesheet. With ~20 agents editing
 * this tree, this test is the latch that keeps it unified: it fails the moment
 * a page stops linking the system, re-introduces local design tokens, or
 * references a token the system doesn't define.
 */

const ibmCss = existsSync(ibmCssPath) ? readFileSync(ibmCssPath, 'utf8') : '';

// Tokens that are intentionally set per-element (inline style=) or in JS, never
// globally in :root. Referencing these without a global definition is correct.
const DYNAMIC_TOKENS = new Set(['col', 'pct', 'dot-color', 'card-bg', 'vborder']);

// Names every legacy page relies on; deleting any of these aliases would break
// pages that still say var(--up) / var(--ibm) etc.
const REQUIRED_ALIASES = [
	'bg', 'panel', 'panel-solid', 'panel-2', 'panel2', 'border', 'border-hi',
	'text', 'ink', 'muted', 'faint', 'ibm', 'ibm-light', 'ibm-dim',
	'up', 'down', 'green', 'allow', 'block', 'warn', 'review', 'amber',
	'radius', 'shadow', 'mono', 'font',
];

const CANONICAL_TOKENS = [
	'ibm-bg', 'ibm-panel', 'ibm-border', 'ibm-text', 'ibm-muted',
	'ibm-blue', 'ibm-blue-light', 'ibm-green', 'ibm-red', 'ibm-amber',
];

function definedTokens(css) {
	const out = new Set();
	for (const m of css.matchAll(/(--[a-z0-9-]+)\s*:/g)) out.add(m[1].slice(2));
	return out;
}

function ibmPages() {
	if (!existsSync(ibmPagesDir)) return [];
	return readdirSync(ibmPagesDir)
		.filter((f) => f.endsWith('.html'))
		.map((f) => ({ name: f, html: readFileSync(resolve(ibmPagesDir, f), 'utf8') }));
}

describe('IBM design system — public/ibm.css', () => {
	it('the shared stylesheet exists', () => {
		expect(existsSync(ibmCssPath), 'public/ibm.css must exist').toBe(true);
	});

	it('defines the canonical IBM Carbon tokens', () => {
		const defs = definedTokens(ibmCss);
		for (const t of CANONICAL_TOKENS) {
			expect(defs.has(t), `ibm.css must define --${t}`).toBe(true);
		}
	});

	it('keeps the back-compat aliases the pages depend on', () => {
		const defs = definedTokens(ibmCss);
		for (const a of REQUIRED_ALIASES) {
			expect(defs.has(a), `ibm.css must alias --${a} (a page still uses it)`).toBe(true);
		}
	});

	it('uses the real IBM Carbon palette', () => {
		expect(ibmCss).toMatch(/#0f62fe/i); // Blue 60
		expect(ibmCss).toMatch(/#42be65/i); // Green 50
		expect(ibmCss).toMatch(/#fa4d56/i); // Red 50
		expect(ibmCss).toMatch(/#f1c21b/i); // Yellow 30
	});

	it('ships the shared state + a11y primitives', () => {
		// the fix for "blank panel / spinner-forever on 503" lives here
		expect(ibmCss).toContain('.ibm-state');
		expect(ibmCss).toContain('.ibm-skeleton');
		expect(ibmCss).toContain('.ibm-spinner');
		expect(ibmCss).toContain(':focus-visible');
		expect(ibmCss).toContain('prefers-reduced-motion');
	});
});

describe('IBM design system — page conformance', () => {
	const pages = ibmPages();

	it('there are /ibm pages to check', () => {
		expect(pages.length).toBeGreaterThan(0);
	});

	for (const { name, html } of pages) {
		describe(name, () => {
			it('links the shared design system', () => {
				expect(
					/href="\/ibm\.css"/.test(html),
					`${name} must <link> /ibm.css`,
				).toBe(true);
			});

			it('does not re-define design tokens in a local :root', () => {
				// A local :root means the page is drifting away from the system again.
				const rootBlocks = html.match(/:root\s*\{[^}]*\}/g) || [];
				const offenders = rootBlocks.filter((b) => /--[a-z]/.test(b));
				expect(
					offenders.length,
					`${name} defines tokens in a local :root — move them to public/ibm.css`,
				).toBe(0);
			});

			it('only references tokens the system defines (or dynamic/inline ones)', () => {
				const defs = definedTokens(ibmCss);
				const undefinedRefs = new Set();
				// match var(--token ...) and capture whether a fallback (comma) follows
				for (const m of html.matchAll(/var\(\s*(--[a-z0-9-]+)\s*(,)?/g)) {
					const token = m[1].slice(2);
					const hasFallback = Boolean(m[2]);
					if (hasFallback) continue; // var(--x, fallback) is always safe
					if (defs.has(token) || DYNAMIC_TOKENS.has(token)) continue;
					undefinedRefs.add(token);
				}
				expect(
					[...undefinedRefs],
					`${name} references undefined token(s); define them in public/ibm.css or give a var() fallback`,
				).toEqual([]);
			});
		});
	}
});
