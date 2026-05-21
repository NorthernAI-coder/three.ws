import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }).then(c => c.newPage());
await page.goto('http://localhost:3000/marketplace', { waitUntil: 'networkidle' });
await page.waitForSelector('.home-nav .nav-root', { timeout: 5000 });
await page.waitForTimeout(600);

const buildBtn = await page.locator('.home-nav .nav-trigger', { hasText: 'Build' }).first();
await buildBtn.click();
await page.waitForTimeout(300);

const data = await page.evaluate(() => {
  const scroll = { x: window.scrollX, y: window.scrollY, innerH: window.innerHeight };
  const header = document.querySelector('.site-header');
  const headerCS = header && getComputedStyle(header);
  const navContainer = document.getElementById('nav-container');
  const ncCS = navContainer && getComputedStyle(navContainer);
  const homeNav = document.querySelector('.home-nav');
  const hnCS = homeNav && getComputedStyle(homeNav);
  const rect = (el) => el ? el.getBoundingClientRect() : null;
  return {
    scroll,
    header: rect(header),
    headerCS: header ? {
      position: headerCS.position,
      display: headerCS.display,
      height: headerCS.height,
      verticalAlign: headerCS.verticalAlign,
      lineHeight: headerCS.lineHeight,
    } : null,
    navContainer: rect(navContainer),
    navContainerCS: navContainer ? {
      display: ncCS.display,
      verticalAlign: ncCS.verticalAlign,
      lineHeight: ncCS.lineHeight,
    } : null,
    homeNav: rect(homeNav),
    homeNavCS: homeNav ? {
      display: hnCS.display,
      verticalAlign: hnCS.verticalAlign,
      lineHeight: hnCS.lineHeight,
      alignItems: hnCS.alignItems,
    } : null,
  };
});
console.log(JSON.stringify(data, null, 2));
await browser.close();
