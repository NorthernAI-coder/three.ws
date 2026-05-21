import { chromium } from 'playwright';
const browser = await chromium.launch({
	args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

page.on('pageerror', (e) => console.log('PAGEERROR:', e.message, '\n', e.stack?.slice(0, 500)));
page.on('console', (m) => {
	const t = m.type();
	if (t === 'error' || t === 'warning') console.log(`[${t}]`, m.text());
});
page.on('crash', () => console.log('PAGE CRASHED'));

try {
	await page.goto('http://localhost:3000/home-v2', { waitUntil: 'domcontentloaded', timeout: 15000 });
	console.log('NAV: ok');
	await page.waitForTimeout(2000);
	console.log('AFTER WAIT');
	const has = await page.evaluate(() => ({
		tryme: !!document.getElementById('hv2-tryme'),
		chips: !!document.getElementById('hv2-chips'),
		bodyLen: document.body?.innerHTML.length || 0,
	}));
	console.log('STATE:', JSON.stringify(has));
} catch (e) {
	console.log('OUTER ERROR:', e.message);
}

await page.screenshot({ path: '/tmp/home-v2-debug.png' }).catch(() => {});
await browser.close();
