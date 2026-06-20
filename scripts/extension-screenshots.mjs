// scripts/extension-screenshots.mjs
//
// Generates the complete Chrome Web Store listing asset set for the Walk Avatar
// extension into extensions/walk-avatar/store-assets/:
//
//   icon-128.png            — 128×128 store icon
//   promo-tile-440x280.png  — small promotional tile
//   marquee-1280x800.png    — marquee promotional image
//   screenshot-1..5.png     — 1280×800 screenshots of the real product
//
// The five screenshots are taken from a real Chromium (Playwright) driving the
// real extension surfaces — the avatar walking on real content pages, the popup
// avatar picker, the settings page, and the avatar narrating with its speech
// bubble. Avatars render from the live /walk-embed (WALK_EMBED_BASE, default
// http://localhost:3000 so the screenshots use the current source build); the
// popup/options grids list real public three.ws avatars and the real voice
// catalog. Nothing is mocked.
//
// Prereqs: `npm run build:extension` (so dist/extension exists) and a running
// source server at WALK_EMBED_BASE (`npm run dev`).
//
//   node scripts/extension-screenshots.mjs
//
import { chromium } from 'playwright';
import http from 'node:http';
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { TTS_VOICES, DEFAULT_VOICE } from '../api/_lib/tts-voices.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const EXT_DIST = join(root, 'dist', 'extension');
const OUT = join(root, 'extensions', 'walk-avatar', 'store-assets');
const BASE = (process.env.WALK_EMBED_BASE || 'http://localhost:3000').replace(/\/$/, '');
const BASE_ORIGIN = new URL(BASE).origin;
const THREEWS = 'https://three.ws';

const W = 1280;
const H = 800;
const AVATAR_LOAD_MS = 26000; // software-GL avatar bring-up budget

mkdirSync(OUT, { recursive: true });

if (!existsSync(join(EXT_DIST, 'popup.html'))) {
	console.error('dist/extension not found — run `npm run build:extension` first.');
	process.exit(1);
}

// ── Real public-avatar catalog (used for the popup/options grids) ─────────────
// Pulled once from the live, no-auth endpoint so the grids show real models.
async function fetchPublicAvatars(limit = 48) {
	const res = await fetch(`${THREEWS}/api/avatars/public?limit=${limit}`, {
		headers: { Accept: 'application/json' },
	});
	if (!res.ok) throw new Error(`/api/avatars/public ${res.status}`);
	const body = await res.json();
	const avatars = (body.avatars || []).filter((a) => a && a.id);
	// Thumbnailed avatars first so the grids read well, then the rest. Normalize
	// into the shape both popup.js and options.js consume.
	return avatars
		.map((a) => ({
			id: a.id,
			name: a.name,
			thumb_url: a.thumbnail_url || null,
			thumbnail_url: a.thumbnail_url || null,
			has_thumbnail: Boolean(a.thumbnail_url),
			featured: Boolean(a.thumbnail_url),
			model_url: a.model_url,
		}))
		.sort((a, b) => Number(b.has_thumbnail) - Number(a.has_thumbnail));
}

// ── Tiny static server for the built extension pages ──────────────────────────
const MIME = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.png': 'image/png',
	'.svg': 'image/svg+xml',
	'.json': 'application/json',
};
function serveExtension() {
	return new Promise((resolve) => {
		const server = http.createServer((req, res) => {
			const path = decodeURIComponent((req.url || '/').split('?')[0]);
			const file = join(EXT_DIST, path === '/' ? 'popup.html' : path);
			if (!file.startsWith(EXT_DIST) || !existsSync(file)) {
				res.writeHead(404).end('not found');
				return;
			}
			res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
			res.end(readFileSync(file));
		});
		server.listen(0, '127.0.0.1', () => resolve(server));
	});
}

// chrome.* runtime shim so the real popup.js / options.js run outside the
// extension host. Storage is in-memory; messages get sensible replies; the
// avatar/voice data still comes over the real network (routed below).
function chromeShim(cfg) {
	return `(${((c) => {
		const store = { sync: { ...c.sync }, local: { ...c.local }, session: {} };
		const area = (name) => ({
			get(keys) {
				const s = store[name];
				let out = {};
				if (keys == null) out = { ...s };
				else if (typeof keys === 'string') out = { [keys]: s[keys] };
				else if (Array.isArray(keys)) keys.forEach((k) => (out[k] = s[k]));
				else out = Object.fromEntries(Object.keys(keys).map((k) => [k, s[k] ?? keys[k]]));
				return Promise.resolve(out);
			},
			set(obj) { Object.assign(store[name], obj); return Promise.resolve(); },
			remove(k) { delete store[name][k]; return Promise.resolve(); },
		});
		const replies = {
			'get-state': { session: c.session, settings: store.sync },
			'check-site': { allowed: true },
			'toggle-tab': { ok: true },
			'update-settings': { ok: true },
			'set-avatar': { ok: true },
			'clear-session': { ok: true },
		};
		window.chrome = {
			runtime: {
				sendMessage: (m) => Promise.resolve(replies[m && m.type] ?? {}),
				onMessage: { addListener() {}, removeListener() {} },
				openOptionsPage() {},
				getManifest: () => ({ version: c.version }),
				getURL: (p) => p,
				lastError: null,
			},
			storage: { sync: area('sync'), local: area('local'), session: area('session') },
			tabs: {
				query: () => Promise.resolve([{ id: 1, url: c.currentUrl, title: 'Example' }]),
				get: () => Promise.resolve({ id: 1, url: c.currentUrl }),
				create() {},
				remove() {},
				sendMessage() {},
				onUpdated: { addListener() {} },
			},
		};
	}).toString()})(${JSON.stringify(cfg)})`;
}

// Route the extension's three.ws API calls to real data. Avatar grids → live
// public catalog; voices → the genuine repo catalog; identity → minimal ok.
async function routeApi(context, avatars) {
	await context.route('**/three.ws/api/**', async (route) => {
		const url = route.request().url();
		const reply = (obj) =>
			route.fulfill({
				status: 200,
				contentType: 'application/json',
				headers: { 'access-control-allow-origin': '*' },
				body: JSON.stringify(obj),
			});
		if (/\/api\/avatars\/(mine|featured)\b/.test(url) || /\/api\/avatars\?/.test(url)) {
			return reply({ avatars });
		}
		if (/\/api\/tts\/voices\b/.test(url)) {
			return reply({ enabled: true, default: DEFAULT_VOICE, voices: TTS_VOICES, providers: { nvidia: true, openai: true } });
		}
		if (/\/api\/(me|threews\/me)\b/.test(url)) {
			return reply({ user: { handle: '@you', username: 'you' } });
		}
		return route.continue();
	});
}

// ── Avatar-on-page mount (faithful to extensions/walk-avatar/content.js) ───────
async function mountAvatarOnPage(page, { position = 'bottom-right', size = { w: 200, h: 290 } } = {}) {
	await page.evaluate(
		({ base, origin, position, size }) => {
			window.__walkTicks = 0;
			window.addEventListener('message', (e) => {
				if (e.origin !== origin) return;
				const s = JSON.stringify(e.data || '');
				if (s.includes('position') || s.includes('walk:ready')) window.__walkTicks++;
			});
			const c = document.createElement('div');
			c.id = '__threews_walk_container__';
			c.style.cssText = `position:fixed;width:${size.w}px;height:${size.h}px;z-index:2147483647;background:transparent;border-radius:14px;filter:drop-shadow(0 10px 28px rgba(0,0,0,0.32));`;
			const m = '20px';
			Object.assign(c.style, position === 'bottom-left'
				? { bottom: m, left: m }
				: position === 'top-right'
				? { top: m, right: m }
				: { bottom: m, right: m });
			const f = document.createElement('iframe');
			f.id = '__threews_walk_iframe__';
			f.src = `${base}/walk-embed?controls=none&autoplay=true&ground=false&orbit=false&bg=transparent`;
			f.allow = 'accelerometer; gyroscope; autoplay';
			f.setAttribute('scrolling', 'no');
			f.style.cssText = 'width:100%;height:100%;border:0;background:transparent;display:block;border-radius:14px;';
			c.appendChild(f);
			(document.body || document.documentElement).appendChild(c);
		},
		{ base: BASE, origin: BASE_ORIGIN, position, size },
	);
	// Wait until the embed's render loop is emitting position ticks (avatar mesh
	// loaded + animating), with a generous software-GL fallback.
	await page
		.waitForFunction(() => window.__walkTicks > 8, { timeout: AVATAR_LOAD_MS })
		.catch(() => {});
	await page.waitForTimeout(1500);
}

async function postToEmbed(page, message) {
	await page.evaluate(
		({ message, origin }) => {
			document.getElementById('__threews_walk_iframe__')?.contentWindow?.postMessage(message, origin);
		},
		{ message, origin: BASE_ORIGIN },
	);
}

// Dismiss the most common cookie/consent overlays so they don't pollute shots.
async function dismissConsent(page) {
	const labels = ['Accept all', 'Accept', 'I agree', 'Got it', 'Allow all', 'Agree'];
	for (const label of labels) {
		const btn = page.getByRole('button', { name: new RegExp(`^\\s*${label}\\s*$`, 'i') }).first();
		if (await btn.count().catch(() => 0)) {
			await btn.click({ timeout: 1500 }).catch(() => {});
			await page.waitForTimeout(300);
			break;
		}
	}
}

// Strip fundraising/cookie/consent overlays that pollute a clean shot.
async function removeClutter(page) {
	await page.evaluate(() => {
		const sel = [
			'#siteNotice', '.mw-dismissable-notice', '#centralNotice', '.frb', '[class*="frbanner"]',
			'[id*="cookie"]', '[class*="cookie"]', '[id*="consent"]', '[class*="consent"]',
			'[class*="gdpr"]', '[aria-label*="cookie" i]', '[class*="banner--cookie"]',
		];
		for (const s of sel) document.querySelectorAll(s).forEach((el) => el.remove());
	}).catch(() => {});
}

async function gotoContent(page, candidates) {
	for (const url of candidates) {
		try {
			await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
			await dismissConsent(page);
			await removeClutter(page);
			await page.waitForTimeout(1000);
			await removeClutter(page);
			return url;
		} catch {
			/* try next */
		}
	}
	throw new Error(`none of the candidate pages loaded: ${candidates.join(', ')}`);
}

// ── Store-listing graphics (icon, promo tile, marquee) ────────────────────────
const ICON_SVG = readFileSync(join(root, 'public', 'pwa-icon.svg'));

function tileSvg(w, h, { title, sub, big = 40, small = 19 }) {
	return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
	<defs>
		<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
			<stop offset="0" stop-color="#0a0e16"/>
			<stop offset="0.55" stop-color="#0d1422"/>
			<stop offset="1" stop-color="#0a0a0a"/>
		</linearGradient>
		<radialGradient id="glow" cx="78%" cy="28%" r="60%">
			<stop offset="0" stop-color="#7dd3fc" stop-opacity="0.22"/>
			<stop offset="1" stop-color="#7dd3fc" stop-opacity="0"/>
		</radialGradient>
	</defs>
	<rect width="${w}" height="${h}" fill="url(#bg)"/>
	<rect width="${w}" height="${h}" fill="url(#glow)"/>
	<text x="50" y="${h / 2 - 8}" font-family="'Space Grotesk','Inter',system-ui,sans-serif" font-size="${big}" font-weight="700" fill="#fafafa">${title}</text>
	<text x="52" y="${h / 2 + 26}" font-family="'Inter',system-ui,sans-serif" font-size="${small}" fill="#a1a1aa">${sub}</text>
	<text x="50" y="${h / 2 - 8}" font-family="'Space Grotesk','Inter',system-ui,sans-serif" font-size="${big}" font-weight="700" fill="#7dd3fc" opacity="0">${title}</text>
</svg>`);
}

async function buildIcon() {
	await sharp(ICON_SVG).resize(128, 128).png().toFile(join(OUT, 'icon-128.png'));
	console.log('✓ icon-128.png');
}

async function buildPromoTile() {
	const w = 440, h = 280;
	const iconSize = 132;
	const bg = await sharp(tileSvg(w, h, { title: 'Walk Avatar', sub: 'Your 3D companion, on every site', big: 34, small: 15 })).png().toBuffer();
	const icon = await sharp(ICON_SVG).resize(iconSize, iconSize).png().toBuffer();
	await sharp(bg)
		.composite([{ input: icon, left: w - iconSize - 28, top: (h - iconSize) / 2 }])
		.png()
		.toFile(join(OUT, 'promo-tile-440x280.png'));
	console.log('✓ promo-tile-440x280.png');
}

async function buildMarquee(walkShot) {
	const w = 1280, h = 800;
	const bg = await sharp(tileSvg(w, h, { title: 'three.ws · Walk Avatar', sub: 'Walk your 3D avatar on any website — and have it read pages aloud.', big: 58, small: 24 })).png().toBuffer();
	const icon = await sharp(ICON_SVG).resize(180, 180).png().toBuffer();
	const composites = [{ input: icon, left: 50, top: 70 }];
	// Cut out the avatar from a real on-page shot and feature it on the marquee.
	if (walkShot && existsSync(walkShot)) {
		const fig = await sharp(walkShot)
			.extract({ left: 980, top: 360, width: 300, height: 440 })
			.resize({ height: 560 })
			.png()
			.toBuffer();
		const meta = await sharp(fig).metadata();
		composites.push({ input: fig, left: w - (meta.width || 300) - 40, top: h - 560 });
	}
	await sharp(bg).composite(composites).png().toFile(join(OUT, 'marquee-1280x800.png'));
	console.log('✓ marquee-1280x800.png');
}

// Compose a small extension surface (popup) onto a branded 1280×800 canvas with
// rounded corners + shadow so the listing screenshot fills the required frame.
async function composeSurface(shotBuf, outName, caption) {
	const bg = await sharp(tileSvg(W, H, { title: '', sub: '' })).png().toBuffer();
	const meta = await sharp(shotBuf).metadata();
	const sw = meta.width, sh = meta.height;
	const radius = 16;
	const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${sw}" height="${sh}"><rect width="${sw}" height="${sh}" rx="${radius}" ry="${radius}"/></svg>`);
	const rounded = await sharp(shotBuf)
		.composite([{ input: mask, blend: 'dest-in' }])
		.png()
		.toBuffer();
	const left = Math.round((W - sw) / 2);
	const top = Math.round((H - sh) / 2) - 20;
	const shadow = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect x="${left - 6}" y="${top + 10}" width="${sw + 12}" height="${sh + 12}" rx="22" fill="#000" opacity="0.45"/></svg>`);
	const cap = caption
		? [{ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="80"><text x="${W / 2}" y="46" text-anchor="middle" font-family="'Inter',system-ui,sans-serif" font-size="24" font-weight="600" fill="#fafafa">${caption}</text></svg>`), left: 0, top: H - 96 }]
		: [];
	await sharp(bg)
		.composite([
			{ input: await sharp(shadow).blur(14).png().toBuffer(), left: 0, top: 0 },
			{ input: rounded, left, top },
			...cap,
		])
		.png()
		.toFile(join(OUT, outName));
	console.log(`✓ ${outName}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
const avatars = await fetchPublicAvatars(48);
console.log(`Loaded ${avatars.length} real public avatars for the grids.`);

const extServer = await serveExtension();
const extPort = extServer.address().port;
const extBase = `http://127.0.0.1:${extPort}`;

// Software-GL Chromium in Codespaces can SEGV the GPU process on heavy pages, and
// a crashed GPU process poisons the whole browser. So each capture runs in its
// own short-lived browser — a crash is contained to one shot and we retry it.
const LAUNCH_ARGS = [
	'--no-sandbox',
	'--enable-unsafe-swiftshader',
	'--disable-dev-shm-usage', // Codespaces /dev/shm is tiny — avoids "Target crashed"
	'--disable-gpu-process-crash-limit',
	// In production the avatar iframe is https://three.ws/walk-embed inside an
	// https host page — no mixed content. For local capture the embed is served
	// over http, so allow the otherwise-blocked insecure iframe.
	'--allow-running-insecure-content',
	`--unsafely-treat-insecure-origin-as-secure=${BASE_ORIGIN}`,
];

async function withPage(fn, { attempts = 2 } = {}) {
	let lastErr;
	for (let i = 0; i < attempts; i++) {
		const browser = await chromium.launch({ args: LAUNCH_ARGS });
		try {
			// bypassCSP lets us inject the avatar iframe onto pages whose own CSP
			// would otherwise forbid framing a third-party origin.
			const context = await browser.newContext({
				viewport: { width: W, height: H },
				deviceScaleFactor: 1,
				bypassCSP: true,
				ignoreHTTPSErrors: true,
			});
			await routeApi(context, avatars);
			const page = await context.newPage();
			const out = await fn(page);
			await browser.close();
			return out;
		} catch (err) {
			lastErr = err;
			await browser.close().catch(() => {});
			console.warn(`  retry (${i + 1}/${attempts}): ${String(err.message || err).split('\n')[0]}`);
		}
	}
	throw lastErr;
}

try {
	// ── Screenshot 1: avatar walking on a real content/article page ──────────────
	await withPage(async (page) => {
		await gotoContent(page, [
			'https://en.wikipedia.org/wiki/Web_browser',
			'https://en.wikipedia.org/wiki/World_Wide_Web',
		]);
		await mountAvatarOnPage(page, { position: 'bottom-right' });
		await page.screenshot({ path: join(OUT, 'screenshot-1.png') });
	});
	console.log('✓ screenshot-1.png (avatar on an article page)');

	// ── Screenshot 4: avatar narrating with its speech bubble ────────────────────
	// text.npr.org is a real, deliberately lightweight news site — ideal for the
	// narration shot and gentle on software GL.
	await withPage(async (page) => {
		await gotoContent(page, [
			'https://text.npr.org',
			'https://en.wikipedia.org/wiki/Three.js',
		]);
		await mountAvatarOnPage(page, { position: 'bottom-right' });
		await postToEmbed(page, { type: 'walk:setMotion', motion: 'idle' });
		await postToEmbed(page, {
			type: 'walk:narrate',
			text: 'Let me read this story to you while you keep browsing — tap me to mute any time.',
		});
		await page.waitForTimeout(2500);
		await page.screenshot({ path: join(OUT, 'screenshot-4.png') });
	});
	console.log('✓ screenshot-4.png (avatar narrating)');

	// ── Screenshot 5: avatar on a real social page ───────────────────────────────
	await withPage(async (page) => {
		await gotoContent(page, [
			'https://mastodon.social/public/local',
			'https://mastodon.social/explore',
			'https://en.wikipedia.org/wiki/Social_media',
		]);
		await mountAvatarOnPage(page, { position: 'bottom-right' });
		await page.screenshot({ path: join(OUT, 'screenshot-5.png') });
	});
	console.log('✓ screenshot-5.png (avatar on a social page)');

	// ── Screenshot 2: popup with the avatar selection grid ───────────────────────
	await withPage(async (page) => {
		await page.addInitScript(
			chromeShim({
				version: '1.0.0',
				currentUrl: 'https://en.wikipedia.org/wiki/Web_browser',
				session: null,
				sync: { walkSpeed: 1.2, position: 'bottom-right', sizePreset: 'medium', narrationEnabled: true, voice: DEFAULT_VOICE },
				local: {},
			}),
		);
		await page.setViewportSize({ width: 360, height: 600 });
		await page.goto(`${extBase}/popup.html`, { waitUntil: 'domcontentloaded' });
		// Move to the Featured grid (real public avatars, no sign-in needed).
		await page.getByRole('tab', { name: /featured/i }).click().catch(() => {});
		await page.waitForSelector('.avatar-thumb:not(.skeleton)', { timeout: 15000 }).catch(() => {});
		await page.waitForTimeout(2500);
		const popupShot = await page.screenshot();
		await composeSurface(popupShot, 'screenshot-2.png', 'Pick any avatar — your own or a featured 3D character');
	});

	// ── Screenshot 3: settings page ──────────────────────────────────────────────
	await withPage(async (page) => {
		await page.addInitScript(
			chromeShim({
				version: '1.0.0',
				currentUrl: 'https://three.ws',
				session: 'demo-session',
				sync: { walkSpeed: 1.2, position: 'bottom-right', sizePreset: 'medium', narrationEnabled: true, voice: DEFAULT_VOICE },
				local: {},
			}),
		);
		await page.goto(`${extBase}/options.html`, { waitUntil: 'domcontentloaded' });
		await page.getByRole('tab', { name: /featured/i }).click().catch(() => {});
		await page.waitForSelector('.av-thumb:not(.skeleton)', { timeout: 15000 }).catch(() => {});
		await page.waitForTimeout(2000);
		await page.screenshot({ path: join(OUT, 'screenshot-3.png') });
	});
	console.log('✓ screenshot-3.png (settings page)');

	// ── Listing graphics ─────────────────────────────────────────────────────────
	await buildIcon();
	await buildPromoTile();
	await buildMarquee(join(OUT, 'screenshot-1.png'));
} finally {
	extServer.close();
}

console.log(`\nAll store assets written to ${OUT}`);
