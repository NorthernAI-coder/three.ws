import puppeteer from 'puppeteer';

const URL = process.argv[2] || 'http://localhost:3001/trades';
const browser = await puppeteer.launch({ args: ['--no-sandbox'], headless: 'new' });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 1000 });

const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 }).catch((e) => errors.push('GOTO: ' + e.message));
await new Promise((r) => setTimeout(r, 8000)); // let data + chart + bubblemap settle

const snap = await page.evaluate(() => {
	const txt = (sel) => document.querySelector(sel)?.textContent?.trim() || null;
	const feedRows = document.querySelectorAll('#ttFeed [data-mint]').length;
	const sections = [...document.querySelectorAll('.dd-card[data-section]')].map((c) => {
		const id = c.dataset.section;
		const b = c.querySelector('.dd-card-b');
		const skel = !!b?.querySelector('.dd-skel');
		const na = !!b?.querySelector('.dd-note--na');
		const filled = b && b.children.length > 0 && !skel;
		return { id, skel, na, filled, len: (b?.textContent || '').length };
	});
	return {
		title: document.title,
		heroSym: txt('.dd-hero-sym'),
		strip: txt('.dd-strip'),
		pulseMints: txt('#ttPulseMints'),
		pulseSol: txt('#ttPulseSol'),
		feedRows,
		hasChartCanvas: !!document.querySelector('.dd-chart canvas'),
		hasBubbleCanvas: !!document.querySelector('.bm-canvas'),
		tapeRows: document.querySelectorAll('.tp-row').length,
		tapeMsg: txt('.tp-msg'),
		sections,
	};
});

console.log('URL:', URL);
console.log(JSON.stringify(snap, null, 2));
console.log('\nCONSOLE ERRORS (' + errors.length + '):');
errors.slice(0, 25).forEach((e) => console.log(' •', e.slice(0, 200)));

await page.screenshot({ path: '/tmp/claude-1000/-workspaces-three-ws/0a1c2957-b3c5-41d3-8b9b-dcdbdbe28417/scratchpad/trades.png', fullPage: true });
await browser.close();
