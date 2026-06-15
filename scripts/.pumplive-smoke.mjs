import { chromium } from 'playwright';

const BASE = 'http://localhost:3939';
const results = [];
const ok = (n, c, d='') => { results.push({ n, c, d }); console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`); };

const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();

const consoleErrors = [];
const pageErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => pageErrors.push(e.message));

// 'commit' (not 'domcontentloaded'): DCL waits on the viewer module's three.js
// download, but the feed module has no heavy imports and runs before then — so
// the feed must be queryable well before DCL. This is the decoupling under test.
await page.goto(`${BASE}/pump-live`, { waitUntil: 'commit', timeout: 30000 });
await page.waitForSelector('#status', { timeout: 15000 });

// 1. Empty/skeleton state present quickly (feed must NOT wait on the 3D viewer)
await page.waitForSelector('.skeleton-card', { timeout: 8000 }).catch(() => {});
const skeletonCount = await page.locator('.skeleton-card').count();
const hint = await page.locator('#feed-empty-hint').textContent().catch(() => '');
ok('Empty state: skeleton renders immediately (feed not gated on viewer)', skeletonCount >= 1, `${skeletonCount} skeletons, hint="${(hint||'').trim()}"`);

// 2. WS connects → status becomes Live
await page.waitForFunction(() => document.getElementById('status')?.classList.contains('connected'), { timeout: 25000 }).catch(() => {});
const statusText = await page.locator('#status').textContent();
ok('WebSocket connects (status = Live)', /live/i.test(statusText), `status="${statusText.trim()}"`);

// 3. At least one real token card within 60s
await page.waitForSelector('.token-card', { timeout: 60000 }).catch(() => {});
const cardCount = await page.locator('.token-card').count();
ok('Token card(s) render from live feed', cardCount >= 1, `${cardCount} cards`);

// 4. Card data integrity — no undefined/null/[object Object]
const first = page.locator('.token-card').first();
const name = (await first.locator('.token-name').textContent().catch(() => '') || '').trim();
const mcap = (await first.locator('.token-mcap').textContent().catch(() => '') || '').trim();
const feedText = await page.locator('#feed').textContent();
const dirty = /undefined|\bnull\b|\[object Object\]/.test(feedText);
ok('No undefined/null/[object Object] in feed', !dirty, dirty ? 'FOUND dirty text' : `e.g. name="${name}", "${mcap}"`);
ok('Card has a real name', name.length > 0 && name !== 'undefined');

// 5. Stats increment from real events
const launched = parseInt((await page.locator('#stat-launched').textContent()).replace(/\D/g, '') || '0', 10);
const volume = (await page.locator('#stat-volume').textContent()).trim();
const age = (await page.locator('#stat-age').textContent()).trim();
ok('Stat: tokens launched > 0', launched > 0, `launched=${launched}`);
ok('Stat: volume populated', volume.length > 0 && volume !== '$0', `volume=${volume}`);
ok('Stat: last-launch populated', age !== '—', `age=${age}`);

// 6. Mobile layout stacks vertically at 375px
await page.setViewportSize({ width: 375, height: 800 });
await page.waitForTimeout(400);
const vb = await page.locator('#viewer-container').boundingBox();
const fb = await page.locator('#feed-container').boundingBox();
const stacked = vb && fb && (fb.y >= vb.y + vb.height - 5 || vb.y >= fb.y + fb.height - 5);
const sameRow = vb && fb && Math.abs(vb.y - fb.y) < 20 && vb.x !== fb.x;
ok('Mobile (375px): panels stack vertically', !!stacked && !sameRow, `viewer y=${vb?.y?.toFixed(0)} h=${vb?.height?.toFixed(0)}, feed y=${fb?.y?.toFixed(0)}`);
await page.setViewportSize({ width: 1280, height: 800 });

// 7. Reconnect via real network drop → backoff → recovery
await ctx.setOffline(true);
const reconnecting = await page.waitForFunction(() => /reconnect|disconnect|offline/i.test(document.getElementById('status')?.textContent || ''), { timeout: 15000 }).then(() => true).catch(() => false);
const reconnStatus = (await page.locator('#status').textContent()).trim();
ok('Reconnect: status enters backoff after drop', reconnecting, `status="${reconnStatus}"`);
await ctx.setOffline(false);
const recovered = await page.waitForFunction(() => document.getElementById('status')?.classList.contains('connected'), { timeout: 30000 }).then(() => true).catch(() => false);
ok('Reconnect: recovers to Live after network returns', recovered, `status="${(await page.locator('#status').textContent()).trim()}"`);

// 8. Console cleanliness (ignore dev-only noise: vite HMR socket, vercel insights, network-abort from the offline test)
const realConsoleErrors = consoleErrors.filter((e) =>
  !/websocket|pumpportal|failed to fetch|net::|ERR_INTERNET_DISCONNECTED|_vercel\/insights|\[vite\]|status of 4\d\d|status of 5\d\d/i.test(e));
const realPageErrors = pageErrors.filter((e) => !/WebSocket closed without opened/i.test(e));
ok('No unexpected console errors', realConsoleErrors.length === 0, realConsoleErrors.slice(0, 3).join(' | '));
ok('No uncaught page errors', realPageErrors.length === 0, realPageErrors.slice(0, 3).join(' | '));

await browser.close();
const failed = results.filter((r) => !r.c);
console.log(`\n=== ${results.length - failed.length}/${results.length} checks passed ===`);
process.exit(failed.length ? 1 : 0);
