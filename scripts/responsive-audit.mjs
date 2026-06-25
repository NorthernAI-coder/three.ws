// Responsive audit harness — detects horizontal overflow and undersized tap
// targets across every primary route at 320 / 390 / 768 / 1440. Run against the
// local dev server (npm run dev). Writes a JSON report and, for any route with a
// finding, a screenshot at the offending widths.
//
//   node scripts/responsive-audit.mjs            # scan all routes
//   node scripts/responsive-audit.mjs /forge /marketplace   # scan a subset
//   SHOTS=all node scripts/responsive-audit.mjs  # screenshot every route/width
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const BASE = process.env.BASE || 'http://localhost:3000';
const WIDTHS = [320, 390, 768, 1440];
const HEIGHT = 900;
const DPR = { 320: 2, 390: 3, 768: 2, 1440: 1 };
const OUT = resolve(process.cwd(), `docs/audit/responsive-${process.env.DATE || '2026-06-25'}`);
const SHOTS = process.env.SHOTS || 'offenders'; // 'offenders' | 'all' | 'none'

// Routes that share a distinct layout template. Aliases (/home==/, /explore==
// /discover, /pages==/sitemap, /deploy==/app) are pruned to one representative.
const ALL_ROUTES = [
	'/', '/what-is', '/pitch', '/features', '/tutorials', '/glossary', '/start',
	'/forge', '/nim-forge', '/forge-studio', '/scene', '/scan', '/worlds',
	'/create', '/create-agent', '/create/selfie', '/create/prompt', '/create/character',
	'/create/studio', '/create-review', '/create/next', '/genesis', '/import/rpm',
	'/marketplace', '/marketplace-walk', '/collection', '/agents', '/discover',
	'/gallery', '/my-agents', '/agent-exchange', '/agent/new',
	'/launches', '/pulse', '/watchlist', '/leaderboard', '/labor-market', '/vaults',
	'/alpha-copilot', '/mirror', '/strategies', '/swarms', '/terminal', '/trader',
	'/signals', '/trades', '/clash', '/radar', '/oracle', '/arm', '/ca2x402',
	'/activity', '/coin-intel', '/trending', '/compose', '/bulk-launch',
	'/pump-dashboard', '/autopilot', '/pump-visualizer', '/pump-live', '/smart-money',
	'/three', '/three-live', '/three-token', '/launch-week', '/community', '/feed',
	'/brain', '/agent-studio', '/cosmos', '/voice', '/galaxy', '/genome', '/ar',
	'/pricing', '/billing', '/credits', '/status', '/xr', '/irl', '/world-lines',
	'/communities', '/play', '/play/arena', '/arena', '/pose', '/pose-mini',
	'/animations', '/club', '/theater', '/stage', '/skills', '/labs', '/fact-checker',
	'/unstoppable', '/shopper', '/go', '/bounties', '/dad', '/agora', '/city',
	'/walk', '/walk-leaderboard', '/walk-analytics', '/marketplace-analytics',
	'/dashboard', '/dashboard/avatars', '/dashboard/holders', '/dashboard/copy',
	'/guardian', '/login', '/register', '/reputation', '/validation', '/hydrate',
	'/pay', '/pay/calls', '/x402', '/dashboard/x402', '/sitemap', '/blog', '/docs',
	'/demos', '/demos/agents', '/demo/avatar-os', '/eth-vanity', '/evm-wallet',
	'/vanity/gallery', '/vanity/bounties', '/vanity/verify', '/aws', '/support',
	'/agenc/embodied', '/agenc/room', '/avatar-wallet-chat', '/live', '/proof',
	'/integrity', '/lipsync', '/providers', '/forever', '/arbitrage', '/strategy-lab',
];

const cliRoutes = process.argv.slice(2).filter((a) => a.startsWith('/'));
const ROUTES = cliRoutes.length ? cliRoutes : ALL_ROUTES;

mkdirSync(OUT, { recursive: true });

function slug(route) {
	return route === '/' ? 'home' : route.replace(/^\//, '').replace(/\//g, '_');
}

// Runs in the page. Returns overflow info and undersized visible tap targets.
const PROBE = (vw) => {
	const docW = Math.max(
		document.documentElement.scrollWidth,
		document.body ? document.body.scrollWidth : 0,
	);
	const overflow = docW - vw;
	const offenders = [];
	if (overflow > 1) {
		const all = document.querySelectorAll('*');
		for (const el of all) {
			const r = el.getBoundingClientRect();
			if (r.width === 0 || r.height === 0) continue;
			// element extends past the right edge of the viewport
			if (r.right > vw + 1 && r.width <= vw + 64) {
				const cs = getComputedStyle(el);
				if (cs.position === 'fixed') continue;
				offenders.push({
					tag: el.tagName.toLowerCase(),
					id: el.id || '',
					cls: (el.className && el.className.toString ? el.className.toString() : '').slice(0, 80),
					right: Math.round(r.right),
					width: Math.round(r.width),
				});
			}
		}
	}
	// dedupe offenders by tag.cls, keep widest
	const seen = new Map();
	for (const o of offenders) {
		const k = o.tag + '|' + o.id + '|' + o.cls;
		if (!seen.has(k) || seen.get(k).right < o.right) seen.set(k, o);
	}
	// smallest-tap-target check (interactive, visible, in viewport top 2000px)
	const small = [];
	const interactive = document.querySelectorAll(
		'a[href], button, input:not([type=hidden]), select, [role="button"], [onclick]',
	);
	for (const el of interactive) {
		const r = el.getBoundingClientRect();
		if (r.width === 0 || r.height === 0) continue;
		if (r.top > 2200 || r.bottom < 0) continue;
		const cs = getComputedStyle(el);
		if (cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0') continue;
		// skip inline text links inside paragraphs (not really tap "buttons")
		const insideText = el.tagName === 'A' && el.closest('p, li, span, td');
		const hit = Math.min(r.width, r.height);
		if (hit < 36 && !insideText) {
			small.push({
				tag: el.tagName.toLowerCase(),
				id: el.id || '',
				cls: (el.className && el.className.toString ? el.className.toString() : '').slice(0, 60),
				w: Math.round(r.width),
				h: Math.round(r.height),
				txt: (el.textContent || '').trim().slice(0, 24),
			});
		}
	}
	return { docW, overflow, offenders: [...seen.values()].slice(0, 12), small: small.slice(0, 16) };
};

const report = [];
const browser = await chromium.launch();

async function scanWidth(route, vw) {
	const ctx = await browser.newContext({
		viewport: { width: vw, height: HEIGHT },
		deviceScaleFactor: DPR[vw] || 1,
		isMobile: vw <= 414,
		hasTouch: vw <= 768,
		userAgent:
			vw <= 414
				? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
				: undefined,
	});
	const page = await ctx.newPage();
	const consoleErrors = [];
	page.on('console', (m) => {
		if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 160));
	});
	let res = { error: null };
	try {
		await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 30000 });
		await page.waitForTimeout(1400); // let nav inject + layout settle
		const probe = await page.evaluate(PROBE, vw);
		res = { ...probe, consoleErrors: consoleErrors.slice(0, 4) };
		const needShot =
			SHOTS === 'all' || (SHOTS === 'offenders' && (probe.overflow > 1 || probe.small.length));
		if (needShot) {
			const file = `${slug(route)}@${vw}.png`;
			await page.screenshot({ path: resolve(OUT, file), fullPage: false });
			res.shot = file;
		}
	} catch (e) {
		res = { error: String(e).slice(0, 200) };
	}
	await ctx.close();
	return res;
}

for (const route of ROUTES) {
	const entry = { route, widths: {} };
	const results = await Promise.all(WIDTHS.map((vw) => scanWidth(route, vw)));
	WIDTHS.forEach((vw, i) => (entry.widths[vw] = results[i]));
	const maxOverflow = Math.max(0, ...WIDTHS.map((w) => entry.widths[w]?.overflow || 0));
	entry.maxOverflow = maxOverflow;
	const flag = maxOverflow > 1 ? `OVERFLOW +${maxOverflow}px` : 'ok';
	process.stdout.write(`${route.padEnd(28)} ${flag}\n`);
	report.push(entry);
}

await browser.close();
writeFileSync(resolve(OUT, 'report.json'), JSON.stringify(report, null, 2));

// Summary
const offenders = report.filter((r) => r.maxOverflow > 1);
console.log('\n===== OVERFLOW SUMMARY =====');
for (const r of offenders) {
	console.log(`\n${r.route}  (+${r.maxOverflow}px)`);
	for (const vw of WIDTHS) {
		const w = r.widths[vw];
		if (w?.overflow > 1) {
			console.log(`  @${vw}: docW=${w.docW}`);
			for (const o of w.offenders) console.log(`     <${o.tag}${o.id ? '#' + o.id : ''}.${o.cls}> right=${o.right} w=${o.width}`);
		}
	}
}
console.log(`\nTotal routes scanned: ${report.length}`);
console.log(`Routes with horizontal overflow: ${offenders.length}`);
console.log(`Report: ${resolve(OUT, 'report.json')}`);
