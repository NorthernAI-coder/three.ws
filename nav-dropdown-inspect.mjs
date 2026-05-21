import { chromium } from 'playwright';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
await page.goto('http://localhost:3000/marketplace', { waitUntil: 'networkidle' });
await page.waitForSelector('.home-nav .nav-root', { timeout: 5000 });
await page.waitForTimeout(800);

// open Build dropdown
const buildBtn = await page.locator('.home-nav .nav-trigger', { hasText: 'Build' }).first();
await buildBtn.click();
await page.waitForTimeout(400);

const menu = await page.locator('.home-nav .nav-trigger[aria-expanded="true"] + .nav-menu').first();
const visible = await menu.isVisible();
const box = await menu.boundingBox();
const cs = await menu.evaluate((el) => {
  const s = getComputedStyle(el);
  return {
    opacity: s.opacity, transform: s.transform, pointerEvents: s.pointerEvents,
    zIndex: s.zIndex, position: s.position, top: s.top, left: s.left,
    width: el.offsetWidth, height: el.offsetHeight,
    childrenCount: el.querySelectorAll('a').length,
    bg: s.background.slice(0, 80),
  };
});
console.log('Build menu visible:', visible, 'box:', box);
console.log('Build menu styles:', JSON.stringify(cs, null, 2));

// Direct screenshot of the menu element
const path = '/tmp/build-dropdown-direct.png';
await menu.screenshot({ path });
console.log('Saved:', path);

// Also screenshot a wider area around the menu
if (box) {
  await page.screenshot({
    path: '/tmp/build-dropdown-context.png',
    clip: {
      x: Math.max(0, box.x - 40),
      y: 0,
      width: Math.min(1440 - Math.max(0, box.x - 40), box.width + 80),
      height: Math.ceil(box.y + box.height + 40),
    },
  });
}
await browser.close();
