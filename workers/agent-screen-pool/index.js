// agent-screen-pool — on-demand live browser caster for the agent wall.
//
// The problem: users want a live browser feed for ANY agent, 24/7, all of them.
// Running one Chromium per agent forever is economically impossible. So instead
// of casting every agent always, this worker casts exactly the agents people are
// *currently watching*:
//
//   1. Viewers on /agents-live (and any watch panel) POST /api/agent/watch-intent
//      for the agents on their screen.
//   2. This worker polls /api/agent/watch-wanted to read that set.
//   3. It maintains a bounded pool of real Chromium pages — one per wanted agent,
//      up to MAX_BROWSERS — screenshotting each and pushing frames to
//      /api/agent-screen-push (which the wall + watch panel render live).
//   4. When nobody is watching an agent, its page is torn down and the slot frees
//      up for another. The wall's zero-cost activity view takes over seamlessly.
//
// Cost scales with concurrent viewers, not with the number of agents. Deploy one
// of these anywhere a long-running Node process can live (a small VM, Fly.io,
// Railway, or the bundled GitHub Actions workflow for bursts).
//
// Required env:
//   SCREEN_WORKER_SECRET   shared secret; must match the value set on the API.
// Optional env (sensible defaults for production three.ws):
//   BASE_URL=https://three.ws
//   WANTED_URL=$BASE_URL/api/agent/watch-wanted
//   PUSH_URL=$BASE_URL/api/agent-screen-push
//   MAX_BROWSERS=6   POLL_MS=3000   FRAME_MS=700   JPEG_QUALITY=58
//   VIEWPORT_W=1280  VIEWPORT_H=720

import { chromium } from 'playwright';

const BASE_URL   = (process.env.BASE_URL || 'https://three.ws').replace(/\/$/, '');
const WANTED_URL = process.env.WANTED_URL || `${BASE_URL}/api/agent/watch-wanted`;
// Two render surfaces consume two frame conventions: the live wall + 2D watch
// panel read the "dashed" push; the in-world 3D desk reads the "slashed" push.
// We publish to both so a watched agent goes live everywhere at once.
const PUSH_URL      = process.env.PUSH_URL      || `${BASE_URL}/api/agent-screen-push`;  // wall + watch panel
const PUSH_URL_DESK = process.env.PUSH_URL_DESK || `${BASE_URL}/api/agent/screen-push`;  // 3D desk
const SECRET        = process.env.SCREEN_WORKER_SECRET || '';

const MAX_BROWSERS = Number(process.env.MAX_BROWSERS || 6);
const POLL_MS      = Number(process.env.POLL_MS || 3000);
const FRAME_MS     = Number(process.env.FRAME_MS || 700);
const JPEG_QUALITY = Number(process.env.JPEG_QUALITY || 58);
const VIEWPORT     = { width: Number(process.env.VIEWPORT_W || 1280), height: Number(process.env.VIEWPORT_H || 720) };

if (!SECRET || SECRET.length < 16) {
	console.error('[pool] SCREEN_WORKER_SECRET is required (>= 16 chars) and must match the API. Exiting.');
	process.exit(1);
}

const log = (...a) => console.log(`[pool ${new Date().toISOString()}]`, ...a);

// agentId → { page, timer, name, pushing, lastErrorAt }
const pool = new Map();
let browser = null;
let context = null;
let stopping = false;

async function ensureBrowser() {
	if (browser) return;
	browser = await chromium.launch({
		headless: true,
		args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
	});
	context = await browser.newContext({
		viewport: VIEWPORT,
		userAgent:
			'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
		locale: 'en-US',
	});
	log('chromium launched');
}

async function fetchWanted() {
	try {
		const res = await fetch(WANTED_URL, { headers: { authorization: `Bearer ${SECRET}` } });
		if (!res.ok) { log('watch-wanted', res.status); return []; }
		const data = await res.json();
		if (data.disabled) { log('pool disabled by API:', data.reason); return []; }
		return Array.isArray(data.agents) ? data.agents : [];
	} catch (err) {
		log('watch-wanted error:', err?.message || err);
		return [];
	}
}

function resolveUrl(homeUrl, agentId) {
	const u = homeUrl || `/agent/${agentId}`;
	if (/^https?:\/\//.test(u)) return u;
	return `${BASE_URL}${u.startsWith('/') ? '' : '/'}${u}`;
}

async function pushFrame(entry) {
	if (entry.pushing || !entry.page || entry.page.isClosed()) return;
	entry.pushing = true;
	try {
		const buf = await entry.page.screenshot({ type: 'jpeg', quality: JPEG_QUALITY, fullPage: false });
		const b64 = buf.toString('base64');
		const seq = ++entry.seq;
		const headers = { 'content-type': 'application/json', authorization: `Bearer ${SECRET}` };
		// Publish to both render surfaces. Failures are independent — the wall
		// shouldn't go dark because the desk endpoint hiccuped, and vice versa.
		const [wall, desk] = await Promise.allSettled([
			fetch(PUSH_URL, {
				method: 'POST', headers,
				body: JSON.stringify({
					agentId: entry.agentId,
					frame: { data: `data:image/jpeg;base64,${b64}`, activity: `Live view · ${entry.name}`, type: 'screenshot' },
				}),
			}),
			fetch(PUSH_URL_DESK, {
				method: 'POST', headers,
				body: JSON.stringify({ agentId: entry.agentId, frame: b64, seq }),
			}),
		]);
		const wallBad = wall.status === 'fulfilled' && !wall.value.ok;
		if (wallBad && Date.now() - (entry.lastErrorAt || 0) > 30_000) {
			entry.lastErrorAt = Date.now();
			log('wall push failed', entry.agentId, wall.value.status, (await wall.value.text().catch(() => '')).slice(0, 120));
		}
		void desk;
	} catch (err) {
		if (Date.now() - (entry.lastErrorAt || 0) > 30_000) {
			entry.lastErrorAt = Date.now();
			log('frame error', entry.agentId, err?.message || err);
		}
	} finally {
		entry.pushing = false;
	}
}

async function startCasting(agent) {
	await ensureBrowser();
	const agentId = agent.agentId;
	const page = await context.newPage();
	const entry = { agentId, page, name: agent.name || 'Agent', timer: null, pushing: false, lastErrorAt: 0, seq: 0 };
	pool.set(agentId, entry);
	const url = resolveUrl(agent.homeUrl, agentId);
	try {
		await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
	} catch (err) {
		log('goto failed', agentId, err?.message || err);
	}
	await pushFrame(entry);
	entry.timer = setInterval(() => pushFrame(entry), FRAME_MS);
	log('casting', agentId, agent.name, '→', url, `(${pool.size}/${MAX_BROWSERS})`);
}

async function stopCasting(agentId) {
	const entry = pool.get(agentId);
	if (!entry) return;
	pool.delete(agentId);
	if (entry.timer) clearInterval(entry.timer);
	try { await entry.page?.close(); } catch { /* */ }
	log('stopped', agentId, `(${pool.size}/${MAX_BROWSERS})`);
}

async function reconcile() {
	if (stopping) return;
	const wanted = await fetchWanted();
	const wantedIds = wanted.map((a) => a.agentId);
	const wantedSet = new Set(wantedIds);

	// Tear down agents nobody is watching anymore.
	for (const id of [...pool.keys()]) {
		if (!wantedSet.has(id)) await stopCasting(id);
	}

	// Spin up newly-watched agents, respecting the concurrency cap. Most-wanted
	// first (watch-wanted returns them in recency order).
	for (const agent of wanted) {
		if (pool.size >= MAX_BROWSERS) break;
		if (!pool.has(agent.agentId)) {
			try { await startCasting(agent); }
			catch (err) { log('startCasting failed', agent.agentId, err?.message || err); }
		}
	}
}

async function shutdown() {
	if (stopping) return;
	stopping = true;
	log('shutting down…');
	for (const id of [...pool.keys()]) await stopCasting(id);
	try { await browser?.close(); } catch { /* */ }
	process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

log(`starting · base=${BASE_URL} · max=${MAX_BROWSERS} · poll=${POLL_MS}ms · frame=${FRAME_MS}ms`);
await reconcile();
setInterval(reconcile, POLL_MS);
