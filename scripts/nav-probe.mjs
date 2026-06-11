// Probe the refactored shared nav on the dev server: homepage + a nav-container
// page must render identical data-driven menus with no console errors.
import { chromium } from 'playwright';

const BASE = process.env.PROBE_BASE || 'http://localhost:3000';
const failures = [];
const check = (label, ok, detail = '') => {
	console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ' — ' + detail : ''}`);
	if (!ok) failures.push(label);
};

const browser = await chromium.launch({ args: ['--disable-dev-shm-usage', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const consoleErrors = [];
page.on('console', (msg) => {
	if (msg.type() === 'error') consoleErrors.push(msg.text());
});
page.on('pageerror', (err) => consoleErrors.push(String(err)));

async function snapshotNav(url) {
	await page.goto(BASE + url, { waitUntil: 'domcontentloaded' });
	await page.waitForSelector('.nav-main .nav-grp', { state: 'attached', timeout: 20000 });
	return page.evaluate(() => {
		const groups = [...document.querySelectorAll('.nav-main .nav-grp')].map((g) => ({
			label: g.querySelector('.nav-trigger').textContent.trim().replace(/[▾\s]+$/, ''),
			items: [...g.querySelectorAll('.nav-mi')].map((a) => ({
				title: a.querySelector('.nav-mi-t').textContent.trim(),
				href: a.getAttribute('href'),
			})),
		}));
		const topLinks = [...document.querySelectorAll('.nav-main > a')].map((a) => a.textContent.trim());
		const drawerLinks = document.querySelectorAll('#nav-drawer a').length;
		return { groups, topLinks, drawerLinks };
	});
}

// ── Homepage ────────────────────────────────────────────────────────────────
const home = await snapshotNav('/');
check('homepage renders 6 dropdown groups', home.groups.length === 6, home.groups.map((g) => g.label).join(', '));
check('homepage has Integrations group', home.groups.some((g) => g.label.startsWith('Integrations')));
check('homepage has Pricing top-level link', home.topLinks.includes('Pricing'));

const discover = home.groups.find((g) => g.label === 'Discover');
const marketplaceLabels = discover.items.filter((i) => i.title === 'Marketplace');
check('Discover has exactly one item labeled "Marketplace"', marketplaceLabels.length === 1);
check('Discover has "x402 Bazaar" → /bazaar', discover.items.some((i) => i.title === 'x402 Bazaar' && i.href === '/bazaar'));

const build = home.groups.find((g) => g.label === 'Build');
check('Build menu has all 12 items', build.items.length === 12, String(build.items.length));

const labs = home.groups.find((g) => g.label.startsWith('Labs'));
check('Labs has no dead /rider link', !labs.items.some((i) => i.href === '/rider'));
check('drawer rendered with full link set', home.drawerLinks > 60, String(home.drawerLinks));

// Labs mega menu: open it, confirm every item is reachable (scrollable, not clipped)
await page.hover('.nav-main .nav-grp:nth-last-of-type(1) .nav-trigger');
await page.waitForTimeout(300);
const mega = await page.evaluate(() => {
	const pop = document.querySelector('.nav-pop.mega');
	const s = getComputedStyle(pop);
	const last = pop.querySelector('.nav-col:last-child .nav-mi:last-child');
	last.scrollIntoView({ block: 'nearest' });
	const r = last.getBoundingClientRect();
	return {
		overflowY: s.overflowY,
		maxHeight: s.maxHeight,
		lastItemVisible: r.bottom <= window.innerHeight && r.height > 0,
		lastItemTitle: last.querySelector('.nav-mi-t').textContent.trim(),
	};
});
await page.screenshot({ path: '/tmp/nav-labs-open.png' });
check('Labs mega menu scrolls', mega.overflowY === 'auto', mega.maxHeight);
check('Labs tail item reachable', mega.lastItemVisible, mega.lastItemTitle);

// Short-viewport regression: the bug from the screenshots
await page.setViewportSize({ width: 1280, height: 640 });
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('.nav-main .nav-grp', { state: 'attached' });
await page.hover('.nav-main .nav-grp:nth-last-of-type(1) .nav-trigger');
await page.waitForTimeout(300);
const short = await page.evaluate(() => {
	const pop = document.querySelector('.nav-pop.mega');
	const last = pop.querySelector('.nav-col:last-child .nav-mi:last-child');
	const popRect = pop.getBoundingClientRect();
	last.scrollIntoView({ block: 'nearest' });
	const r = last.getBoundingClientRect();
	return { popBottom: popRect.bottom, vh: window.innerHeight, lastReachable: r.bottom <= window.innerHeight };
});
check('640px viewport: mega menu fits viewport', short.popBottom <= short.vh, `bottom ${Math.round(short.popBottom)} vs ${short.vh}`);
check('640px viewport: last Labs item reachable by scroll', short.lastReachable);
await page.setViewportSize({ width: 1440, height: 900 });

// Keyboard: Escape closes, focus returns
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('.nav-main .nav-grp', { state: 'attached' });
await page.click('.nav-main .nav-grp:first-of-type .nav-trigger');
await page.keyboard.press('Tab');
await page.keyboard.press('Escape');
const escState = await page.evaluate(() => ({
	open: !!document.querySelector('.nav-grp.open'),
	focusOnTrigger: document.activeElement.classList.contains('nav-trigger'),
}));
check('Escape closes menu and restores focus', !escState.open && escState.focusOnTrigger);

// ── A page that always used the injected nav must match the homepage ───────
const agents = await snapshotNav('/agents');
check(
	'homepage nav identical to /agents nav',
	JSON.stringify(home.groups) === JSON.stringify(agents.groups) &&
		JSON.stringify(home.topLinks) === JSON.stringify(agents.topLinks),
);

// ── Mobile drawer ───────────────────────────────────────────────────────────
await page.setViewportSize({ width: 375, height: 800 });
await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#nav-toggle', { state: 'attached' });
await page.click('#nav-toggle');
await page.waitForTimeout(300);
const drawer = await page.evaluate(() => {
	const d = document.querySelector('#nav-drawer');
	const headers = [...d.querySelectorAll('.dr-h')].map((h) => h.textContent.trim());
	return { open: d.classList.contains('open'), headers };
});
await page.screenshot({ path: '/tmp/nav-drawer.png' });
check('mobile drawer opens', drawer.open);
check('drawer has Integrations section', drawer.headers.includes('Integrations'));
check('drawer has Labs column sections', drawer.headers.some((h) => h.startsWith('Labs ·')));

const navErrors = consoleErrors.filter(
	(e) => !/favicon|third-party|net::ERR_|404|Failed to load resource|WebSocket|\[vite\]/i.test(e),
);
check('no console errors from nav code', navErrors.length === 0, navErrors.slice(0, 3).join(' | '));

await browser.close();
console.log(failures.length ? `\n${failures.length} FAILURES` : '\nALL CHECKS PASSED');
process.exit(failures.length ? 1 : 0);
