import puppeteer from 'puppeteer';

const base = process.argv[2] || 'http://localhost:3001';
const browser = await puppeteer.launch({ args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-webgl'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
await page.goto(`${base}/login.html`, { waitUntil: 'networkidle2' });
await new Promise(r => setTimeout(r, 2500));

const probe = async () => page.evaluate(() => {
  const wrap = document.getElementById('login-avatar-wrap');
  const canvas = document.getElementById('avatar-canvas');
  const wr = wrap?.getBoundingClientRect();
  const cr = canvas?.getBoundingClientRect();
  const cs = wrap ? getComputedStyle(wrap) : null;
  return {
    scrollY: window.scrollY,
    docScroll: document.scrollingElement?.scrollTop,
    bodyScrollH: document.body.scrollHeight,
    innerH: window.innerHeight,
    canvasPos: canvas ? getComputedStyle(canvas).position : null,
    canvasTop: cr ? Math.round(cr.top) : null,
    wrapDisplay: cs?.display,
    wrapPos: cs?.position,
    wrapTop: wr ? Math.round(wr.top) : null,
    wrapH: wr ? Math.round(wr.height) : null,
  };
});

const before = await probe();
await page.evaluate(() => window.scrollTo(0, 400));
await new Promise(r => setTimeout(r, 600));
const after = await probe();

console.log('BEFORE scroll:', JSON.stringify(before));
console.log('AFTER  scroll:', JSON.stringify(after));
console.log('canvas moved on scroll?', before.canvasTop !== after.canvasTop, `(Δ${after.canvasTop - before.canvasTop})`);

await page.evaluate(() => window.scrollTo(0, 0));
await new Promise(r => setTimeout(r, 600));
await page.screenshot({ path: '/tmp/login-scroll0.png' });
await page.evaluate(() => window.scrollTo(0, 400));
await new Promise(r => setTimeout(r, 600));
await page.screenshot({ path: '/tmp/login-scroll400.png' });
console.log('screenshots written');

await browser.close();
