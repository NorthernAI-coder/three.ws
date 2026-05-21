import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('http://localhost:3000/marketplace', { waitUntil: 'networkidle' });
await page.waitForSelector('.home-nav .nav-root', { timeout: 5000 });
await page.waitForTimeout(700);

const data = await page.evaluate(() => {
  const h1 = document.querySelector('.site-header-brand');
  const header = document.querySelector('.site-header');
  const rect = (el) => el ? el.getBoundingClientRect() : null;
  const cs = (el) => el ? getComputedStyle(el) : null;
  const h1cs = cs(h1);
  return {
    h1: rect(h1),
    h1cs: {
      lineHeight: h1cs.lineHeight,
      height: h1cs.height,
      fontSize: h1cs.fontSize,
      display: h1cs.display,
      alignSelf: h1cs.alignSelf,
      verticalAlign: h1cs.verticalAlign,
      margin: h1cs.margin,
    },
    header: rect(header),
    headerScroll: { scrollHeight: header.scrollHeight, clientHeight: header.clientHeight, scrollTop: header.scrollTop },
  };
});
console.log(JSON.stringify(data, null, 2));
await browser.close();
