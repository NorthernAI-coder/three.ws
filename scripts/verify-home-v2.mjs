import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (msg) => {
	if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
});

await page.goto('http://localhost:3000/home-v2', { waitUntil: 'domcontentloaded' });

await page.locator('#hv2-chips .hv2-chip[data-anim="dance"]').waitFor({ state: 'attached', timeout: 6000 });
await page.locator('#hv2-tryme').waitFor({ state: 'attached', timeout: 6000 });

// Wait for the viewer to actually load the model + animations.
// Act2Viewer plays "falling" on first load; once viewer.currentAction is set we can poke it.
await page.waitForFunction(
	() => {
		const c = document.getElementById('hero-avatar');
		return c && parseFloat(getComputedStyle(c).opacity) > 0.5;
	},
	{ timeout: 20000 },
);

const beforeCount = await page.locator('#hv2-counter-num').innerText();
const trymeHiddenBefore = await page.locator('#hv2-tryme').evaluate((el) => el.classList.contains('is-hidden'));

await page.click('.hv2-chip[data-anim="dance"]');
await page.waitForTimeout(800);

const afterCount = await page.locator('#hv2-counter-num').innerText();
const trymeHiddenAfter = await page.locator('#hv2-tryme').evaluate((el) => el.classList.contains('is-hidden'));
const danceActive = await page.locator('.hv2-chip[data-anim="dance"]').evaluate((el) => el.dataset.active === 'true');

await page.click('.hv2-chip[data-anim="wave"]');
await page.waitForTimeout(600);
const after2Count = await page.locator('#hv2-counter-num').innerText();

await page.screenshot({ path: '/tmp/home-v2-hero.png', fullPage: false });

console.log(JSON.stringify({
	beforeCount,
	afterCount,
	after2Count,
	trymeHiddenBefore,
	trymeHiddenAfter,
	danceActive,
	errors,
}, null, 2));

await browser.close();
