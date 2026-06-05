import puppeteer from 'puppeteer';

const BASE = process.env.BASE || 'http://localhost:3001';
const PAGES = ['/', '/marketplace', '/dashboard', '/unstoppable', '/shopper'];

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});

const fam = (s) => (s || '').split(',')[0].replace(/["']/g, '').trim();
let failures = 0;

for (const path of PAGES) {
  const page = await browser.newPage();
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  try {
    await page.goto(BASE + path, { waitUntil: 'networkidle2', timeout: 30000 });
    await page.evaluate(() => document.fonts.ready);

    const data = await page.evaluate(() => {
      const cs = getComputedStyle(document.documentElement);
      const tok = (n) => cs.getPropertyValue(n).trim();
      const bodyFam = getComputedStyle(document.body).fontFamily;
      const h = document.querySelector('h1,h2,.h1,.h2,.display,.hero-title');
      const headFam = h ? getComputedStyle(h).fontFamily : '(none)';
      // resolve a token to px via a probe element
      const probe = document.createElement('span');
      probe.style.fontSize = 'var(--text-md)';
      document.body.appendChild(probe);
      const mdPx = getComputedStyle(probe).fontSize;
      probe.remove();
      // loaded font families (dedup)
      const loaded = [...new Set([...document.fonts].filter(f => f.status === 'loaded').map(f => f.family))];
      return {
        tokens: { '2xs': tok('--text-2xs'), md: tok('--text-md'), ui: tok('--text-ui'), base: tok('--text-base') },
        mdPx, bodyFam, headFam, loaded,
      };
    });

    const bodyOk = /Inter|system-ui/i.test(data.bodyFam);
    const headOk = /Space Grotesk|Inter/i.test(data.headFam);
    const tokOk = data.mdPx === '13px';
    const noTight = !/Inter Tight/i.test(JSON.stringify(data));
    const ok = bodyOk && headOk && tokOk && noTight && errors.length === 0;
    if (!ok) failures++;
    console.log(`\n${ok ? '✓' : '✗'} ${path}`);
    console.log(`   body=${fam(data.bodyFam)}  head=${fam(data.headFam)}  --text-md→${data.mdPx}`);
    console.log(`   tokens: 2xs=${data.tokens['2xs']} md=${data.tokens.md} ui=${data.tokens.ui} base=${data.tokens.base}`);
    console.log(`   fonts loaded: ${data.loaded.join(', ') || '(none yet)'}`);
    if (errors.length) console.log(`   console errors: ${errors.slice(0, 3).join(' | ')}`);
  } catch (e) {
    failures++;
    console.log(`\n✗ ${path}  ERROR: ${e.message}`);
  }
  await page.close();
}

await browser.close();
console.log(`\n${failures ? '✗ ' + failures + ' page(s) failed' : '✓ all pages pass'}`);
process.exit(failures ? 1 : 0);
