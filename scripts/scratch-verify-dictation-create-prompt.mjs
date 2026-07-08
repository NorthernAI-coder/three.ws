// Throwaway verification: confirms the voice dictation mic mounts on
// /create/prompt (avatar-from-text) without breaking the existing composer.
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
	if (m.type() === 'error' && !/WebSocket|favicon/i.test(m.text())) errors.push(m.text());
});

await page.goto(`${BASE}/create/prompt`, { waitUntil: 'networkidle' });
await page.waitForTimeout(600);

const micCount = await page.locator('#prompt-dictate-slot .pd-mic').count();
console.log(`mic mounted on /create/prompt: ${micCount > 0}`);

// The pre-existing composer still works: typing enables the Generate button's
// disabled state to flip (existing behavior, must survive the change).
await page.fill('#prompt', 'a friendly robot mascot, glossy white shell');
await page.waitForTimeout(200);
const disabled = await page.locator('#generate-btn').isDisabled();
console.log(`generate button enabled after typing (existing flow intact): ${!disabled}`);

console.log(`console errors: ${errors.length ? errors.join(' | ') : 'none'}`);

await browser.close();
if (micCount === 0 || disabled || errors.length) process.exit(1);
