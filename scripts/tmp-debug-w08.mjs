import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import net from 'node:net';

const VITE_PORT = 3034;
const WS_PORT = 2599;
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
	room.stdout.on('data', (d) => process.stdout.write(`[room] ${d}`));
	room.stderr.on('data', (d) => process.stderr.write(`[room:err] ${d}`));
	await waitForPort(WS_PORT, 30000);
	console.log('room up');

	const vite = spawn('/workspaces/three.ws/node_modules/.bin/vite', ['--port', String(VITE_PORT), '--strictPort'], {
		cwd: '/workspaces/three.ws',
		stdio: ['ignore', 'pipe', 'pipe'],
	});
	vite.stdout.on('data', (d) => process.stdout.write(`[vite] ${d}`));
	vite.stderr.on('data', (d) => process.stderr.write(`[vite:err] ${d}`));
	await waitForPort(VITE_PORT, 60000);
	console.log('vite up');

	const browser = await chromium.launch({ headless: true, args: ['--disable-dev-shm-usage'] });
	const page = await browser.newPage();
	page.on('console', (msg) => console.log(`[console:${msg.type()}]`, msg.text()));
	page.on('pageerror', (err) => console.log('[pageerror]', err.message, err.stack));
	page.on('requestfailed', (req) => console.log('[requestfailed]', req.url(), req.failure()?.errorText));
	await page.addInitScript((ws) => { window.GAME_SERVER_URL = ws; }, WS);

	await page.goto(URL, { waitUntil: 'domcontentloaded' });
	const start = Date.now();
	while (Date.now() - start < 90000) {
		const phase = await page.evaluate(() => window.__CC__?.phase).catch(() => null);
		if (phase === 'world') break;
		await page.waitForTimeout(1000);
	}
	await page.waitForTimeout(3000);

	const npcs = await page.evaluate(() => (window.__CC__?.worldLife?.npcs || []).map((n) => n.id)).catch((e) => `EVAL ERROR: ${e.message}`);
	console.log('NPC IDS:', JSON.stringify(npcs));

	const phase = await page.evaluate(() => window.__CC__?.phase).catch(() => 'n/a');
	console.log('phase:', phase);

	await browser.close();
	room.kill('SIGKILL');
	vite.kill('SIGKILL');
}
main().catch((e) => { console.error('FATAL', e); process.exit(1); });
