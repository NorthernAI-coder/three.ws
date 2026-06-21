#!/usr/bin/env node
// Visual smoke test for the redesigned modal: opens it against the local
// merchant and screenshots the connect screen (token picker + wallet + trust
// line) in light and dark. Needs no funds — it stops before signing.
//
//   node scripts/x402-modal/screenshot.mjs

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import bs58 from 'bs58';
import { chromium } from 'playwright';
import { loadBuyer } from './_lib.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8412);
const BASE = `http://localhost:${PORT}`;
const buyer = loadBuyer();
const pub = buyer.publicKey.toBase58();

function startMerchant() {
	const child = spawn('node', [join(__dirname, 'merchant-server.mjs')], {
		env: { ...process.env, PORT: String(PORT), BUYER: pub, X402_TEST_KEY: bs58.encode(buyer.secretKey) },
		stdio: ['ignore', 'pipe', 'inherit'],
	});
	return new Promise((resolve, reject) => {
		const to = setTimeout(() => reject(new Error('merchant did not start')), 10000);
		child.stdout.on('data', (d) => { if (String(d).includes('merchant+settler on')) { clearTimeout(to); resolve(child); } });
	});
}

const merchant = await startMerchant();
const browser = await chromium.launch({ headless: true });
let failed = false;
try {
	for (const scheme of ['light', 'dark']) {
		const ctx = await browser.newContext({ colorScheme: scheme, viewport: { width: 480, height: 820 } });
		const page = await ctx.newPage();
		await page.emulateMedia({ colorScheme: scheme });
		await page.addInitScript(({ secret, pubkey }) => {
			window.__X402_SECRET = secret; window.__X402_PUBKEY = pubkey;
		}, { secret: Array.from(buyer.secretKey), pubkey: pub });
		await page.goto(BASE, { waitUntil: 'networkidle' });
		await page.waitForFunction(() => window.__startPay && window.solana?.isPhantom, null, { timeout: 15000 });
		await page.evaluate(() => window.__startPay('USDC'));
		await page.waitForSelector('.x402-wallet-btn', { timeout: 15000 });
		await page.waitForSelector('.x402-trust', { timeout: 5000 }).catch(() => {});
		await page.waitForTimeout(400); // let the enter animation settle
		const out = join(__dirname, `modal-connect-${scheme}.png`);
		await page.screenshot({ path: out });
		console.log(`✓ ${scheme}: ${out}`);
		await ctx.close();
	}
} catch (e) {
	failed = true;
	console.error('✗ screenshot failed:', e.message);
} finally {
	await browser.close().catch(() => {});
	merchant.kill();
}
process.exit(failed ? 1 : 0);
