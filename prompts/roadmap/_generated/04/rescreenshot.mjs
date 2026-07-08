import { chromium } from '@playwright/test';
const browser = await chromium.launch();
const page = await browser.newPage();
await page.setViewportSize({ width: 320, height: 640 });
await page.goto('http://localhost:3000/scene', { waitUntil: 'load', timeout: 60000 });
await page.waitForTimeout(2500);
await page.screenshot({ path: '/workspaces/three.ws/prompts/roadmap/_generated/04/scene-320.png' });
await browser.close();
console.log('done');
