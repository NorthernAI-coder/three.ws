#!/usr/bin/env node
// Browser end-to-end test of @three-ws/x402-payment-modal: loads the real modal
// source in Chromium, injects a keypair-backed Phantom-shaped provider (no
// extension), and drives the actual modal UI — token picker → connect → sign →
// settle — for BOTH Solana tokens against the local merchant+settler.
//
//   node scripts/x402-modal/run-browser.mjs
//   HEADED=1 node scripts/x402-modal/run-browser.mjs   # watch it
//
// Spawns merchant-server.mjs itself; settles on-chain (self-transfer).

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import bs58 from 'bs58';
import { chromium } from 'playwright';
import { loadBuyer, USDC_MINT, THREE_MINT } from './_lib.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8402);
const BASE = `http://localhost:${PORT}`;
const HEADED = !!process.env.HEADED;

const buyer = loadBuyer();
const pub = buyer.publicKey.toBase58();

function startMerchant() {
	const child = spawn('node', [join(__dirname, 'merchant-server.mjs')], {
		env: { ...process.env, PORT: String(PORT), BUYER: pub, X402_TEST_KEY: bs58.encode(buyer.secretKey) },
		stdio: ['ignore', 'pipe', 'inherit'],
	});
	return new Promise((resolve, reject) => {
		const to = setTimeout(() => reject(new Error('merchant server did not start in time')), 10000);
		child.stdout.on('data', (d) => {
			process.stdout.write(`[merchant] ${d}`);
			if (String(d).includes('merchant+settler on')) { clearTimeout(to); resolve(child); }
		});
	});
}

async function payToken(page, label, mint) {
	console.log(`\n--- modal pay: ${label} ---`);
	await page.evaluate((l) => window.__startPay(l), label);
	await page.waitForSelector('.x402-modal', { timeout: 15000 });
	// Pick the token (pills only render when >1 Solana accept).
	const pill = page.locator(`[data-token-asset="${mint}"]`);
	if (await pill.count()) {
		await pill.first().click();
		console.log('  selected token pill');
	}
	await page.locator('[data-wallet="phantom"]').first().click();
	console.log('  clicked Phantom → signing + settling…');

	// Terminal state = pay() settled OR the modal rendered an in-modal error
	// (the failure path doesn't reject pay(); it shows a "Try again" box).
	const done = await page.waitForFunction(() => {
		if (window.__x402done) return window.__x402done;
		const box = document.querySelector('.x402-error-box');
		if (box) return { ok: false, detail: { message: box.textContent.trim() } };
		return null;
	}, null, { timeout: 90000 }).then((h) => h.jsonValue());
	const shot = join(__dirname, `browser-${label}.png`);
	await page.screenshot({ path: shot, fullPage: true }).catch(() => {});
	if (!done.ok) throw new Error(`${label} modal failed: ${JSON.stringify(done.detail)}`);

	const sig = done.detail?.payment?.transaction || done.detail?.response?.headers?.['x-payment-response'];
	console.log(`  ✓ ${label} paid via modal. tx: ${sig || '(see result)'}`);
	console.log(`    screenshot: ${shot}`);
	// Reset for next token.
	const close = page.locator('[data-close]');
	if (await close.count()) await close.first().click().catch(() => {});
	return done.detail;
}

let merchant;
let browser;
let failed = false;
try {
	merchant = await startMerchant();
	browser = await chromium.launch({ headless: !HEADED });
	const page = await browser.newPage();
	page.on('console', (m) => { if (m.type() === 'error') console.log('  [page error]', m.text()); });

	await page.addInitScript(({ secret, pubkey }) => {
		window.__X402_SECRET = secret;
		window.__X402_PUBKEY = pubkey;
	}, { secret: Array.from(buyer.secretKey), pubkey: pub });

	await page.goto(BASE, { waitUntil: 'networkidle' });
	await page.waitForFunction(() => window.solana?.isPhantom && window.__startPay, null, { timeout: 15000 });
	console.log('page ready; modal + injected provider loaded.');

	await payToken(page, 'USDC', USDC_MINT);
	await payToken(page, 'THREE', THREE_MINT);
	console.log('\n✓ Browser e2e passed for both tokens.');
} catch (e) {
	failed = true;
	console.error('\n✗ Browser e2e failed:', e.message);
} finally {
	if (browser) await browser.close().catch(() => {});
	if (merchant) merchant.kill();
}
process.exit(failed ? 1 : 0);
