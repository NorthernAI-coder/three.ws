import puppeteer from 'puppeteer';
const APP = process.env.APP_URL;
const OMNI = process.env.OMNI_URL;
const SC = process.env.SC;

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage();
const errors = [], warnings = [], feedReqs = [];
page.on('console', (m) => {
  const t = m.type();
  if (t === 'error') errors.push(m.text());
  else if (t === 'warning' || t === 'warn') warnings.push(m.text());
});
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + (e?.message || e)));
page.on('request', (r) => { if (r.url().includes('/v1/contests/live')) feedReqs.push(Date.now()); });

await page.evaluateOnNewDocument((omni) => {
  window.OMNIOLOGY_BASE = omni;
  window.GAME_SERVER_URL = '';
}, OMNI);

await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 45000 });
await new Promise((r) => setTimeout(r, 12000));

const webgl = await page.evaluate(() => {
  const c = document.getElementById('kx-canvas');
  if (!c) return 'no-canvas';
  try { return (c.getContext('webgl2') || c.getContext('webgl')) ? 'ok' : 'no-context'; } catch { return 'throw'; }
});
const screens = await page.evaluate(() => window.__ARENA__?.contestScreens?.screens?.length ?? -1);
const contestId = await page.evaluate(() => window.__ARENA__?.contestScreens?.getContestId?.() ?? null);
await page.screenshot({ path: `${SC}/arena-live.png` });

const before = feedReqs.length;
await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
await new Promise((r) => setTimeout(r, 8000));
const pollsWhileHidden = feedReqs.length - before;

console.log(JSON.stringify({ webgl, screens, contestId, feedPolls: before, pollsWhileHidden, errorCount: errors.length, errors: errors.slice(0, 12), warnings: warnings.slice(0, 8) }, null, 2));
await browser.close();
