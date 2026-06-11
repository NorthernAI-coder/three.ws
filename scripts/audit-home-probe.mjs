// One-off homepage audit probe — run with: node scripts/audit-home-probe.mjs
import { chromium } from 'playwright';

const URL = 'http://localhost:3000/';

async function probe(viewport, label) {
	const browser = await chromium.launch();
	const page = await browser.newPage({ viewport });
	const consoleMsgs = [];
	page.on('console', (m) => {
		if (m.type() === 'error' || m.type() === 'warning') {
			consoleMsgs.push(`[${m.type()}] ${m.text().slice(0, 200)}`);
		}
	});
	page.on('pageerror', (e) => consoleMsgs.push(`[pageerror] ${String(e).slice(0, 200)}`));

	// Count WebGL context creations
	await page.addInitScript(() => {
		window.__glContexts = 0;
		const orig = HTMLCanvasElement.prototype.getContext;
		HTMLCanvasElement.prototype.getContext = function (type, ...args) {
			const ctx = orig.call(this, type, ...args);
			if (ctx && /webgl/.test(type)) window.__glContexts++;
			return ctx;
		};
	});

	await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
	await page.waitForTimeout(4000);

	const aboveFold = await page.evaluate(() => {
		const stage = document.querySelector('.hero-stage');
		return {
			heroStageH: stage ? stage.offsetHeight : null,
			heroStageW: stage ? stage.offsetWidth : null,
			agentEls: document.querySelectorAll('agent-3d').length,
			glContexts: window.__glContexts,
			pageH: document.documentElement.scrollHeight,
		};
	});

	// Scroll through the whole page to trigger reveals + lazy boots
	await page.evaluate(async () => {
		const step = window.innerHeight * 0.8;
		for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
			window.scrollTo(0, y);
			await new Promise((r) => setTimeout(r, 350));
		}
	});
	await page.waitForTimeout(5000);

	const afterScroll = await page.evaluate(() => {
		const reveals = [...document.querySelectorAll('.reveal')];
		return {
			reveals: reveals.length,
			revealed: reveals.filter((el) => el.classList.contains('vis')).length,
			agentEls: document.querySelectorAll('agent-3d').length,
			glContexts: window.__glContexts,
			pageH: document.documentElement.scrollHeight,
			heroAgentAlive: (() => {
				const a = document.querySelector('#hero-stage-inner agent-3d');
				return a ? a.classList.contains('loaded') : null;
			})(),
		};
	});

	console.log(`\n===== ${label} (${viewport.width}x${viewport.height}) =====`);
	console.log('above fold:', JSON.stringify(aboveFold));
	console.log('after full scroll:', JSON.stringify(afterScroll));
	console.log(`console errors/warnings (${consoleMsgs.length}):`);
	[...new Set(consoleMsgs)].slice(0, 25).forEach((m) => console.log('  ' + m));

	await browser.close();
}

await probe({ width: 1440, height: 900 }, 'desktop');
await probe({ width: 375, height: 812 }, 'mobile');
