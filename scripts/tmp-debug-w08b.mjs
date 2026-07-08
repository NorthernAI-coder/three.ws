import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import net from 'node:net';

const VITE_PORT = 3035;
const WS_PORT = 2600;
const BASE = `http://localhost:${VITE_PORT}`;
const WS = `ws://localhost:${WS_PORT}`;
const THREE_MINT = 'FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump';
const URL = `${BASE}/play?coin=${THREE_MINT}&name=three.ws&symbol=three`;

function waitForPort(port, timeout = 60000) {
	return new Promise((resolve, reject) => {
		const start = Date.now();
		(function attempt() {
			const sock = net.createConnection({ port, host: '127.0.0.1' });
			sock.once('connect', () => { sock.end(); resolve(); });
			sock.once('error', () => {
				sock.destroy();
				if (Date.now() - start > timeout) reject(new Error(`port ${port} never opened`));
				else setTimeout(attempt, 400);
			});
		})();
	});
}

async function main() {
	const room = spawn('node', ['src/index.js'], {
		cwd: '/workspaces/three.ws/multiplayer',
		env: { ...process.env, PORT: String(WS_PORT), ALLOWED_ORIGINS: BASE },
		stdio: ['ignore', 'pipe', 'pipe'],
	});
	room.stderr.on('data', (d) => process.stderr.write(`[room:err] ${d}`));
	await waitForPort(WS_PORT, 30000);

	const vite = spawn('/workspaces/three.ws/node_modules/.bin/vite', ['--port', String(VITE_PORT), '--strictPort'], {
		cwd: '/workspaces/three.ws',
		stdio: ['ignore', 'pipe', 'pipe'],
	});
	await waitForPort(VITE_PORT, 60000);

	const browser = await chromium.launch({ headless: true, args: ['--disable-dev-shm-usage'] });
	const page = await browser.newPage();
	page.on('console', (msg) => { if (msg.type() === 'error') console.log(`[console:error]`, msg.text()); });
	page.on('pageerror', (err) => console.log('[pageerror]', err.message));
	await page.addInitScript((ws) => { window.GAME_SERVER_URL = ws; }, WS);

	await page.goto(URL, { waitUntil: 'domcontentloaded' });
	const start = Date.now();
	while (Date.now() - start < 90000) {
		const phase = await page.evaluate(() => window.__CC__?.phase).catch(() => null);
		if (phase === 'world') break;
		await page.waitForTimeout(1000);
	}
	await page.waitForTimeout(2000);

	// Teleport the local player position right next to Foreman Dell (26,-6) AND
	// call interact() in the SAME evaluate() round-trip — localPos is driven by
	// the physics loop every animation frame, so a manual mutation made in one
	// evaluate() call gets snapped back before a second, separate evaluate()
	// call can read it. Doing both atomically avoids that race.
	const result = await page.evaluate(() => {
		const cc = window.__CC__;
		const out = { hasWorldLife: !!cc.worldLife, hasNet: !!cc.net };
		try {
			cc.localPos.x = 27; cc.localPos.z = -6;
			const npc = cc.worldLife._nearestNpc(cc.localPos);
			out.nearestNpcId = npc ? npc.id : null;
			const nearest = cc.worldLife._nearestInteractable(cc.localPos);
			out.nearestInteractable = nearest ? nearest.kind + ':' + (nearest.npc ? nearest.npc.id : nearest.zone?.id) : null;
			out.interactResult = cc.worldLife.interact();
			out.posAfter = { x: cc.localPos.x, z: cc.localPos.z };
		} catch (e) { out.error1 = e.message + '\n' + e.stack; }
		return out;
	});
	console.log('ATOMIC RESULT:', JSON.stringify(result, null, 2));
	await page.waitForTimeout(500);
	const result2 = await page.evaluate(() => {
		const cc = window.__CC__;
		return { posNow: { x: cc.localPos.x, z: cc.localPos.z } };
	});
	console.log('POS 500ms LATER (physics loop check):', JSON.stringify(result2));

	await page.waitForTimeout(2000);
	const panelPresent = await page.evaluate(() => !!document.querySelector('.ec-overlay .ec-title'));
	const panelTitle = await page.evaluate(() => document.querySelector('.ec-overlay .ec-title')?.textContent);
	console.log('panel present:', panelPresent, 'title:', panelTitle);

	const directCall = await page.evaluate(async () => {
		const cc = window.__CC__;
		try {
			const mod = await import('/src/game/quests-ui.js');
			return { importOk: true, hasOpenQuestsPanel: typeof mod.openQuestsPanel === 'function' };
		} catch (e) { return { importOk: false, error: e.message + '\n' + (e.stack || '') }; }
	});
	console.log('DIRECT IMPORT TEST:', JSON.stringify(directCall, null, 2));

	const directToggle = await page.evaluate(async () => {
		const cc = window.__CC__;
		try {
			await cc._toggleQuests('harbor-courier');
			return { ok: true };
		} catch (e) { return { ok: false, error: e.message + '\n' + (e.stack || '') }; }
	});
	console.log('DIRECT _toggleQuests TEST:', JSON.stringify(directToggle, null, 2));
	await page.waitForTimeout(500);
	const panelPresent2 = await page.evaluate(() => !!document.querySelector('.ec-overlay .ec-title'));
	console.log('panel present after direct toggle:', panelPresent2);

	const manualOnInteract = await page.evaluate(() => {
		const cc = window.__CC__;
		const npc = cc.worldLife.npcs.find((n) => n.id === 'npc-quest-foreman');
		if (!npc) return { found: false };
		const out = { found: true, hasOnInteract: typeof npc.def.onInteract === 'function' };
		try {
			npc.def.onInteract({ npc, player: cc.localPos, ui: cc.ui, net: cc.net, world: cc.worldLife.world });
			out.calledOk = true;
		} catch (e) { out.calledOk = false; out.error = e.message + '\n' + (e.stack || ''); }
		return out;
	});
	console.log('MANUAL onInteract CALL:', JSON.stringify(manualOnInteract, null, 2));
	await page.waitForTimeout(500);
	const panelPresent3 = await page.evaluate(() => !!document.querySelector('.ec-overlay .ec-title'));
	console.log('panel present after manual onInteract:', panelPresent3);

	const wrapperCall = await page.evaluate(() => {
		const cc = window.__CC__;
		const npc = cc.worldLife.npcs.find((n) => n.id === 'npc-quest-foreman');
		const out = {};
		try {
			npc.interact({ player: cc.localPos, ui: cc.ui, net: cc.net, world: cc.worldLife.world });
			out.calledOk = true;
		} catch (e) { out.calledOk = false; out.error = e.message + '\n' + (e.stack || ''); }
		return out;
	});
	console.log('npc.interact() WRAPPER CALL:', JSON.stringify(wrapperCall, null, 2));
	await page.waitForTimeout(500);
	const panelPresent4 = await page.evaluate(() => !!document.querySelector('.ec-overlay .ec-title'));
	console.log('panel present after npc.interact() wrapper call:', panelPresent4);

	await browser.close();
	room.kill('SIGKILL');
	vite.kill('SIGKILL');
}
main().catch((e) => { console.error('FATAL', e); process.exit(1); });
