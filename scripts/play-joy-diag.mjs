import { chromium } from 'playwright';

const URL = process.env.PROBE_URL || 'http://localhost:3000/play';
const sizes = [{ w: 390, h: 780, label: 'iphone12' }, { w: 360, h: 640, label: 'androidS' }, { w: 768, h: 1024, label: 'ipad' }];
const browser = await chromium.launch();

for (const sz of sizes) {
	const page = await browser.newPage({ viewport: { width: sz.w, height: sz.h }, hasTouch: true, isMobile: true });
	await page.goto(URL, { waitUntil: 'domcontentloaded' });
	await page.waitForSelector('.cc-card', { timeout: 15000 });
	await page.tap('.cc-card');
	await page.waitForFunction(() => window.__CC__?.phase === 'world', { timeout: 20000 }).catch(() => {});
	await page.waitForTimeout(900);
	await page.evaluate(() => { const ov = document.getElementById('po-overlay'); ov?.querySelector('.po-close')?.click(); });
	await page.waitForTimeout(400);

	const r = await page.evaluate(() => {
		const rect = (sel) => { const e = document.querySelector(sel); if (!e) return null; const b = e.getBoundingClientRect(); const s = getComputedStyle(e); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height), z: s.zIndex, pe: s.pointerEvents }; };
		const joy = document.getElementById('cc-joystick').getBoundingClientRect();
		// Sample 5 points across the joystick face; report what's on top at each.
		const pts = [[0.5, 0.5], [0.5, 0.15], [0.2, 0.5], [0.8, 0.5], [0.5, 0.85]];
		const hits = pts.map(([fx, fy]) => {
			const x = joy.left + joy.width * fx, y = joy.top + joy.height * fy;
			const t = document.elementFromPoint(x, y);
			return `${fx},${fy}=>${t ? (t.id ? '#' + t.id : t.tagName + '.' + String(t.className).split(' ').filter(Boolean)[0]) : 'null'}`;
		});
		return { joystick: rect('#cc-joystick'), hotbar: rect('.ps-hotbar'), psHud: rect('#ps-hud'), ccHud: rect('#cc-hud'), hits };
	});
	console.log(`\n=== ${sz.label} (${sz.w}x${sz.h}) ===`);
	console.log('joystick:', JSON.stringify(r.joystick));
	console.log('ps-hotbar:', JSON.stringify(r.hotbar));
	console.log('#ps-hud  :', JSON.stringify(r.psHud));
	console.log('hits across joystick face:');
	r.hits.forEach((h) => console.log('  ', h));
	await page.close();
}
await browser.close();
