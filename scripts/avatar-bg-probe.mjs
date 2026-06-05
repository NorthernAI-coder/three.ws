import puppeteer from 'puppeteer';

const browser = await puppeteer.launch({
	headless: 'new',
	args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage();
await page.setViewport({ width: 400, height: 420, deviceScaleFactor: 2 });
page.on('console', (m) => console.log('[page]', m.text()));
page.on('pageerror', (e) => console.log('[pageerr]', e.message));
await page.goto('http://localhost:4599/', { waitUntil: 'networkidle0', timeout: 30000 });
// Give the GLB + WebGL time to render
await new Promise((r) => setTimeout(r, 6000));

const info = await page.evaluate(() => {
	const el = document.querySelector('agent-3d');
	const out = { found: !!el };
	if (el) {
		const cs = getComputedStyle(el);
		out.hostBg = cs.backgroundColor;
		const sr = el.shadowRoot;
		out.hasShadow = !!sr;
		if (sr) {
			const canvas = sr.querySelector('canvas');
			out.hasCanvas = !!canvas;
			if (canvas) out.canvasBg = getComputedStyle(canvas).backgroundColor;
			const stage = sr.querySelector('.stage');
			if (stage) out.stageBg = getComputedStyle(stage).backgroundColor;
			const poster = sr.querySelector('.poster');
			if (poster) out.posterStyle = { bg: getComputedStyle(poster).backgroundColor, img: getComputedStyle(poster).backgroundImage, opacity: getComputedStyle(poster).opacity };
			// list direct shadow children with their bg
			out.children = [...sr.children].map((c) => ({ tag: c.tagName, cls: c.className, bg: getComputedStyle(c).backgroundColor, op: getComputedStyle(c).opacity }));
		}
	}
	return out;
});
console.log(JSON.stringify(info, null, 2));
await page.screenshot({ path: 'scripts/avatar-bg-probe.png' });
console.log('screenshot saved');
await browser.close();
