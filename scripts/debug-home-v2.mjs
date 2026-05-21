import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE.ERR:', m.text()); });

await page.goto('http://localhost:3000/home-v2', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);

const info = await page.evaluate(() => {
	const wrap = document.getElementById('hv2-chips-wrap');
	const chips = document.getElementById('hv2-chips');
	const tryme = document.getElementById('hv2-tryme');
	const danceChip = document.querySelector('.hv2-chip[data-anim="dance"]');
	const heroAct = document.querySelector('.h-hero-act');
	const r = (el) => el ? el.getBoundingClientRect().toJSON() : null;
	const cs = (el) => {
		if (!el) return null;
		const s = getComputedStyle(el);
		return { display: s.display, visibility: s.visibility, opacity: s.opacity, position: s.position, zIndex: s.zIndex, pointerEvents: s.pointerEvents };
	};
	return {
		wrapExists: !!wrap, chipsExists: !!chips, danceExists: !!danceChip, trymeExists: !!tryme,
		wrapRect: r(wrap), chipsRect: r(chips), danceRect: r(danceChip), trymeRect: r(tryme), heroRect: r(heroAct),
		wrapCs: cs(wrap), chipsCs: cs(chips), danceCs: cs(danceChip), trymeCs: cs(tryme),
	};
});
console.log(JSON.stringify(info, null, 2));
await page.screenshot({ path: '/tmp/home-v2-debug.png' });
await browser.close();
