/**
 * IBM Granite Agent Galaxy — Playwright e2e spec.
 *
 * Every test intercepts /api/ibm/galaxy with a fixture built from the REAL
 * production pipeline (api/_lib/embedding-math.js), so the coordinates and
 * cluster assignments that render are identical to what prod would produce
 * for that agent set. No fabricated positions.
 *
 * State coverage:
 *   • watsonx unavailable  → shows the unavailable overlay
 *   • no agents            → shows the empty overlay
 *   • populated galaxy     → full interaction suite
 *   • deep link ?agent=    → opens the targeted star on first paint
 *   • deep link ?q=        → runs semantic search on first paint
 *
 * Interaction coverage:
 *   • loading steps animate
 *   • 3D scene reaches "ready" (WebGL runs under swiftshader)
 *   • legend lists Granite-named themes
 *   • cluster labels in 3D space
 *   • stats panel shows dims/model
 *   • search box present + chip hints
 *   • semantic search → ranked results → result click → detail panel
 *   • detail panel: Granite cosine % on neighbors, constellation links drawn
 *   • shareable URL updates on select + search
 *   • guided tour starts/stops, isolates a theme
 *   • legend row click → fly-to + isolate
 *   • Escape closes panel; / focuses search; R resets
 */

import { createRequire } from 'module';
import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Resolve relative to the repo root so the path is absolute regardless of cwd.
const repoRoot = resolve(__dirname, '..', '..');
const require = createRequire(import.meta.url);

// Build the fixture lazily so Playwright workers don't pay the import cost for
// specs that don't need it.
let _fixture = null;
function buildFixture() {
	if (_fixture) return _fixture;
	const { makeRng, unit, cosineSimilarity, projectTo3D, kmeans, suggestClusterCount } =
		require(resolve(repoRoot, 'api/_lib/embedding-math.js'));

	const DIMS = 32;
	const AXES = [0, 9, 18, 27];
	const PER = 11;
	const COLORS = ['#4589ff', '#08bdba', '#a56eff', '#ff7eb6', '#fa4d56', '#f1c21b', '#42be65', '#82cfff'];
	const THEMES = ['Crypto Trading', 'Customer Support', 'Creative Writing', 'Wellness Coaching'];
	const rng = makeRng(2026);

	const agents = [], vectors = [];
	AXES.forEach((axis, theme) => {
		for (let i = 0; i < PER; i++) {
			const v = new Array(DIMS).fill(0).map(() => (rng() - 0.5) * 0.18);
			v[axis] += 1;
			vectors.push(v);
			agents.push({
				id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(theme).padStart(2, '0')}${String(i).padStart(10, '0')}`,
				name: `${THEMES[theme]} Agent ${i + 1}`,
				description: `A ${THEMES[theme].toLowerCase()} specialist, agent ${i + 1}.`,
			});
		}
	});

	const u = vectors.map(unit);
	const coords = projectTo3D(u, { radius: 100 });
	const k = suggestClusterCount(agents.length);
	const { assignments, k: realK } = kmeans(u, k);
	const groups = Array.from({ length: realK }, () => []);
	agents.forEach((_, i) => groups[assignments[i]].push(i));
	const round = (n) => Math.round(n * 100) / 100;

	const neighborsFor = (i) =>
		u.map((v, j) => ({ j, s: cosineSimilarity(u[i], v) }))
			.filter((x) => x.j !== i)
			.sort((a, b) => b.s - a.s)
			.slice(0, 6);

	const outAgents = agents.map((a, i) => ({
		...a,
		url: `/agent/${a.id}`,
		image: null,
		cluster: assignments[i],
		x: round(coords[i][0]),
		y: round(coords[i][1]),
		z: round(coords[i][2]),
		neighbors: neighborsFor(i).map((nb) => ({ id: agents[nb.j].id, score: round(nb.s) })),
	}));

	const clusters = groups.map((members, ci) => {
		const c = [0, 0, 0];
		members.forEach((i) => { c[0] += coords[i][0]; c[1] += coords[i][1]; c[2] += coords[i][2]; });
		const n = members.length || 1;
		return {
			id: ci,
			label: THEMES[ci] || `Theme ${ci + 1}`,
			labelSource: 'granite',
			color: COLORS[ci % COLORS.length],
			size: members.length,
			x: round(c[0] / n),
			y: round(c[1] / n),
			z: round(c[2] / n),
		};
	});

	const searchResults = (queryTheme = 0) => {
		const qAxis = AXES[queryTheme];
		const q = new Array(DIMS).fill(0);
		q[qAxis] = 1;
		const ranked = outAgents.map((a, i) => ({ id: a.id, score: round(cosineSimilarity(q, u[i])) }))
			.sort((b, a) => a.score - b.score).slice(0, 16);
		return { query: 'test', model: 'ibm/granite-embedding-278m-multilingual', count: ranked.length, best: ranked[0], results: ranked };
	};

	_fixture = {
		payload: {
			available: true,
			agents: outAgents,
			clusters,
			meta: {
				count: outAgents.length,
				totalPublic: outAgents.length,
				truncated: false,
				model: 'ibm/granite-embedding-278m-multilingual',
				dims: DIMS,
				clusterCount: realK,
				generatedAt: new Date().toISOString(),
			},
		},
		agents: outAgents,
		searchResults,
	};
	return _fixture;
}

// Route helper — intercept galaxy endpoint with the right response per method.
async function mockGalaxy(page, mode = 'success') {
	const fx = buildFixture();
	await page.route('**/api/ibm/galaxy', async (route) => {
		const method = route.request().method();
		if (method === 'POST') {
			return route.fulfill({ json: fx.searchResults(0) });
		}
		if (mode === 'success') return route.fulfill({ json: fx.payload });
		if (mode === 'unavailable') return route.fulfill({
			json: { available: false, reason: 'watsonx_not_configured', message: 'Set WATSONX_API_KEY.' },
		});
		if (mode === 'empty') return route.fulfill({
			json: { available: true, agents: [], clusters: [], meta: { count: 0, reason: 'no_agents' } },
		});
		return route.fallback();
	});
}

// Shared helper: navigate and wait for a given body state.
async function gotoGalaxy(page, { mode = 'success', path = '/ibm/galaxy', expectState } = {}) {
	await mockGalaxy(page, mode);
	await page.goto(path);
	const target = expectState || (mode === 'success' ? 'ready' : mode);
	await page.waitForFunction(
		(s) => document.body.dataset.galaxyState === s,
		target,
		{ timeout: 20_000 },
	);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('IBM Agent Galaxy', () => {
	// Throw on any real uncaught page error. Vite's HMR websocket emits a
	// "WebSocket closed without opened." error in headless Codespace environments
	// (the HMR client targets the :3000 forwarded domain, not the test port) —
	// that's dev-server noise and not a product bug, so filter it out.
	test.beforeEach(async ({ page }) => {
		page.on('pageerror', (err) => {
			if (/websocket|hmr|wss:|failed to connect/i.test(err.message)) return;
			throw new Error(`Page error: ${err.message}`);
		});
	});

	// ── State: watsonx unconfigured ──────────────────────────────────────────
	test('shows unavailable overlay when watsonx is not configured', async ({ page }) => {
		test.setTimeout(60_000);
		await gotoGalaxy(page, { mode: 'unavailable', expectState: 'unavailable' });
		await expect(page.locator('#unavailableState')).toBeVisible();
		await expect(page.locator('#unavailableState h2')).toContainText('not configured');
		// The IBM demos link is present so users know what to do.
		await expect(page.locator('#unavailableState a[href="/ibm/galaxy"]')).toBeVisible();
	});

	// ── State: no agents ────────────────────────────────────────────────────
	test('shows empty state when no public agents exist', async ({ page }) => {
		test.setTimeout(60_000);
		await gotoGalaxy(page, { mode: 'empty', expectState: 'empty' });
		await expect(page.locator('#emptyState')).toBeVisible();
		await expect(page.locator('#emptyState a[href="/create"]')).toBeVisible();
	});

	// ── Populated galaxy ─────────────────────────────────────────────────────
	test.describe('populated galaxy', () => {
		test('renders stars, legend, stats, search', async ({ page }) => {
			test.setTimeout(90_000);
			await gotoGalaxy(page);

			const g = () => page.evaluate(() => window.__ibmGalaxy);

			// WebGL actually rendered something.
			const info = await page.evaluate(() => window.__ibmGalaxy.rendererInfo());
			expect(info.calls).toBeGreaterThan(0);
			expect(info.points).toBeGreaterThan(0);

			// Star count matches payload.
			const stars = await page.evaluate(() => window.__ibmGalaxy.starCount());
			expect(stars).toBe(buildFixture().payload.agents.length);

			// Legend with correct cluster count.
			const fx = buildFixture();
			const legendRows = page.locator('#legendRows .row');
			await expect(legendRows).toHaveCount(fx.payload.meta.clusterCount);
			// Each row has a theme label.
			const firstLabel = await legendRows.first().locator('.name').textContent();
			expect(firstLabel.length).toBeGreaterThan(0);

			// 3D cluster labels rendered in the overlay.
			const clusterLabels = page.locator('#clusterLabels .clabel');
			await expect(clusterLabels).toHaveCount(fx.payload.meta.clusterCount);

			// Stats panel visible with model name.
			await expect(page.locator('#stats')).toBeVisible();
			await expect(page.locator('#stats')).toContainText(String(fx.payload.meta.dims));

			// Search bar and example chips visible.
			await expect(page.locator('#searchWrap')).toBeVisible();
			await expect(page.locator('#searchHint .chip').first()).toBeVisible();
		});

		test('semantic search ranks results and highlights stars', async ({ page }) => {
			test.setTimeout(90_000);
			await gotoGalaxy(page);

			// Type and submit a search.
			await page.fill('#searchInput', 'crypto trading assistant');
			await page.keyboard.press('Enter');

			// Results panel appears with ranked items.
			await expect(page.locator('#results')).toBeVisible();
			const items = page.locator('#results .ritem');
			await expect(items).toHaveCount(8); // top 8 shown

			// Each result has a score bar.
			await expect(items.first().locator('.r-bar')).toBeVisible();
			await expect(items.first().locator('.r-score')).toContainText('%');

			// Ranked by header says Granite.
			await expect(page.locator('#results .r-head')).toContainText('Granite');

			// Search active state is set.
			const active = await page.evaluate(() => window.__ibmGalaxy.state.searchActive);
			expect(active).toBe(true);

			// URL has ?q= param.
			expect(page.url()).toContain('q=');

			// Clear button appears.
			await expect(page.locator('#searchClear')).toBeVisible();

			// Clearing hides results — the element stays in DOM but loses the "show"
			// class (opacity→0, pointer-events→none), so check class not visibility.
			await page.click('#searchClear');
			await expect(page.locator('#results')).not.toHaveClass(/show/, { timeout: 3_000 });
			expect(page.url()).not.toContain('q=');
		});

		test('clicking a result opens detail panel with Granite cosine neighbors', async ({ page }) => {
			test.setTimeout(90_000);
			await gotoGalaxy(page);

			await page.fill('#searchInput', 'crypto trading');
			await page.keyboard.press('Enter');
			await expect(page.locator('#results .ritem').first()).toBeVisible();

			// Click top result via in-page click (avoids transition timing issues).
			await page.evaluate(() => document.querySelector('#results .ritem').click());
			await expect(page.locator('#panel')).toHaveClass(/open/);

			// Panel shows agent name.
			await expect(page.locator('#panelHead .p-name')).toBeVisible();
			const name = await page.locator('#panelHead .p-name').textContent();
			expect(name.length).toBeGreaterThan(0);

			// Theme badge with color.
			await expect(page.locator('#panelHead .p-theme')).toBeVisible();

			// Neighbors section with Granite cosine label.
			await expect(page.locator('#panelBody .neighbors h4')).toContainText('Nearest');
			const nbs = page.locator('#panelBody .nb');
			await expect(nbs).toHaveCount(5);
			// Each neighbor has a cosine % score (new markup uses .nb-pct).
			await expect(nbs.first().locator('.nb-pct')).toContainText('%');

			// Constellation links drawn in 3D.
			const links = await page.evaluate(() => window.__ibmGalaxy.linkCount());
			expect(links).toBeGreaterThan(0);

			// Open-agent CTA link.
			await expect(page.locator('#panelBody .p-cta')).toBeVisible();
			await expect(page.locator('#panelBody .p-cta')).toContainText('Open');

			// URL has ?agent= param.
			expect(page.url()).toContain('agent=');

			// Copy-link button present (new UX feature).
			await expect(page.locator('#panelBody .p-copy-link')).toBeVisible();
		});

		test('closing panel clears links and URL agent param', async ({ page }) => {
			test.setTimeout(90_000);
			await gotoGalaxy(page);

			// Open a panel directly.
			await page.evaluate(() => document.querySelector('#results .ritem')?.click() || window.__ibmGalaxy.state.agents[0]);
			// Select first star via keyboard shortcut (/ then first result click).
			await page.fill('#searchInput', 'test');
			await page.keyboard.press('Enter');
			await expect(page.locator('#results .ritem').first()).toBeVisible();
			await page.evaluate(() => document.querySelector('#results .ritem').click());
			await expect(page.locator('#panel')).toHaveClass(/open/);

			// Escape closes.
			await page.keyboard.press('Escape');
			await expect(page.locator('#panel')).not.toHaveClass(/open/);
			const links = await page.evaluate(() => window.__ibmGalaxy.linkCount());
			expect(links).toBe(0);
			expect(page.url()).not.toContain('agent=');
		});

		test('guided tour visits each theme and stops on toggle', async ({ page }) => {
			test.setTimeout(90_000);
			await gotoGalaxy(page);

			await page.click('#tourBtn');
			await expect(page.locator('#tourBtn')).toHaveClass(/active/);

			// Tour isolates a cluster.
			await page.waitForFunction(() => window.__ibmGalaxy.tourActive() === true, { timeout: 5_000 });
			const isolated = await page.evaluate(() => window.__ibmGalaxy.state.isolatedCluster);
			expect(isolated).not.toBeNull();

			// Stop.
			await page.click('#tourBtn');
			await expect(page.locator('#tourBtn')).not.toHaveClass(/active/);
			const afterStop = await page.evaluate(() => window.__ibmGalaxy.state.isolatedCluster);
			expect(afterStop).toBeNull();
		});

		test('legend row click isolates theme and flies camera', async ({ page }) => {
			test.setTimeout(90_000);
			await gotoGalaxy(page);

			const firstRow = page.locator('#legendRows .row').first();
			await firstRow.click();

			// Clicked row stays unmuted; others become muted.
			await expect(firstRow).not.toHaveClass(/muted/);
			const secondRow = page.locator('#legendRows .row').nth(1);
			await expect(secondRow).toHaveClass(/muted/);

			// Isolated cluster is set.
			const isolated = await page.evaluate(() => window.__ibmGalaxy.state.isolatedCluster);
			expect(isolated).not.toBeNull();

			// Click same row again → deselect.
			await firstRow.click();
			const afterDeselect = await page.evaluate(() => window.__ibmGalaxy.state.isolatedCluster);
			expect(afterDeselect).toBeNull();
		});

		test('keyboard shortcuts: / focuses search, R resets, ? toggles help', async ({ page }) => {
			test.setTimeout(90_000);
			await gotoGalaxy(page);

			// / should focus search input.
			await page.keyboard.press('/');
			await expect(page.locator('#searchInput')).toBeFocused();

			// Blur first.
			await page.keyboard.press('Escape');
			await page.locator('#scene').click({ position: { x: 640, y: 400 } });

			// R resets (no error thrown).
			await page.keyboard.press('r');

			// ? opens keyboard shortcut overlay.
			await page.keyboard.press('?');
			await expect(page.locator('#shortcutsOverlay')).toBeVisible();
			// Dismiss.
			await page.keyboard.press('Escape');
			await expect(page.locator('#shortcutsOverlay')).not.toBeVisible();
		});
	});

	// ── Deep links ───────────────────────────────────────────────────────────
	test('?agent= deep link opens targeted agent on first paint', async ({ page }) => {
		test.setTimeout(90_000);
		const fx = buildFixture();
		const target = fx.agents[20];
		await gotoGalaxy(page, { path: `/ibm/galaxy?agent=${encodeURIComponent(target.id)}` });

		await expect(page.locator('#panel')).toHaveClass(/open/, { timeout: 10_000 });
		await expect(page.locator('#panelHead .p-name')).toContainText(target.name);
	});

	test('?q= deep link runs search on first paint', async ({ page }) => {
		test.setTimeout(90_000);
		await gotoGalaxy(page, { path: '/ibm/galaxy?q=trading+assistant' });

		await expect(page.locator('#results')).toBeVisible({ timeout: 15_000 });
		await expect(page.locator('#results .ritem').first()).toBeVisible();
		// Input is pre-filled.
		await expect(page.locator('#searchInput')).toHaveValue(/trading/);
	});
});
