// One-off probe: what does a brand-new (no-agent, signed-out) user see at /app?
// Captures the agent-home container, sidebar text, console errors, and a shot.
import { chromium } from 'playwright';

const URL = process.env.PROBE_URL || 'http://localhost:3000/app';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();

const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

// Fresh user: no localStorage, no session.
await page.addInitScript(() => { try { localStorage.clear(); sessionStorage.clear(); } catch {} });
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch((e) => errors.push('GOTO: ' + e.message));
// The agent-home container is populated asynchronously after the app boots —
// poll for it rather than relying on networkidle (the 3D app holds connections open).
await page.waitForFunction(() => {
  const el = document.getElementById('agent-home-container');
  return el && (el.innerHTML || '').trim().length > 0;
}, { timeout: 20000 }).catch((e) => errors.push('WAIT_CONTAINER: ' + e.message));

const report = await page.evaluate(() => {
  const home = document.getElementById('agent-home-container');
  const authGate = document.querySelector('[data-auth-gate], #auth-gate, .auth-gate, #signin, .signin');
  const sidebar = document.querySelector('#sidebar, .sidebar, aside');
  const visible = (el) => !!el && el.offsetParent !== null && (el.textContent || '').trim().length > 0;
  return {
    homeExists: !!home,
    homeHasContent: home ? (home.innerHTML || '').trim().length : -1,
    homeText: home ? (home.textContent || '').trim().slice(0, 200) : null,
    authGateVisible: visible(authGate),
    authGateText: authGate ? (authGate.textContent || '').trim().slice(0, 160) : null,
    sidebarText: sidebar ? (sidebar.textContent || '').trim().slice(0, 200) : null,
    bodyHasCreateCTA: /create.*(your )?(first )?agent|get started|sign in|log in/i.test(document.body.textContent || ''),
  };
});

await page.screenshot({ path: '/tmp/app-fresh-user.png', fullPage: false });
console.log(JSON.stringify({ report, errors: errors.slice(0, 20) }, null, 2));
await browser.close();
