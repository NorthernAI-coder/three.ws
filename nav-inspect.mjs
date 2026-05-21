import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('http://localhost:3000/marketplace', { waitUntil: 'networkidle' });
await page.waitForSelector('.home-nav .nav-cta', { timeout: 5000 });

const cta = await page.locator('.home-nav .nav-cta').first();
const box = await cta.boundingBox();
const styles = await cta.evaluate((el) => {
  const cs = getComputedStyle(el);
  return {
    background: cs.background,
    backgroundImage: cs.backgroundImage,
    color: cs.color,
    padding: cs.padding,
    borderRadius: cs.borderRadius,
    boxShadow: cs.boxShadow,
    fontSize: cs.fontSize,
    fontWeight: cs.fontWeight,
  };
});
console.log('CTA box:', box);
console.log('CTA computed styles:', JSON.stringify(styles, null, 2));

// also dump header background
const header = await page.locator('.site-header').first();
const hs = await header.evaluate((el) => {
  const cs = getComputedStyle(el);
  return {
    background: cs.background,
    backdropFilter: cs.backdropFilter,
    borderBottom: cs.borderBottom,
  };
});
console.log('Header styles:', JSON.stringify(hs, null, 2));

// take focused screenshot of CTA
if (box) {
  await page.screenshot({ path: '/tmp/cta-zoom.png', clip: { x: box.x - 20, y: box.y - 20, width: box.width + 60, height: box.height + 40 } });
}

// take a full nav screenshot scaled up
await page.screenshot({ path: '/tmp/nav-full.png', clip: { x: 0, y: 0, width: 1440, height: 120 } });
await browser.close();
