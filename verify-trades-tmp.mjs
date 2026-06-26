import { chromium } from 'playwright';
const URL = process.argv[2] || 'http://localhost:3001/trades';
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 }).catch((e) => errors.push('GOTO: ' + e.message));
await page.waitForTimeout(9000);
const snap = await page.evaluate(() => {
  const txt = (s) => document.querySelector(s)?.textContent?.trim() || null;
  const sections = [...document.querySelectorAll('.dd-card[data-section]')].map((c) => {
    const b = c.querySelector('.dd-card-b');
    return { id: c.dataset.section, skel: !!b?.querySelector('.dd-skel'), na: !!b?.querySelector('.dd-note--na'), len: (b?.textContent||'').length };
  });
  return {
    heroSym: txt('.dd-hero-sym'), strip: txt('.dd-strip'),
    pulseMints: txt('#ttPulseMints'), pulseSol: txt('#ttPulseSol'),
    feedRows: document.querySelectorAll('#ttFeed [data-mint]').length,
    chartCanvas: !!document.querySelector('.dd-chart canvas'),
    bubbleCanvas: !!document.querySelector('.bm-canvas'),
    bubbleEmpty: !!document.querySelector('.bm-empty'),
    tapeRows: document.querySelectorAll('.tp-row').length,
    sections,
  };
});
console.log(JSON.stringify(snap, null, 2));
console.log('\nERRORS (' + errors.length + '):');
errors.slice(0, 20).forEach((e) => console.log(' •', e.slice(0, 200)));
await page.screenshot({ path: '/tmp/claude-1000/-workspaces-three-ws/0a1c2957-b3c5-41d3-8b9b-dcdbdbe28417/scratchpad/trades.png', fullPage: true });
await browser.close();
