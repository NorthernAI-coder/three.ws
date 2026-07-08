import { chromium } from 'playwright';
const BASE = 'http://localhost:3004';
const WS = 'ws://localhost:2578';
const THREE_MINT = 'FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump';
const URL = `${BASE}/play?coin=${THREE_MINT}&name=three.ws&symbol=three`;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
page.on('console', (m) => console.log('[console]', m.type(), m.text()));
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('requestfailed', (r) => console.log('[reqfail]', r.url(), r.failure()?.errorText));
await page.addInitScript((ws) => { window.GAME_SERVER_URL = ws; }, WS);
console.log('navigating to', URL);
await page.goto(URL, { waitUntil: 'load', timeout: 60000 });
console.log('loaded, waiting 12s for boot...');
await page.waitForTimeout(12000);
const state = await page.evaluate(() => ({
  hasCC: !!window.__CC__,
  phase: window.__CC__?.phase,
  sessionId: window.__CC__?.net?.sessionId,
  physicsOk: window.__CC__?._physicsOk,
  netStatus: window.__CC__?.net?.status,
}));
console.log('state:', JSON.stringify(state));
await page.screenshot({ path: '/tmp/claude-1000/-workspaces-three-ws/3af649c2-981d-4e27-bcc7-a1b386bdb681/scratchpad/debug-boot.png', fullPage: true });
await browser.close();
