// /coins — markets index, adopted from the cryptocurrency.cv markets page:
// global stats bar (market cap, volume, dominance, Fear & Greed, active coins),
// a sortable top-coins table with 7d sparklines, a search type-ahead, and
// load-more pagination. Every row links to the rich /coin/:id detail page.

import {
	formatUsd,
	formatPrice,
	formatPercent,
	escapeHtml as esc,
} from './shared/coin-format.js';

const $ = (id) => document.getElementById(id);

async function getJson(url) {
	const res = await fetch(url, { headers: { accept: 'application/json' } });
	if (!res.ok) {
		const err = new Error(`fetch ${url} → ${res.status}`);
		err.status = res.status;
		throw err;
	}
	return res.json();
}

// ── Global stats bar ────────────────────────────────────────────────────────

const ICONS = {
	trend:
		'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>',
	bars: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/></svg>',
	pie: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/></svg>',
	coins:
		'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/><path d="m16.71 13.88.7.71-2.82 2.82"/></svg>',
	gauge:
		'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/></svg>',
	activity:
		'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>',
};

function statCard({ label, value, delta, deltaClass, icon }) {
	return `
		<div class="cv-stat-card">
			<div style="min-width:0">
				<p class="label">${esc(label)}</p>
				<p class="value cv-mono">${esc(value)}</p>
				${delta ? `<p class="delta ${deltaClass || ''}">${esc(delta)}</p>` : ''}
			</div>
			<span class="icon" aria-hidden="true">${ICONS[icon] || ''}</span>
		</div>`;
}

// Fear & Greed tone thresholds mirror the source design.
function fgClass(v) {
	if (v == null) return '';
	if (v <= 25) return 'cv-down';
	if (v <= 55) return '';
	return 'cv-up';
}

async function loadStats() {
	const el = $('cv-stats');
	el.innerHTML =
		'<div style="display:grid;gap:1rem;grid-template-columns:repeat(auto-fit,minmax(170px,1fr))">' +
		Array.from({ length: 6 }, () => '<div class="cv-skel" style="height:6rem"></div>').join('') +
		'</div>';
	try {
		const { market, fear_greed } = await getJson('/api/coin/global');
		const cards = [];
		if (market) {
			cards.push(
				statCard({
					label: 'Total Market Cap',
					value: formatUsd(market.market_cap_usd),
					delta:
						market.market_cap_change_pct_24h != null
							? formatPercent(market.market_cap_change_pct_24h)
							: null,
					deltaClass: (market.market_cap_change_pct_24h ?? 0) >= 0 ? 'cv-up' : 'cv-down',
					icon: 'trend',
				}),
				statCard({ label: '24h Volume', value: formatUsd(market.volume_24h_usd), icon: 'bars' }),
			);
			for (const [i, d] of (market.dominance || []).entries()) {
				cards.push(
					statCard({
						label: `${d.symbol} Dominance`,
						value: `${d.pct.toFixed(1)}%`,
						icon: i === 0 ? 'pie' : 'coins',
					}),
				);
			}
		}
		if (fear_greed) {
			cards.push(
				statCard({
					label: 'Fear & Greed',
					value: String(fear_greed.value),
					delta: fear_greed.label || null,
					deltaClass: fgClass(fear_greed.value),
					icon: 'gauge',
				}),
			);
		}
		if (market?.active_coins != null) {
			cards.push(
				statCard({
					label: 'Active Coins',
					value: market.active_coins.toLocaleString('en-US'),
					icon: 'activity',
				}),
			);
		}
		el.innerHTML = cards.length
			? `<div style="display:grid;gap:1rem;grid-template-columns:repeat(auto-fit,minmax(170px,1fr))">${cards.join('')}</div>`
			: '';
	} catch {
		el.innerHTML = ''; // Stats bar is an enhancement — the table is the page.
	}
}

// ── Market table ────────────────────────────────────────────────────────────

const COLUMNS = [
	{ key: 'rank', label: '#', left: true, hide: 'hide-sm', num: true },
	{ key: 'name', label: 'Coin', left: true },
	{ key: 'price', label: 'Price', num: true },
	{ key: 'change_24h', label: '24h %', num: true },
	{ key: 'change_7d', label: '7d %', hide: 'hide-md', num: true },
	{ key: 'market_cap', label: 'Mkt Cap', hide: 'hide-lg', num: true },
	{ key: 'volume_24h', label: 'Vol (24h)', hide: 'hide-lg', num: true },
];

const state = { coins: [], sortKey: 'rank', sortDir: 'asc', page: 1, loadingMore: false };

function sparkline(prices) {
	if (!prices || prices.length < 2) return '';
	const min = Math.min(...prices);
	const max = Math.max(...prices);
	const range = max - min || 1;
	const w = 120;
	const h = 32;
	const pts = prices
		.map((p, i) => `${((i / (prices.length - 1)) * w).toFixed(1)},${(h - ((p - min) / range) * h).toFixed(1)}`)
		.join(' ');
	const up = prices[prices.length - 1] >= prices[0];
	return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true" style="display:inline-block"><polyline points="${pts}" fill="none" stroke="${up ? 'var(--cv-chart-green)' : 'var(--cv-chart-red)'}" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
}

function pctCell(v, extraClass = '') {
	if (v == null) return `<td class="pct dim ${extraClass}">—</td>`;
	const up = v >= 0;
	return `<td class="pct ${up ? 'cv-up' : 'cv-down'} ${extraClass}"><span aria-hidden="true">${up ? '▲' : '▼'}</span>${esc(formatPercent(v))}</td>`;
}

function sortValue(c, key) {
	if (key === 'name') return (c.name || '').toLowerCase();
	if (key === 'rank') return c.rank ?? Infinity;
	return c[key] ?? 0;
}

function sortedCoins() {
	const copy = [...state.coins];
	const { sortKey, sortDir } = state;
	copy.sort((a, b) => {
		const va = sortValue(a, sortKey);
		const vb = sortValue(b, sortKey);
		const cmp = typeof va === 'string' ? va.localeCompare(vb) : va - vb;
		return sortDir === 'asc' ? cmp : -cmp;
	});
	return copy;
}

function renderTable() {
	const el = $('cv-market');
	if (!state.coins.length) {
		el.innerHTML =
			'<div class="cv-empty">Market data is temporarily unavailable. Please try again shortly.</div>';
		return;
	}

	const head = COLUMNS.map((col) => {
		const active = col.key === state.sortKey;
		const arrow = active ? (state.sortDir === 'asc' ? '↑' : '↓') : '↕';
		return `<th scope="col" tabindex="0" data-key="${col.key}" class="${col.left ? 'left' : ''} ${col.hide || ''}"${active ? ` aria-sort="${state.sortDir === 'asc' ? 'ascending' : 'descending'}"` : ''}>${esc(col.label)}<span class="arrow" aria-hidden="true">${arrow}</span></th>`;
	}).join('');

	const rows = sortedCoins()
		.map((c) => {
			const href = `/coin/${encodeURIComponent(c.id)}`;
			return `
			<tr data-href="${esc(href)}">
				<td class="rank hide-sm cv-mono">${c.rank ?? '—'}</td>
				<td class="left name-cell"><a href="${esc(href)}"><span class="inner">
					${c.image ? `<img src="${esc(c.image)}" alt="" loading="lazy" width="24" height="24" data-no-dark-filter />` : ''}
					<span class="nm">${esc(c.name)}</span>
					<span class="sym">${esc(c.symbol)}</span>
				</span></a></td>
				<td class="price">${esc(formatPrice(c.price))}</td>
				${pctCell(c.change_24h)}
				${pctCell(c.change_7d, 'hide-md')}
				<td class="dim hide-lg">${esc(formatUsd(c.market_cap))}</td>
				<td class="dim hide-lg">${esc(formatUsd(c.volume_24h))}</td>
				<td class="hide-xl">${sparkline(c.sparkline)}</td>
			</tr>`;
		})
		.join('');

	el.innerHTML = `
		<div class="cv-table-wrap">
			<table class="cv-table">
				<thead><tr>${head}<th class="hide-xl" aria-hidden="true">7d Chart</th></tr></thead>
				<tbody>${rows}</tbody>
			</table>
		</div>
		<button type="button" class="cv-load-more" id="cv-load-more"${state.loadingMore ? ' disabled' : ''}>
			${state.loadingMore ? 'Loading…' : 'Load more coins'}
		</button>`;

	el.querySelectorAll('th[data-key]').forEach((th) => {
		const activate = () => {
			const key = th.dataset.key;
			if (key === state.sortKey) {
				state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
			} else {
				state.sortKey = key;
				state.sortDir = key === 'name' || key === 'rank' ? 'asc' : 'desc';
			}
			renderTable();
		};
		th.addEventListener('click', activate);
		th.addEventListener('keydown', (e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				activate();
			}
		});
	});

	// Whole row navigates; the name link inside stays a real anchor for
	// middle-click / keyboard users.
	el.querySelectorAll('tr[data-href]').forEach((tr) => {
		tr.addEventListener('click', (e) => {
			if (e.target.closest('a')) return;
			location.href = tr.dataset.href;
		});
	});

	$('cv-load-more')?.addEventListener('click', loadMore);
}

async function loadCoins() {
	const el = $('cv-market');
	el.innerHTML =
		'<div class="cv-table-wrap" style="padding:0.75rem">' +
		Array.from({ length: 12 }, () => '<div class="cv-skel" style="height:2.5rem;margin:0.375rem 0"></div>').join('') +
		'</div>';
	try {
		const { coins } = await getJson('/api/coin/markets?page=1&per_page=100');
		state.coins = coins;
		state.page = 1;
	} catch {
		state.coins = [];
	}
	renderTable();
}

async function loadMore() {
	if (state.loadingMore) return;
	state.loadingMore = true;
	renderTable();
	try {
		const { coins } = await getJson(`/api/coin/markets?page=${state.page + 1}&per_page=100`);
		const seen = new Set(state.coins.map((c) => c.id));
		state.coins.push(...coins.filter((c) => !seen.has(c.id)));
		state.page += 1;
	} catch {
		// keep what we have; button re-enables for a retry
	}
	state.loadingMore = false;
	renderTable();
}

// ── Search type-ahead ───────────────────────────────────────────────────────

function wireSearch() {
	const input = $('cv-search-input');
	const pop = $('cv-search-pop');
	if (!input || !pop) return;
	let timer = null;
	let items = [];
	let active = -1;
	let lastQuery = '';

	function close() {
		pop.hidden = true;
		input.setAttribute('aria-expanded', 'false');
		active = -1;
	}

	function renderPop() {
		if (!items.length) {
			pop.innerHTML = `<div class="none">No coins match “${esc(lastQuery)}”.</div>`;
		} else {
			pop.innerHTML = items
				.map(
					(c, i) => `
				<a href="/coin/${encodeURIComponent(c.id)}" role="option" data-active="${i === active ? 1 : 0}" aria-selected="${i === active}">
					${c.thumb ? `<img src="${esc(c.thumb)}" alt="" width="20" height="20" data-no-dark-filter />` : ''}
					<span>${esc(c.name)}</span>
					<span class="sym">${esc(c.symbol)}</span>
					${c.rank != null ? `<span class="rk">#${c.rank}</span>` : ''}
				</a>`,
				)
				.join('');
		}
		pop.hidden = false;
		input.setAttribute('aria-expanded', 'true');
	}

	input.addEventListener('input', () => {
		clearTimeout(timer);
		const q = input.value.trim();
		if (!q) {
			close();
			return;
		}
		timer = setTimeout(async () => {
			try {
				const { coins } = await getJson(`/api/coin/markets?q=${encodeURIComponent(q)}`);
				lastQuery = q;
				items = coins;
				active = -1;
				renderPop();
			} catch {
				close();
			}
		}, 250);
	});

	input.addEventListener('keydown', (e) => {
		if (pop.hidden) return;
		if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
			e.preventDefault();
			const dir = e.key === 'ArrowDown' ? 1 : -1;
			active = (active + dir + items.length) % Math.max(items.length, 1);
			renderPop();
		} else if (e.key === 'Enter' && active >= 0 && items[active]) {
			e.preventDefault();
			location.href = `/coin/${encodeURIComponent(items[active].id)}`;
		} else if (e.key === 'Escape') {
			close();
		}
	});

	document.addEventListener('click', (e) => {
		if (!e.target.closest('#cv-search')) close();
	});
}

// ── Boot ────────────────────────────────────────────────────────────────────

loadStats();
loadCoins();
wireSearch();
