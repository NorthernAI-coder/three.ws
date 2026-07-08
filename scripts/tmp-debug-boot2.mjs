import { chromium } from 'playwright';
const BASE = 'http://localhost:3004';
const WS = 'ws://localhost:2578';
const THREE_MINT = 'FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump';
const URL = `${BASE}/play?coin=${THREE_MINT}&name=three.ws&symbol=three`;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
page.on('console', (m) => { if (m.type()==='error') console.log('[console]', m.type(), m.text()); });
page.on('requestfailed', (r) => console.log('[reqfail]', r.url(), r.failure()?.errorText));
await page.addInitScript((ws) => { window.GAME_SERVER_URL = ws; }, WS);
await page.goto(URL, { waitUntil: 'load', timeout: 60000 });
for (let i = 0; i < 12; i++) {
  await page.waitForTimeout(5000);
  const state = await page.evaluate(() => {
    const cc = window.__CC__;
    return {
      phase: cc?.phase,
      hasNet: !!cc?.net,
      netStatus: cc?.net?.status,
      sessionId: cc?.net?.sessionId,
      playPass: cc?.playPass ? 'set' : 'empty',
      playReadyPending: cc?._playReady ? 'promise-present' : 'none',
    };
  });
  console.log(i, JSON.stringify(state));
  if (state.phase === 'world') break;
}
await page.screenshot({ path: '/tmp/claude-1000/-workspaces-three-ws/3af649c2-981d-4e27-bcc7-a1b386bdb681/scratchpad/debug-boot2.png', fullPage: true });
await browser.close();
