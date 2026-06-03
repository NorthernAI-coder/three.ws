// Locks the runtime UI contract for the /ibm showcase so it cannot silently
// break under swarm churn.
//
// Each interactive /ibm page boots a front-end engine (src/ibm-<name>.js) that
// grabs DOM nodes by id — `document.getElementById(id)` (aliased `$`), bracket
// access on a cached `els` map, or `querySelector('#id')`. If a page's HTML and
// its engine drift apart — an id renamed in one but not the other, or a state
// container deleted — the engine reads `null`, throws on first access, and the
// page renders a blank void at runtime. No unit test, build step, or linter
// catches that today; you only find out by loading the page in a browser.
//
// These checks make that class of failure impossible to miss, with no browser:
//   1. every page still loads its engine module;
//   2. every DOM id the engine depends on exists in the page HTML (excluding
//      ids the engine injects itself via HTML string templates); and
//   3. every page keeps the degraded-state containers its "always works, even
//      with no watsonx credentials" UX depends on — so the honest loading /
//      empty / error / unavailable states can never be quietly removed.
//
// Pure static analysis: fast, deterministic, and additive (touches no churned
// source file). See docs/ibm.md and scripts/verify-ibm-surface.mjs.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

// page slug (pages/ibm/<slug>.html) → engine module (src/<module>.js)
const PAGES = {
	galaxy: 'ibm-galaxy',
	oracle: 'ibm-oracle',
	'trust-layer': 'ibm-trust-layer',
	proof: 'ibm-proof',
	twin: 'ibm-twin',
	vision: 'ibm-vision',
};

// Degraded-state DOM nodes each page must keep so it can always render an
// honest state instead of a blank screen — even when watsonx is unconfigured.
// Derived from each engine's own state handling (verified present, not guessed).
const REQUIRED_STATE_IDS = {
	galaxy: ['loadingState', 'errorState', 'unavailableState', 'emptyState', 'retryBtn'],
	oracle: ['o-status', 'o-narration', 'o-forecast-badge', 'o-gov-badge'],
	'trust-layer': ['loadingState', 'errorState', 'unavailableState', 'retryBtn'],
	proof: ['gov-title', 'gov-sub'],
	twin: ['t-status', 't-persona', 'b-projection', 'b-fidelity', 'b-gov'],
	vision: ['v-idle', 'v-loading', 'v-error', 'v-error-retry'],
};

// How engines reach DOM nodes by id.
const ID_REF_PATTERNS = [
	/\$\(\s*['"]([\w-]+)['"]\s*\)/g, // $('id')
	/getElementById\(\s*['"]([\w-]+)['"]\s*\)/g, // document.getElementById('id')
	/querySelector(?:All)?\(\s*['"]#([\w-]+)['"]/g, // querySelector('#id')
	/\bels\[\s*['"]([\w-]+)['"]\s*\]/g, // els['id']
];

const matchAllIds = (src, re) => [...src.matchAll(re)].map((m) => m[1]);

const htmlIds = (html) => new Set(matchAllIds(html, /id=["']([\w-]+)["']/g));

const referencedIds = (js) => {
	const ids = new Set();
	for (const re of ID_REF_PATTERNS) for (const id of matchAllIds(js, re)) ids.add(id);
	return ids;
};

// Ids the engine creates itself, by emitting `id="..."` inside an HTML string
// template (e.g. proof.js injects its on-chain verify bar). These need not exist
// in the static HTML, so they are excluded from the required set.
const injectedIds = (js) => new Set(matchAllIds(js, /\bid=["']([\w-]+)["']/g));

describe('IBM showcase UI contract', () => {
	for (const [page, mod] of Object.entries(PAGES)) {
		describe(`/ibm/${page}`, () => {
			const html = read(`pages/ibm/${page}.html`);
			const js = read(`src/${mod}.js`);

			it('loads its front-end engine module', () => {
				expect(html).toContain(`/src/${mod}.js`);
			});

			it('every DOM id the engine depends on exists in the page HTML', () => {
				const ids = htmlIds(html);
				const injected = injectedIds(js);
				const required = [...referencedIds(js)].filter((id) => !injected.has(id));
				const missing = required.filter((id) => !ids.has(id)).sort();
				expect(
					missing,
					`src/${mod}.js reads these ids that pages/ibm/${page}.html no longer defines`,
				).toEqual([]);
			});

			it('keeps its degraded-state containers (always-works UX)', () => {
				const ids = htmlIds(html);
				const missing = REQUIRED_STATE_IDS[page].filter((id) => !ids.has(id));
				expect(
					missing,
					`degraded-state container(s) removed from pages/ibm/${page}.html — the no-credentials UX would break`,
				).toEqual([]);
			});

			it('renders a no-JavaScript fallback instead of a blank canvas', () => {
				// These pages are pure client-rendered 3D; with JS disabled or the
				// bundle failing to load there is otherwise nothing to see. The
				// <noscript> fallback keeps the page meaningful and links onward.
				expect(html).toMatch(/<noscript>[\s\S]*?\/docs\/ibm[\s\S]*?<\/noscript>/);
			});
		});
	}
});
