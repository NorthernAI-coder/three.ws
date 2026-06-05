import puppeteer from 'puppeteer';

const TOKEN_RADII = new Set(['6px', '10px', '14px', '999px', '0px']); // sm/md/lg/pill (+0/50% circles excluded below)
const SCALE_PX = ['2.336px', '3.776px', '6.112px', '9.888px', '16px', '25.888px', '41.888px', '67.776px'];

const PAGES = [
  { name: 'home', url: 'http://localhost:3000/home.html' },
  { name: 'marketplace', url: 'http://localhost:3000/marketplace.html' },
  { name: 'dashboard-next', url: 'http://localhost:3000/dashboard-next/' },
  { name: 'pump-dashboard', url: 'http://localhost:3000/pump-dashboard.html' },
];

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
let totalBad = 0;

for (const p of PAGES) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  let status = 0;
  try {
    const resp = await page.goto(p.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    status = resp?.status();
  } catch (e) {
    console.log(`\n## ${p.name}: NAV ERROR ${e.message}`);
    await page.close();
    continue;
  }
  await new Promise(r => setTimeout(r, 1200));

  const data = await page.evaluate(() => {
    const radii = {};
    const gaps = {};
    let radiusOddballs = [];
    const els = document.querySelectorAll('*');
    let sampled = 0;
    for (const el of els) {
      const cs = getComputedStyle(el);
      const r = cs.borderTopLeftRadius;
      if (r && r !== '0px') {
        radii[r] = (radii[r] || 0) + 1;
        // flag radii that aren't a token value, 50%, or pill
        const px = parseFloat(r);
        const isPct = r.includes('%');
        if (!isPct && ![6, 10, 14].includes(px) && px < 90 && el.offsetWidth > 0) {
          if (radiusOddballs.length < 12) radiusOddballs.push({ tag: el.tagName.toLowerCase(), cls: (el.className && el.className.toString().slice(0,40)) || '', r });
        }
      }
      const g = cs.gap;
      if (g && g !== 'normal' && g !== '0px') gaps[g] = (gaps[g] || 0) + 1;
      sampled++;
    }
    return { radii, gaps, radiusOddballs, sampled };
  });

  console.log(`\n## ${p.name}  (HTTP ${status}, ${data.sampled} els)`);
  console.log('  radii (computed borderTopLeftRadius):');
  for (const [k, v] of Object.entries(data.radii).sort((a,b)=>b[1]-a[1])) {
    const ok = TOKEN_RADII.has(k) || k.includes('%') || parseFloat(k) >= 90;
    console.log(`    ${ok ? 'OK ' : 'XX '} ${k.padEnd(10)} ×${v}`);
    if (!ok) totalBad += v;
  }
  console.log('  gaps (top 8):');
  for (const [k, v] of Object.entries(data.gaps).sort((a,b)=>b[1]-a[1]).slice(0,8)) {
    const ok = SCALE_PX.includes(k) || k === '0px';
    console.log(`    ${ok ? 'OK ' : '?? '} ${k.padEnd(18)} ×${v}`);
  }
  if (data.radiusOddballs.length) {
    console.log('  non-token radius elements (visible):');
    data.radiusOddballs.forEach(o => console.log(`    - <${o.tag} class="${o.cls}"> r=${o.r}`));
  }
  await page.close();
}

console.log(`\n=== non-token radius element-count across pages: ${totalBad} ===`);
await browser.close();
