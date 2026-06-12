import { chromium } from 'playwright';
const browser = await chromium.launch();
const ctx = await browser.newContext({ colorScheme: 'light' });
const page = await ctx.newPage();
await page.addInitScript(() => localStorage.setItem('twx_theme', 'light'));
await page.goto('http://localhost:3010/pages/scene.html', { waitUntil: 'load' });
await page.waitForSelector('#studio-app #menubar');
await page.waitForTimeout(1500);
const r = await page.evaluate(() => ({
  dataTheme: document.documentElement.getAttribute('data-theme'),
  menubarBg: getComputedStyle(document.querySelector('#studio-app #menubar')).backgroundColor,
  appBg: getComputedStyle(document.querySelector('#studio-app')).backgroundColor,
}));
console.log(JSON.stringify(r));
await browser.close();
