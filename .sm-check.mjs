import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
const errors = [], warns = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); if (m.type() === 'warning') warns.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
await page.goto('http://localhost:3003/smart-money', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(1500);

const stats = await page.evaluate(() => ({
  proven: document.getElementById('stProven').textContent,
  winrate: document.getElementById('stWinRate').textContent,
  capital: document.getElementById('stCapital').textContent,
  coins: document.getElementById('stCoins').textContent,
  ctWallets: document.getElementById('ctWallets').textContent,
  walletRows: document.querySelectorAll('#walletList .lrow').length,
  headCols: document.querySelectorAll('#walletHead th').length,
  distVisible: !document.getElementById('dist').hidden,
}));
console.log('STATS', JSON.stringify(stats));

await page.evaluate(() => document.querySelector('.tab[data-view="wallets"]').click());
await page.waitForTimeout(300);
await page.evaluate(() => document.querySelector('#walletHead th[data-sort="win"]').click());
await page.waitForTimeout(200);
console.log('AFTER WIN SORT', await page.evaluate(() => [...document.querySelectorAll('#walletList .lrow td.lstat')].slice(0,3).map(td=>td.textContent)));

await page.evaluate(() => document.querySelector('#walletLabel button[data-l="smart_money"]').click());
await page.waitForTimeout(200);
console.log('SMART_MONEY ROWS', await page.evaluate(() => document.querySelectorAll('#walletList .lrow').length));
await page.evaluate(() => document.querySelector('#walletLabel button[data-l="all"]').click());

await page.evaluate(() => { const r = document.querySelector('#walletList .lrow'); if (r) r.click(); });
await page.waitForTimeout(1300);
console.log('WALLET DRAWER', await page.evaluate(() => ({
  open: document.getElementById('drawer').classList.contains('open'),
  title: document.getElementById('drTitle').textContent,
  stats: document.querySelectorAll('#drBody .dr-stat').length,
  recent: document.querySelectorAll('#drBody .nwallet').length,
  hasCopy: !!document.querySelector('#drBody .copybtn'),
})));

const crossNav = await page.evaluate(() => { const c = document.querySelector('#drBody .nwallet[data-mint]'); if (c) { c.click(); return true; } return false; });
await page.waitForTimeout(1300);
console.log('CROSS NAV', crossNav, await page.evaluate(() => ({ back: document.getElementById('drBackBtn').classList.contains('show'), title: document.getElementById('drTitle').textContent })));
await page.evaluate(() => document.getElementById('drBackBtn').click());
await page.waitForTimeout(800);
console.log('AFTER BACK', await page.evaluate(() => document.getElementById('drTitle').textContent));
await page.evaluate(() => document.getElementById('drClose').click());

await page.evaluate(() => document.querySelector('.tab[data-view="feed"]').click());
await page.evaluate(() => document.querySelector('#feedFilter button[data-f="graduated"]').click());
await page.waitForTimeout(300);
console.log('GRADUATED FEED', await page.evaluate(() => document.getElementById('feedGrid').querySelector('.state') ? 'empty-state' : document.querySelectorAll('#feedGrid .coin').length + ' cards'));
await page.evaluate(() => document.querySelector('#feedFilter button[data-f="fresh"]').click());
await page.waitForTimeout(200);
console.log('FRESH EMPTY CTA', await page.evaluate(() => { const b = document.querySelector('#feedGrid .state .btn'); return b ? b.textContent.trim() : 'cards'; }));

await page.evaluate(() => document.querySelector('.tab[data-view="watchlist"]').click());
await page.waitForTimeout(500);
console.log('WATCHLIST', await page.evaluate(() => document.getElementById('watchGrid').textContent.slice(0, 50).trim()));

await page.screenshot({ path: '/tmp/claude-1000/-workspaces-three-ws/d2084531-cdf7-4764-ac91-c6d43645d958/scratchpad/wallets.png', fullPage: true });
console.log('ERRORS', JSON.stringify(errors));
console.log('WARNS', JSON.stringify(warns.slice(0,5)));
await browser.close();
