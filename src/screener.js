// /screener — client-side token screener over the live top-250 markets.
// Loads /api/coin/markets?page=1&per_page=250 once, then filters and sorts
// entirely in the browser: text search, gainers/losers, market-cap and volume
// floors, and click-to-sort columns reusing the shared cv-table pattern from
// coins-index.js. Every row links to the rich /coin/:id detail page.

import { formatUsd, formatPrice, formatPercent, escapeHtml as esc } from './shared/coin-format.js';

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

// ── State ─────────────────────────────────────────────────────────────────────

const COLUMNS = [
	{ key: 'rank', label: '#', left: true, hide: 'hide-sm', num: true },
	{ key: 'name', label: 'Coin', left: true },
	{ key: 'price', label: 'Price', num: true },
	{ key: 'change_24h', label: '24h %', num: true },
	{ key: 'change_7d', label: '7d %', hide: 'hide-md', num: true },
	{ key: 'market_cap', label: 'Mkt Cap', hide: 'hide-lg', num: true },
	{ key: 'volume_24h', label: 'Vol (24h)', hide: 'hide-lg', num: true },
];

const state = {
	coins: [],
	loaded: false,
	error: false,
	sortKey: 'rank',
	sortDir: 'asc',
	q: '',
	dir: 'all', // all | gainers | losers
	minMcap: 0,
	minVol: 0,
};

// ── Filtering + sorting ────────────────────────────────────────────────────────

function filtered() {
	const q = state.q.toLowerCase();
	return state.coins.filter((c) => {
		if (q && !`${c.name} ${c.symbol}`.toLowerCase().includes(q)) return false;
		if (state.dir === 'gainers' && !((c.change_24h ?? 0) > 0)) return false;
		if (state.dir === 'losers' && !((c.change_24h ?? 0) < 0)) return false;
		if (state.minMcap && (c.market_cap ?? 0) < state.minMcap) return false;
		if (state.minVol && (c.volume_24h ?? 0) < state.minVol) return false;
		return true;
	});
}

function sortValue(c, key) {
	if (key === 'name') return (c.name || '').toLowerCase();
	if (key === 'rank') return c.rank ?? Infinity;
	return c[key] ?? -Infinity;
}

function sorted(rows) {
	const { sortKey, sortDir } = state;
	return [...rows].sort((a, b) => {
		const va = sortValue(a, sortKey);
		const vb = sortValue(b, sortKey);
		const cmp = typeof va === 'string' ? va.localeCompare(vb) : va - vb;
		return sortDir === 'asc' ? cmp : -cmp;
	});
}

// ── Rendering ─────────────────────────────────────────────────────────────────

function pctCell(v, extraClass = '') {
	if (v == null) return `<td class="pct dim ${extraClass}">—</td>`;
	const up = v >= 0;
	return `<td class="pct ${up ? 'cv-up' : 'cv-down'} ${extraClass}"><span aria-hidden="true">${up ? '▲' : '▼'}</span>${esc(formatPercent(v))}</td>`;
}

function updateCount(shown) {
	const el = $('scr-count');
	if (!el) return;
	if (!state.loaded) {
		el.textContent = '';
		return;
	}
	el.textContent = `${shown.toLocaleString('en-US')} of ${state.coins.length.toLocaleString('en-US')} coins`;
}

function renderTable() {
	const el = $('scr-table');

	if (state.error) {
		el.innerHTML =
			'<div class="cv-empty">Market data is temporarily unavailable. Please try again shortly.</div>';
		updateCount(0);
		return;
	}
	if (!state.loaded) return; // skeleton already on screen

	const rows = sorted(filtered());
	updateCount(rows.length);

	if (!rows.length) {
		el.innerHTML =
			'<div class="cv-empty">No coins match these filters. Try widening your market-cap or volume floor, or <button type="button" class="scr-empty-reset" id="scr-empty-reset">reset all filters</button>.</div>';
		$('scr-empty-reset')?.addEventListener('click', resetFilters);
		return;
	}

	const head = COLUMNS.map((col) => {
		const active = col.key === state.sortKey;
		const arrow = active ? (state.sortDir === 'asc' ? '↑' : '↓') : '↕';
		return `<th scope="col" tabindex="0" data-key="${col.key}" class="${col.left ? 'left' : ''} ${col.hide || ''}"${active ? ` aria-sort="${state.sortDir === 'asc' ? 'ascending' : 'descending'}"` : ''}>${esc(col.label)}<span class="arrow" aria-hidden="true">${arrow}</span></th>`;
	}).join('');

	const body = rows
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
			</tr>`;
		})
		.join('');

	el.innerHTML = `
		<div class="cv-table-wrap">
			<table class="cv-table">
				<thead><tr>${head}</tr></thead>
				<tbody>${body}</tbody>
			</table>
		</div>`;

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

	el.querySelectorAll('tr[data-href]').forEach((tr) => {
		tr.addEventListener('click', (e) => {
			if (e.target.closest('a')) return;
			location.href = tr.dataset.href;
		});
	});
}

// ── Controls ──────────────────────────────────────────────────────────────────

function resetFilters() {
	state.q = '';
	state.dir = 'all';
	state.minMcap = 0;
	state.minVol = 0;
	state.sortKey = 'rank';
	state.sortDir = 'asc';
	$('scr-search-input').value = '';
	$('scr-mcap').value = '0';
	$('scr-vol').value = '0';
	$('scr-dir')
		.querySelectorAll('button')
		.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.dir === 'all')));
	renderTable();
}

function wireControls() {
	const input = $('scr-search-input');
	let timer = null;
	input.addEventListener('input', () => {
		clearTimeout(timer);
		timer = setTimeout(() => {
			state.q = input.value.trim();
			renderTable();
		}, 200);
	});

	$('scr-dir')
		.querySelectorAll('button')
		.forEach((btn) => {
			btn.addEventListener('click', () => {
				state.dir = btn.dataset.dir;
				$('scr-dir')
					.querySelectorAll('button')
					.forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
				renderTable();
			});
		});

	$('scr-mcap').addEventListener('change', (e) => {
		state.minMcap = Number(e.target.value) || 0;
		renderTable();
	});
	$('scr-vol').addEventListener('change', (e) => {
		state.minVol = Number(e.target.value) || 0;
		renderTable();
	});
	$('scr-reset').addEventListener('click', resetFilters);
}

// ── Load ──────────────────────────────────────────────────────────────────────

async function load() {
	const el = $('scr-table');
	el.innerHTML =
		'<div class="cv-table-wrap" style="padding:0.75rem">' +
		Array.from(
			{ length: 14 },
			() => '<div class="cv-skel" style="height:2.5rem;margin:0.375rem 0"></div>',
		).join('') +
		'</div>';
	try {
		const { coins } = await getJson('/api/coin/markets?page=1&per_page=250');
		state.coins = Array.isArray(coins) ? coins : [];
		state.loaded = true;
		$('scr-updated').textContent = `Updated ${new Date().toLocaleTimeString('en-US')}`;
	} catch {
		state.error = true;
		$('scr-updated').textContent = '';
	}
	renderTable();
}

wireControls();
load();
