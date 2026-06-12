import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

await page.goto('http://localhost:3010/pages/scene.html', { waitUntil: 'load', timeout: 30000 });
await page.waitForTimeout(4000);

const result = await page.evaluate(() => ({
  hasMenubar: !!document.querySelector('#studio-app #menubar'),
  hasSidebar: !!document.querySelector('#studio-app #sidebar'),
  hasViewportCanvas: !!document.querySelector('#studio-app #viewport canvas'),
  hasToolbar: !!document.querySelector('#studio-app #toolbar'),
  hasNav: !!document.querySelector('header'),
  menubarTop: document.querySelector('#studio-app')?.getBoundingClientRect().top,
  editorGlobal: typeof window.editor,
  bodyOverflow: getComputedStyle(document.body).overflow,
}));
console.log(JSON.stringify(result, null, 1));
await page.screenshot({ path: '/tmp/scene-studio.png' });
console.log('console errors:', errors.length ? errors : 'none');
await browser.close();
