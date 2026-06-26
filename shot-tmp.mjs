import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
const out = '/tmp/claude-1000/-workspaces-three-ws/763f2aa8-1bb7-4ff5-96db-bed3a25c0445/scratchpad';
const browser = await chromium.launch();
const models = ['/avatars/realistic-female.glb', '/avatars/michelle.glb', '/avatars/default.glb'];
const page = await browser.newPage({ viewport: { width: 760, height: 320 }, deviceScaleFactor: 2 });
const cards = models.map((m) =>
  `<div class="card"><iframe src="/embed/avatar?model=${encodeURIComponent(m)}&bg=transparent&hide-chrome=1"></iframe></div>`
).join('');
const html = `<!doctype html><meta charset=utf-8><style>
 html,body{margin:0;background:#0b0c0f}
 .row{display:flex;gap:16px;padding:16px}
 .card{width:230px;height:270px;background:#15171c;border:1px solid #23262d;border-radius:14px;overflow:hidden}
 iframe{width:100%;height:100%;border:0;background:transparent}
</style><div class=row>${cards}</div>`;
writeFileSync('/workspaces/three.ws/grid-tmp.html', html);
await page.goto('http://localhost:3000/grid-tmp.html', { waitUntil: 'load' });
await page.waitForTimeout(6500);
await page.screenshot({ path: out + '/grid.png' });
console.log('done');
await browser.close();
