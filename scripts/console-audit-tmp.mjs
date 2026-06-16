import { chromium } from 'playwright';

const BASE = 'http://localhost:3000';
const path = process.argv[2];
const label = process.argv[3] || path;
if (!path) { console.error('usage: console-audit-tmp.mjs <path> [label]'); process.exit(2); }

const IGNORE = [
	/\[vite\]/, /vite\/dist\/client/, /\/@vite\/client/, /\/@react-refresh/,
	/posthog|us\.i\.posthog|us-assets/i, /chrome-extension:\/\//, /favicon\.ico/,
	/google-analytics|googletagmanager/, /Download the React DevTools/, /\[HMR\]/,
	/ERR_CONNECTION_REFUSED/, /net::ERR_ABORTED/,
];
const ignore = (t) => IGNORE.some((re) => re.test(t || ''));

const rec = { errors: [], warnings: [], pageerrors: [], failed: [], bad: [] };
const browser = await chromium.launch({ args: ['--disable-dev-shm-usage', '--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

page.on('console', (msg) => {
	const type = msg.type();
	if (type !== 'error' && type !== 'warning') return;
	const text = msg.text();
	if (ignore(text)) return;
	const loc = msg.location();
	const where = loc?.url ? `${loc.url}:${loc.lineNumber}:${loc.columnNumber}` : '';
	(type === 'error' ? rec.errors : rec.warnings).push({ text, where });
});
page.on('pageerror', (err) => {
	if (ignore(err.message)) return;
	rec.pageerrors.push({ text: err.message, stack: (err.stack || '').split('\n').slice(0, 5).join(' | ') });
});
page.on('requestfailed', (req) => {
	const url = req.url();
	if (ignore(url)) return;
	const f = req.failure();
	if (ignore(f?.errorText)) return;
	rec.failed.push({ url, error: f?.errorText || '' });
});
page.on('response', (resp) => {
	const status = resp.status();
	if (status < 400) return;
	const url = resp.url();
	if (ignore(url)) return;
	rec.bad.push({ url, status });
});

try {
	await page.goto(BASE + path, { waitUntil: 'domcontentloaded', timeout: 45000 });
} catch (e) {
	rec.pageerrors.push({ text: `goto failed: ${e.message.split('\n')[0]}`, stack: '' });
}
await page.waitForTimeout(6000);
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => {});
await page.waitForTimeout(2500);
await ctx.close();
await browser.close();

console.log(`\n${'='.repeat(70)}\n${label}   (${path})`);
const total = rec.errors.length + rec.warnings.length + rec.pageerrors.length + rec.failed.length + rec.bad.length;
if (!total) { console.log('  CLEAN'); }
else {
	if (rec.pageerrors.length) { console.log(`  PAGEERRORS (${rec.pageerrors.length}):`); rec.pageerrors.forEach((e) => console.log(`    x ${e.text}\n        ${e.stack}`)); }
	if (rec.errors.length) { console.log(`  CONSOLE.ERROR (${rec.errors.length}):`); rec.errors.forEach((e) => console.log(`    x ${e.text}\n        @ ${e.where}`)); }
	if (rec.warnings.length) { console.log(`  CONSOLE.WARN (${rec.warnings.length}):`); rec.warnings.forEach((e) => console.log(`    ! ${e.text}\n        @ ${e.where}`)); }
	if (rec.failed.length) { console.log(`  REQUEST FAILED (${rec.failed.length}):`); rec.failed.forEach((e) => console.log(`    x ${e.url}  [${e.error}]`)); }
	if (rec.bad.length) { console.log(`  HTTP >=400 (${rec.bad.length}):`); rec.bad.forEach((e) => console.log(`    ${e.status}  ${e.url}`)); }
}
console.log('ROUTE_DONE');
process.exit(0);
