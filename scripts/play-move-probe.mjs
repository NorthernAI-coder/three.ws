import { chromium } from 'playwright';

const URL = process.env.PROBE_URL || 'http://localhost:3000/play';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));

await page.goto(URL, { waitUntil: 'domcontentloaded' });

// 1) Click the real lobby card (general world entry).
await page.waitForSelector('.cc-card', { timeout: 15000 });
await page.click('.cc-card');

// 2) Wait for the world.
const reachedWorld = await page.waitForFunction(() => window.__CC__?.phase === 'world', { timeout: 20000 }).then(() => true).catch(() => false);

const atEntry = await page.evaluate(() => {
	const g = window.__CC__;
	return {
		phase: g?.phase,
		activeEl: document.activeElement?.tagName + (document.activeElement?.id ? '#' + document.activeElement.id : ''),
		chatFocused: !!g?.ui?.chatFocused,
		joystickExists: !!document.getElementById('cc-joystick'),
		pos: g?.localPos ? { x: +g.localPos.x.toFixed(3), z: +g.localPos.z.toFixed(3) } : null,
	};
});

// 3) Real keyboard: hold W.
const kbBefore = await page.evaluate(() => ({ ...window.__CC__.localPos }));
await page.keyboard.down('KeyW');
await page.waitForTimeout(700);
const kbWhileDown = await page.evaluate(() => ({ keysHasW: window.__CC__.keys.has('w'), ...window.__CC__.localPos }));
await page.keyboard.up('KeyW');
const kbMoved = Math.abs(kbBefore.x - kbWhileDown.x) > 0.02 || Math.abs(kbBefore.z - kbWhileDown.z) > 0.02;

// 4) Joystick: drag the thumb up from center and hold.
const joyBefore = await page.evaluate(() => ({ ...window.__CC__.localPos }));
const box = await page.evaluate(() => {
	const z = document.getElementById('cc-joystick');
	if (!z) return null;
	const r = z.getBoundingClientRect();
	return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
});
let joyMoved = null, joyVec = null;
if (box) {
	await page.mouse.move(box.cx, box.cy);
	await page.mouse.down();
	await page.mouse.move(box.cx, box.cy - 60, { steps: 4 }); // push "up"
	await page.waitForTimeout(500);
	joyVec = await page.evaluate(() => window.__CC__._joy);
	const joyWhile = await page.evaluate(() => ({ ...window.__CC__.localPos }));
	await page.mouse.up();
	joyMoved = Math.abs(joyBefore.x - joyWhile.x) > 0.02 || Math.abs(joyBefore.z - joyWhile.z) > 0.02;
}

console.log('REACHED_WORLD:', reachedWorld);
console.log('AT_ENTRY:', JSON.stringify(atEntry));
console.log('KEYBOARD: before', JSON.stringify(kbBefore), 'while', JSON.stringify(kbWhileDown), '=> moved', kbMoved);
console.log('JOYSTICK: vec', JSON.stringify(joyVec), '=> moved', joyMoved);
console.log('\nCONSOLE (avatar/move relevant):');
console.log(logs.filter((l) => /avatar|meshopt|move|joy|chat|error|Error/i.test(l)).slice(-15).join('\n'));

await browser.close();
