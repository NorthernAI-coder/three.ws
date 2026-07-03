// ui-agent-info.mjs — find an agent by name in the signed-in UI and read its id +
// Solana wallet address (from /agent/{id}/edit → Wallet panel). Recorded.
// Usage: NAME="Scout 01" node scripts/ui-agent-info.mjs

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'https://three.ws';
const OUT = process.env.OUT || '/tmp/ui-agent-info';
const NAME = process.env.NAME || 'Scout 01';
const STATE = path.join(os.homedir(), '.three-ws-fleet', 'state.json');

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--disable-dev-shm-usage'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, storageState: STATE });
const page = await ctx.newPage();
const shot = (n) => page.screenshot({ path: path.join(OUT, `${n}.png`) }).catch(() => {});

try {
	await page.goto(`${BASE}/agents`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
	await page.waitForTimeout(3500);
	await shot('agents-list');

	// find the agent link whose card text includes NAME, capture its id from href
	const info = await page.evaluate((name) => {
		const links = [...document.querySelectorAll('a[href]')];
		for (const a of links) {
			const txt = (a.innerText || '').trim();
			const href = a.getAttribute('href') || '';
			if (txt.includes(name)) {
				const m = href.match(/([0-9a-f-]{36})/i);
				if (m) return { id: m[1], href };
			}
		}
		// fallback: scan any element with the name, walk up to an <a>
		for (const el of document.querySelectorAll('*')) {
			if ((el.textContent || '').trim() === name) {
				const a = el.closest('a[href]');
				const m = a && a.getAttribute('href').match(/([0-9a-f-]{36})/i);
				if (m) return { id: m[1], href: a.getAttribute('href') };
			}
		}
		return null;
	}, NAME).catch(() => null);

	if (!info) { console.log(`✗ could not find agent "${NAME}" in /agents`); await shot('not-found'); throw new Error('agent not found in UI'); }
	console.log(`agent "${NAME}" id: ${info.id}`);

	// open its edit page → Wallet panel → read the Solana address
	await page.goto(`${BASE}/agent/${info.id}/edit`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
	await page.waitForTimeout(3500);
	// try to click a "Wallet" tab/panel if present
	const walletTab = await page.$('text=Wallet');
	if (walletTab) { await walletTab.click().catch(() => {}); await page.waitForTimeout(1500); }
	await shot('agent-wallet');

	const addr = await page.evaluate(() => {
		const el = document.querySelector('#wallet-sol-address, [id*="sol-address"], [class*="sol-address"]');
		let a = el ? el.textContent.trim() : '';
		if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a)) {
			// scan for a base58-looking pubkey on the page
			const m = document.body.innerText.match(/\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/);
			a = m ? m[0] : '';
		}
		return a;
	}).catch(() => '');
	console.log(`solana wallet: ${addr || '(not found on page — check agent-wallet.png)'}`);

	fs.writeFileSync(path.join(OUT, 'info.json'), JSON.stringify({ name: NAME, id: info.id, wallet: addr }, null, 2));
} catch (err) {
	console.log('✗', err.message.slice(0, 160));
	await shot('error');
} finally {
	await page.waitForTimeout(300);
	await ctx.close();
	await browser.close();
	console.log('out:', OUT);
}
