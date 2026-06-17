import { chromium } from 'playwright';

const id = process.argv[2] || '6bf40884-35af-432e-b432-8ba73fb5ba15';
const wait = Number(process.argv[3] || 15000);
const url = `http://localhost:3000/agents/${id}`;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 1600 } });
const errs = [];
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch((e) => console.log('nav:', e.message));
await page.waitForTimeout(wait);

const info = await page.evaluate(() => {
  const out = [];
  const walk = (root, path) => {
    for (const el of root.querySelectorAll('*')) {
      if (el.tagName === 'MODEL-VIEWER' || el.tagName === 'CANVAS') {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        out.push({
          path: path + ' > ' + el.tagName.toLowerCase() + (el.id ? '#' + el.id : ''),
          src: (el.getAttribute && el.getAttribute('src') || '').slice(-44),
          box: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
          pos: cs.position, z: cs.zIndex, disp: cs.display, vis: cs.visibility, op: cs.opacity, overflow: cs.overflow,
        });
      }
      if (el.shadowRoot) walk(el.shadowRoot, path + ' > ' + el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + '::shadow');
    }
  };
  walk(document, 'doc');
  // Also: avatar-actions host box + its display
  const aa = document.getElementById('ad-avatar-actions');
  const aaInfo = aa ? (() => { const r = aa.getBoundingClientRect(); const cs = getComputedStyle(aa); return { box: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }, disp: cs.display, hasShadow: !!aa.shadowRoot, html: aa.shadowRoot ? aa.shadowRoot.innerHTML.slice(0, 300) : aa.outerHTML.slice(0, 200) }; })() : null;
  return { viewers: out, avatarActions: aaInfo };
});
console.log(JSON.stringify(info, null, 1));

await page.screenshot({ path: `/tmp/hero-${id.slice(0, 8)}.png`, clip: { x: 0, y: 130, width: 1280, height: 560 } });
console.log('saved /tmp/hero-' + id.slice(0, 8) + '.png');
console.log('CONSOLE ERRORS:', errs.length);
errs.slice(0, 10).forEach((e) => console.log('  ', e.slice(0, 160)));
await browser.close();
