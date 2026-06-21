import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

await page.goto('http://localhost:3000/club', { waitUntil: 'load' });
await page.waitForTimeout(8000);

// Probe several screen points for the topmost element
const points = [
  { name: 'top-bar Audio btn', x: 1130, y: 32 },
  { name: 'right panel Tip btn area', x: 1150, y: 560 },
  { name: 'right panel Change Avatar', x: 1150, y: 460 },
  { name: 'stage center', x: 500, y: 450 },
  { name: 'top center reactions', x: 600, y: 80 },
];

const info = await page.evaluate((pts) => {
  function desc(el) {
    if (!el) return 'null';
    const cs = getComputedStyle(el);
    return `${el.tagName.toLowerCase()}#${el.id || ''}.${(el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className) || ''} [z=${cs.zIndex} pe=${cs.pointerEvents} pos=${cs.position} op=${cs.opacity} disp=${cs.display}]`;
  }
  // List all fixed/absolute full-viewport elements that might overlay
  const overlays = [];
  document.querySelectorAll('*').forEach(el => {
    const cs = getComputedStyle(el);
    if ((cs.position === 'fixed' || cs.position === 'absolute')) {
      const r = el.getBoundingClientRect();
      if (r.width >= window.innerWidth * 0.8 && r.height >= window.innerHeight * 0.6 && cs.pointerEvents !== 'none' && cs.display !== 'none' && cs.visibility !== 'hidden') {
        overlays.push(`${desc(el)} rect=${Math.round(r.width)}x${Math.round(r.height)}@${Math.round(r.left)},${Math.round(r.top)}`);
      }
    }
  });
  const hits = pts.map(p => ({ name: p.name, top: desc(document.elementFromPoint(p.x, p.y)) }));
  return { overlays, hits, loaderExists: !!document.getElementById('club-loader'), loaderDone: document.getElementById('club-loader')?.classList.contains('is-done'), doorCanvas: !!document.getElementById('club-door-canvas') };
}, points);

console.log('=== Big pointer-capturing overlays ===');
info.overlays.forEach(o => console.log('  ' + o));
console.log('=== elementFromPoint hits ===');
info.hits.forEach(h => console.log(`  ${h.name}: ${h.top}`));
console.log('loaderExists', info.loaderExists, 'loaderDone', info.loaderDone, 'doorCanvas', info.doorCanvas);
console.log('=== JS errors ===');
errors.slice(0, 20).forEach(e => console.log('  ' + e));

await browser.close();
