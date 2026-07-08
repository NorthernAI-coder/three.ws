import { chromium } from '@playwright/test';
const browser = await chromium.launch();
for (const [label, width, height] of [['320', 320, 640], ['768', 768, 1024], ['1440', 1440, 900]]) {
	const page = await browser.newPage({ viewport: { width, height } });
	await page.goto('http://localhost:3061/scene', { waitUntil: 'load', timeout: 60000 });
	await page.waitForTimeout(1500);
	const rects = await page.evaluate(() => {
		const bar = document.querySelector('.tws-sa-bar')?.getBoundingClientRect();
		const menubar = document.querySelector('#menubar')?.getBoundingClientRect();
		return { bar: bar && { x: bar.x, y: bar.y, w: bar.width, h: bar.height, right: bar.right, bottom: bar.bottom }, menubar: menubar && { x: menubar.x, y: menubar.y, w: menubar.width, h: menubar.height, right: menubar.right, bottom: menubar.bottom } };
	});
	function overlaps(a, b) {
		if (!a || !b) return null;
		return !(a.right < b.x || b.right < a.x || a.bottom < b.y || b.bottom < a.y);
	}
	console.log(label + 'px:', JSON.stringify(rects), 'OVERLAP:', overlaps(rects.bar, rects.menubar));
	await page.close();
}
await browser.close();
