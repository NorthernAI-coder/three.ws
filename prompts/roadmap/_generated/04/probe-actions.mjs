import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';

const OUT = '/workspaces/three.ws/prompts/roadmap/_generated/04';
const browser = await chromium.launch();
const page = await browser.newPage();
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error' && !/websocket|WebSocket/i.test(m.text())) consoleErrors.push(m.text()); });
page.on('pageerror', (e) => { if (!/WebSocket/i.test(e.message)) consoleErrors.push('pageerror: ' + e.message); });

await page.setViewportSize({ width: 1440, height: 900 });
await page.goto('http://localhost:3000/scene', { waitUntil: 'load', timeout: 60000 });
await page.waitForTimeout(2000);

const log = [];
const l = (...a) => { console.log(...a); log.push(a.map(String).join(' ')); };

// ── Export menu opens and shows both presets ──
await page.click('.tws-sa-btn[data-action="export"]');
await page.waitForTimeout(200);
const menuItems = await page.$$eval('.tws-sa-menu button', (els) => els.map((e) => e.textContent.trim()));
l('export menu items:', JSON.stringify(menuItems));

// Click "Web GLB" preset and confirm a real download fires.
const [download] = await Promise.all([
	page.waitForEvent('download', { timeout: 10000 }),
	page.click('.tws-sa-menu button[data-preset="glb"]'),
]);
const path = await download.path();
const fs = await import('node:fs');
const size = path ? fs.statSync(path).size : 0;
l('GLB export download filename:', download.suggestedFilename(), 'bytes:', size);

// ── Share flow: export + upload + open embed panel with the new agent-3d tab ──
await page.click('.tws-sa-btn[data-action="share"]');
const modalAppeared = await page.waitForSelector('.tws-emb', { timeout: 20000 }).then(() => true).catch(() => false);
l('share embed panel opened:', modalAppeared);
if (modalAppeared) {
	const tabs = await page.$$eval('.tws-emb-tab', (els) => els.map((e) => e.textContent.trim()));
	l('embed panel tabs:', JSON.stringify(tabs));
	// Switch to the <agent-3d> tab and read the generated snippet.
	const agent3dTab = await page.$$('.tws-emb-tab');
	for (const t of agent3dTab) {
		const text = await t.textContent();
		if (text.includes('agent-3d')) { await t.click(); break; }
	}
	await page.waitForTimeout(150);
	const snippet = await page.$eval('#tws-emb-code', (el) => el.value);
	l('agent-3d snippet:', snippet);
}

l('console errors (excl. WS):', consoleErrors.length);
for (const e of consoleErrors) l('  -', e);

writeFileSync(`${OUT}/scene-actions-probe.log`, log.join('\n') + '\n');
await browser.close();
