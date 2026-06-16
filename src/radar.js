// ════════════════════════════════════════════════════════════════════════════
// Coin Radar — live pump.fun launch intelligence.
//
// Renders the Coin Intelligence Engine feed (GET /api/pump/coin-intel): every
// coin observed in its first ~90s of trading, classified and risk-scored. The
// trader question this page answers at a glance: "organic, or a bundle/rug?"
//
// Data source is the ONLY one: /api/pump/coin-intel (radar list) and
// /api/pump/coin-intel?mint=<mint>&wallets=1 (single-coin detail). Every number
// traces to an observed on-chain trade — nothing here is synthesized. A signal
// the engine did not measure (e.g. fresh_wallet_ratio === null) renders as
// "not measured", never as 0.
// ════════════════════════════════════════════════════════════════════════════

const POLL_MS = 12000;
const DEFAULT_LIMIT = 60;

// ── watchlist helpers (same key as launch-detail.js, watchlist.js, launches.js, oracle.js) ──
const WATCH_KEY = 'ld_watchlist';
function isWatched(mint) {
	try { return JSON.parse(localStorage.getItem(WATCH_KEY) || '[]').includes(mint); } catch { return false; }
}
function toggleRadarWatch(mint) {
	try {
		const list = JSON.parse(localStorage.getItem(WATCH_KEY) || '[]');
		const idx = list.indexOf(mint);
		if (idx >= 0) list.splice(idx, 1); else list.unshift(mint);
		localStorage.setItem(WATCH_KEY, JSON.stringify(list.slice(0, 200)));
		return idx < 0;
	} catch { return false; }
}

const CATEGORIES = [
	'meme', 'tech', 'ai', 'culture', 'community',
	'political', 'news', 'animal', 'celebrity', 'utility', 'unknown',
];

const CATEGORY_LABEL = {
	meme: 'Meme', tech: 'Tech', ai: 'AI', culture: 'Culture',
	community: 'Community', political: 'Political', news: 'News',
	animal: 'Animal', celebrity: 'Celebrity', utility: 'Utility', unknown: 'Unknown',
};

// Risk-flag vocabulary → display label + severity. danger = act-with-caution,
// warn = worth noting. Unknown future flags fall back to a neutral warn pill.
const FLAG_META = {
	bundle_launch:     { label: 'Bundle launch',     tone: 'danger', tip: 'Many wallets bought in the same block — likely coordinated.' },
	dev_dumped:        { label: 'Dev dumped',        tone: 'danger', tip: 'The creator sold their position.' },
	single_whale:      { label: 'Single whale',      tone: 'danger', tip: 'One wallet holds an outsized share of supply.' },
	low_diversity:     { label: 'Low diversity',     tone: 'danger', tip: 'Few unique buyers — thin, concentrated participation.' },
	fresh_wallet_swarm:{ label: 'Fresh-wallet swarm',tone: 'danger', tip: 'A cluster of brand-new wallets bought together.' },
	sell_pressure:     { label: 'Sell pressure',     tone: 'warn',   tip: 'Sells are outpacing buys early.' },
	sniped:            { label: 'Sniped',            tone: 'warn',   tip: 'Snipers grabbed supply in the first moments.' },
};

// ── tiny DOM + format helpers ───────────────────────────────────────────────
const el = (tag, cls, text) => {
	const n = document.createElement(tag);
	if (cls) n.className = cls;
	if (text != null) n.textContent = text;
	return n;
};
const pct = (v) => (v == null ? null : Math.round(v * 100));
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const short = (s, head = 4, tail = 4) =>
	typeof s === 'string' && s.length > head + tail + 1 ? `${s.slice(0, head)}…${s.slice(-tail)}` : (s || '');

const fmtSol = (v) => {
	if (v == null || Number.isNaN(v)) return null;
	const abs = Math.abs(v);
	if (abs === 0) return '0';
	if (abs < 0.001) return v.toFixed(5);
	if (abs < 1) return v.toFixed(3);
	if (abs < 1000) return v.toFixed(2);
	return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
};
const fmtInt = (v) => (v == null ? '—' : Number(v).toLocaleString());

function timeAgo(ts) {
	if (!ts) return '';
	const ms = Date.parse(ts);
	if (Number.isNaN(ms)) return '';
	const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
	if (s < 60) return s + 's ago';
	const m = Math.floor(s / 60);
	if (m < 60) return m + 'm ago';
	const h = Math.floor(m / 60);
	if (h < 24) return h + 'h ago';
	return Math.floor(h / 24) + 'd ago';
}

function solscanToken(mint, network) {
	const base = `https://solscan.io/token/${encodeURIComponent(mint)}`;
	return network === 'devnet' ? `${base}?cluster=devnet` : base;
}
function solscanAccount(addr, network) {
	const base = `https://solscan.io/account/${encodeURIComponent(addr)}`;
	return network === 'devnet' ? `${base}?cluster=devnet` : base;
}

// Quality 0–100 → red→amber→green ramp. Null score → neutral grey.
function qualityColor(score) {
	if (score == null) return 'var(--ink-faint)';
	if (score >= 70) return 'var(--success)';
	if (score >= 40) return 'var(--warn)';
	return 'var(--danger)';
}
function qualityLabel(score) {
	if (score == null) return 'Unscored';
	if (score >= 70) return 'Healthy';
	if (score >= 40) return 'Mixed';
	return 'High risk';
}

// ── state ───────────────────────────────────────────────────────────────────
const state = {
	network: 'mainnet',
	category: null,        // null = all
	minQuality: 0,
	hideRisky: false,      // client-side: drop danger-flagged coins
	coins: [],
	seen: new Set(),       // mints already rendered (for enter animation)
	status: 'loading',     // loading | ready | empty | error
	lastUpdated: 0,
	pollTimer: null,
	inFlight: null,
};

let root = null;

// ── URL <-> state (shareable views) ─────────────────────────────────────────
function readUrl() {
	const p = new URLSearchParams(location.search);
	if (p.get('network') === 'devnet') state.network = 'devnet';
	const cat = p.get('category');
	if (cat && CATEGORIES.includes(cat)) state.category = cat;
	const mq = parseInt(p.get('min_quality'), 10);
	if (Number.isFinite(mq)) state.minQuality = Math.max(0, Math.min(100, mq));
	if (p.get('hide_risky') === '1') state.hideRisky = true;
}

function writeUrl() {
	const p = new URLSearchParams();
	if (state.network !== 'mainnet') p.set('network', state.network);
	if (state.category) p.set('category', state.category);
	if (state.minQuality > 0) p.set('min_quality', String(state.minQuality));
	if (state.hideRisky) p.set('hide_risky', '1');
	const qs = p.toString();
	const url = location.pathname + (qs ? '?' + qs : '');
	history.replaceState(null, '', url);
}

// ── data fetch ──────────────────────────────────────────────────────────────
function buildFeedUrl() {
	const p = new URLSearchParams();
	p.set('limit', String(DEFAULT_LIMIT));
	p.set('network', state.network);
	if (state.category) p.set('category', state.category);
	if (state.minQuality > 0) p.set('min_quality', String(state.minQuality));
	return '/api/pump/coin-intel?' + p.toString();
}

async function fetchFeed({ silent = false } = {}) {
	if (state.inFlight) state.inFlight.abort();
	const ctrl = new AbortController();
	state.inFlight = ctrl;
	if (!silent) {
		state.status = 'loading';
		render();
	}
	try {
		const r = await fetch(buildFeedUrl(), {
			headers: { accept: 'application/json' },
			signal: ctrl.signal,
		});
		if (!r.ok) throw new Error(`feed HTTP ${r.status}`);
		const data = await r.json();
		const coins = Array.isArray(data.coins) ? data.coins : [];
		state.coins = coins;
		state.lastUpdated = Date.now();
		state.status = coins.length ? 'ready' : 'empty';
		render();
	} catch (err) {
		if (err.name === 'AbortError') return;
		console.error('[radar] feed fetch failed:', err.message || err);
		// Keep previously rendered coins on a silent (poll) failure; only blank
		// out to the error state when we have nothing to show.
		if (!state.coins.length) {
			state.status = 'error';
			render();
		}
	} finally {
		state.inFlight = null;
	}
}

// ── polling (paused when tab hidden) ────────────────────────────────────────
function startPolling() {
	stopPolling();
	state.pollTimer = setInterval(() => {
		if (document.hidden) return;
		fetchFeed({ silent: true });
	}, POLL_MS);
}
function stopPolling() {
	if (state.pollTimer) { clearInterval(state.pollTimer); state.pollTimer = null; }
}

// ════════════════════════════════════════════════════════════════════════════
// RENDER
// ════════════════════════════════════════════════════════════════════════════
function render() {
	if (!root) return;
	root.innerHTML = '';
	root.append(renderToolbar());

	const body = el('div', 'radar-body');
	if (state.status === 'loading' && !state.coins.length) {
		body.append(renderSkeletonGrid());
	} else if (state.status === 'error') {
		body.append(renderErrorState());
	} else {
		const visible = applyClientFilters(state.coins);
		if (!visible.length) {
			body.append(state.status === 'empty' ? renderEmptyState() : renderNoMatchState());
		} else {
			body.append(renderGrid(visible));
		}
	}
	root.append(body);
	updateUpdatedLabel();
}

function applyClientFilters(coins) {
	if (!state.hideRisky) return coins;
	return coins.filter((c) => {
		const flags = c.risk_flags || [];
		return !flags.some((f) => (FLAG_META[f]?.tone ?? 'warn') === 'danger');
	});
}

// ── toolbar / filters ───────────────────────────────────────────────────────
function renderToolbar() {
	const bar = el('div', 'radar-toolbar');
	bar.setAttribute('role', 'region');
	bar.setAttribute('aria-label', 'Radar filters');

	// row 1: category chips
	const chips = el('div', 'radar-chips');
	chips.setAttribute('role', 'group');
	chips.setAttribute('aria-label', 'Filter by category');
	chips.append(chip('All', state.category === null, () => { state.category = null; onFilterChange(); }));
	for (const c of CATEGORIES) {
		chips.append(chip(CATEGORY_LABEL[c], state.category === c, () => {
			state.category = state.category === c ? null : c;
			onFilterChange();
		}));
	}

	// row 2: controls
	const controls = el('div', 'radar-controls');

	// min-quality slider
	const qWrap = el('div', 'radar-control radar-quality');
	const qLabel = el('label', 'radar-control-label');
	qLabel.htmlFor = 'radar-min-quality';
	qLabel.append(el('span', null, 'Min quality'));
	const qVal = el('span', 'radar-quality-val', state.minQuality === 0 ? 'Any' : String(state.minQuality));
	qLabel.append(qVal);
	const slider = el('input', 'radar-slider');
	slider.type = 'range';
	slider.id = 'radar-min-quality';
	slider.min = '0'; slider.max = '100'; slider.step = '5';
	slider.value = String(state.minQuality);
	slider.setAttribute('aria-valuetext', state.minQuality === 0 ? 'Any' : state.minQuality + ' of 100');
	slider.addEventListener('input', () => {
		state.minQuality = parseInt(slider.value, 10) || 0;
		qVal.textContent = state.minQuality === 0 ? 'Any' : String(state.minQuality);
		slider.setAttribute('aria-valuetext', state.minQuality === 0 ? 'Any' : state.minQuality + ' of 100');
	});
	// commit on release (avoid a fetch per tick)
	slider.addEventListener('change', () => onFilterChange());
	qWrap.append(qLabel, slider);

	// hide-risky toggle
	const toggle = el('button', 'radar-toggle');
	toggle.type = 'button';
	toggle.setAttribute('role', 'switch');
	toggle.setAttribute('aria-checked', String(state.hideRisky));
	toggle.append(el('span', 'radar-toggle-track'));
	toggle.append(el('span', 'radar-toggle-label', 'Hide flagged'));
	toggle.title = 'Hide coins with danger-level risk flags (bundle, dev-dump, whale, swarm)';
	toggle.addEventListener('click', () => {
		state.hideRisky = !state.hideRisky;
		toggle.setAttribute('aria-checked', String(state.hideRisky));
		writeUrl();
		render();
	});

	// network segmented control
	const netWrap = el('div', 'radar-control radar-network');
	netWrap.setAttribute('role', 'group');
	netWrap.setAttribute('aria-label', 'Network');
	for (const n of ['mainnet', 'devnet']) {
		const b = el('button', 'radar-seg' + (state.network === n ? ' is-active' : ''), n === 'mainnet' ? 'Mainnet' : 'Devnet');
		b.type = 'button';
		b.setAttribute('aria-pressed', String(state.network === n));
		b.addEventListener('click', () => {
			if (state.network === n) return;
			state.network = n;
			state.coins = [];
			state.seen.clear();
			onFilterChange();
		});
		netWrap.append(b);
	}

	// updated indicator
	const updated = el('div', 'radar-updated');
	updated.id = 'radar-updated';
	updated.setAttribute('aria-live', 'polite');
	const dot = el('span', 'radar-live-dot');
	dot.setAttribute('aria-hidden', 'true');
	updated.append(dot, el('span', 'radar-updated-text', 'Connecting…'));

	controls.append(qWrap, toggle, netWrap, updated);
	bar.append(chips, controls);
	return bar;
}

function chip(label, active, onClick) {
	const b = el('button', 'radar-chip' + (active ? ' is-active' : ''), label);
	b.type = 'button';
	b.setAttribute('aria-pressed', String(active));
	b.addEventListener('click', onClick);
	return b;
}

function onFilterChange() {
	writeUrl();
	fetchFeed();
}

function updateUpdatedLabel() {
	const node = root && root.querySelector('#radar-updated .radar-updated-text');
	const dot = root && root.querySelector('#radar-updated .radar-live-dot');
	if (!node) return;
	if (state.status === 'error') {
		node.textContent = 'Reconnecting…';
		if (dot) dot.classList.add('is-stale');
		return;
	}
	if (!state.lastUpdated) {
		node.textContent = 'Live';
		return;
	}
	if (dot) dot.classList.remove('is-stale');
	const s = Math.floor((Date.now() - state.lastUpdated) / 1000);
	node.textContent = s < 5 ? 'Live · just now' : `Live · updated ${s}s ago`;
}

// ── grids ───────────────────────────────────────────────────────────────────
function renderGrid(coins) {
	const grid = el('div', 'radar-grid');
	grid.setAttribute('role', 'list');
	for (const coin of coins) grid.append(renderCard(coin));
	return grid;
}

function renderSkeletonGrid() {
	const grid = el('div', 'radar-grid', null);
	grid.setAttribute('aria-hidden', 'true');
	for (let i = 0; i < 8; i++) {
		const c = el('div', 'radar-card radar-card--skeleton');
		c.append(
			el('div', 'sk sk-row'),
			el('div', 'sk sk-ring'),
			el('div', 'sk sk-bar'),
			el('div', 'sk sk-bar w70'),
			el('div', 'sk sk-pills'),
		);
		grid.append(c);
	}
	return grid;
}

function renderCard(coin) {
	const isNew = !state.seen.has(coin.mint);
	state.seen.add(coin.mint);

	const card = el('article', 'radar-card' + (isNew ? ' is-enter' : ''));
	card.setAttribute('role', 'listitem');
	card.tabIndex = 0;
	const label = `${coin.name || coin.symbol || 'coin'} — quality ${coin.quality_score ?? 'unscored'}, ${qualityLabel(coin.quality_score)}. Open details.`;
	card.setAttribute('aria-label', label);
	const open = () => openDrawer(coin.mint);
	card.addEventListener('click', (e) => {
		if (e.target.closest('a')) return; // let links work
		open();
	});
	card.addEventListener('keydown', (e) => {
		if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
	});

	// ── header: identity + category ──
	const head = el('div', 'rc-head');
	const img = el('img', 'rc-img');
	img.loading = 'lazy';
	img.decoding = 'async';
	img.width = 40; img.height = 40;
	img.alt = '';
	const seed = coin.symbol || coin.name || coin.mint || 'coin';
	img.src = coin.image_uri && /^https?:\/\//i.test(coin.image_uri)
		? `/api/img?url=${encodeURIComponent(coin.image_uri)}&seed=${encodeURIComponent(seed)}`
		: `/api/img?seed=${encodeURIComponent(seed)}`;
	img.addEventListener('error', () => { img.src = `/api/img?seed=${encodeURIComponent(seed)}`; }, { once: true });

	const idCol = el('div', 'rc-id');
	const nameEl = el('div', 'rc-name', coin.name || 'Unnamed');
	nameEl.title = coin.name || '';
	const symEl = el('div', 'rc-sym');
	symEl.append(el('span', 'rc-ticker', coin.symbol ? '$' + coin.symbol : '—'));
	symEl.append(el('span', 'rc-age', timeAgo(coin.first_seen_at)));
	idCol.append(nameEl, symEl);

	const cat = el('span', 'rc-cat', CATEGORY_LABEL[coin.category] || 'Unknown');
	cat.title = coin.classify_source
		? `Classified by ${coin.classify_source}${coin.classify_confidence != null ? ` · ${pct(coin.classify_confidence)}% confidence` : ''}`
		: 'Category';

	head.append(img, idCol, cat);

	// ── quality ring + organic/bundle ──
	const scoreRow = el('div', 'rc-score');
	scoreRow.append(renderRing(coin.quality_score));
	scoreRow.append(renderOrganicBundle(coin));
	card.append(head, scoreRow);

	// ── narrative ──
	if (coin.narrative) {
		const n = el('p', 'rc-narrative', coin.narrative);
		n.title = coin.narrative;
		card.append(n);
	}

	// ── risk flags ──
	const flags = (coin.risk_flags || []);
	if (flags.length) {
		const pills = el('div', 'rc-flags');
		for (const f of flags) {
			const meta = FLAG_META[f] || { label: f.replace(/_/g, ' '), tone: 'warn', tip: '' };
			const p = el('span', `rc-flag rc-flag--${meta.tone}`, meta.label);
			if (meta.tip) p.title = meta.tip;
			pills.append(p);
		}
		card.append(pills);
	} else {
		const clean = el('div', 'rc-flags');
		clean.append(el('span', 'rc-flag rc-flag--clean', 'No risk flags'));
		card.append(clean);
	}

	// ── key stats ──
	const stats = el('div', 'rc-stats');
	stats.append(stat('Buyers', fmtInt(coin.unique_buyers)));
	stats.append(stat('Dev buy', coin.dev_buy_sol != null ? fmtSol(coin.dev_buy_sol) + ' ◎' : '—'));
	stats.append(stat('Buy vol', coin.buy_volume_sol != null ? fmtSol(coin.buy_volume_sol) + ' ◎' : '—'));
	stats.append(stat('Sell vol', coin.sell_volume_sol != null ? fmtSol(coin.sell_volume_sol) + ' ◎' : '—'));
	card.append(stats);

	// ── footer links ──
	const foot = el('div', 'rc-foot');
	const scan = el('a', 'rc-link', 'Solscan');
	scan.href = solscanToken(coin.mint, coin.network);
	scan.target = '_blank'; scan.rel = 'noopener noreferrer';
	scan.addEventListener('click', (e) => e.stopPropagation());
	const detail = el('button', 'rc-detail', 'Full intel →');
	detail.type = 'button';
	detail.addEventListener('click', (e) => { e.stopPropagation(); open(); });

	const watched = isWatched(coin.mint);
	const watchBtn = el('button', `rc-watch${watched ? ' rc-watched' : ''}`, watched ? '★' : '☆');
	watchBtn.type = 'button';
	watchBtn.setAttribute('aria-label', watched ? 'Remove from watchlist' : 'Add to watchlist');
	watchBtn.setAttribute('aria-pressed', String(watched));
	watchBtn.title = watched ? 'Remove from watchlist' : 'Add to watchlist';
	watchBtn.addEventListener('click', (e) => {
		e.stopPropagation();
		const nowWatched = toggleRadarWatch(coin.mint);
		watchBtn.textContent = nowWatched ? '★' : '☆';
		watchBtn.classList.toggle('rc-watched', nowWatched);
		watchBtn.setAttribute('aria-pressed', String(nowWatched));
		watchBtn.setAttribute('aria-label', nowWatched ? 'Remove from watchlist' : 'Add to watchlist');
		watchBtn.title = nowWatched ? 'Remove from watchlist' : 'Add to watchlist';
	});

	foot.append(scan, detail, watchBtn);
	card.append(foot);

	if (isNew) requestAnimationFrame(() => card.classList.remove('is-enter'));
	return card;
}

function stat(label, value) {
	const s = el('div', 'rc-stat');
	s.append(el('span', 'rc-stat-label', label));
	s.append(el('span', 'rc-stat-value', value));
	return s;
}

// SVG quality ring, 0–100, color-graded.
function renderRing(score) {
	const NS = 'http://www.w3.org/2000/svg';
	const size = 64, stroke = 6, r = (size - stroke) / 2, c = 2 * Math.PI * r;
	const has = score != null;
	const frac = has ? clamp01(score / 100) : 0;

	const wrap = el('div', 'rc-ring');
	const svg = document.createElementNS(NS, 'svg');
	svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
	svg.setAttribute('class', 'rc-ring-svg');
	svg.setAttribute('aria-hidden', 'true');

	const track = document.createElementNS(NS, 'circle');
	track.setAttribute('cx', size / 2); track.setAttribute('cy', size / 2); track.setAttribute('r', r);
	track.setAttribute('class', 'rc-ring-track');
	track.setAttribute('stroke-width', stroke); track.setAttribute('fill', 'none');

	const arc = document.createElementNS(NS, 'circle');
	arc.setAttribute('cx', size / 2); arc.setAttribute('cy', size / 2); arc.setAttribute('r', r);
	arc.setAttribute('class', 'rc-ring-arc');
	arc.setAttribute('fill', 'none');
	arc.setAttribute('stroke', qualityColor(score));
	arc.setAttribute('stroke-width', stroke);
	arc.setAttribute('stroke-linecap', 'round');
	arc.setAttribute('stroke-dasharray', String(c));
	arc.setAttribute('stroke-dashoffset', String(c * (1 - frac)));
	arc.setAttribute('transform', `rotate(-90 ${size / 2} ${size / 2})`);

	svg.append(track, arc);

	const val = el('div', 'rc-ring-val');
	val.style.color = qualityColor(score);
	val.append(el('span', 'rc-ring-num', has ? String(score) : '—'));
	wrap.append(svg, val);

	const cap = el('div', 'rc-ring-cap', qualityLabel(score));
	cap.style.color = qualityColor(score);

	const col = el('div', 'rc-ring-col');
	col.append(wrap, cap);
	return col;
}

function renderOrganicBundle(coin) {
	const o = coin.organic_score, b = coin.bundle_score;
	const wrap = el('div', 'rc-ob');

	const readout = el('div', 'rc-ob-readout');
	readout.append(obTag('Organic', pct(o), 'organic'));
	readout.append(obTag('Bundle', pct(b), 'bundle'));
	wrap.append(readout);

	// dual bar — only the measured side fills; an unmeasured side stays empty.
	const bar = el('div', 'rc-ob-bar');
	bar.setAttribute('aria-hidden', 'true');
	const oFill = el('span', 'rc-ob-fill rc-ob-fill--organic');
	oFill.style.width = (o != null ? clamp01(o) * 100 : 0) + '%';
	const bFill = el('span', 'rc-ob-fill rc-ob-fill--bundle');
	bFill.style.width = (b != null ? clamp01(b) * 100 : 0) + '%';
	bar.append(oFill, bFill);
	wrap.append(bar);
	return wrap;
}

function obTag(label, p, kind) {
	const t = el('span', `rc-ob-tag rc-ob-tag--${kind}`);
	t.append(el('span', 'rc-ob-tag-label', label));
	t.append(el('span', 'rc-ob-tag-val', p == null ? 'n/m' : p + '%'));
	if (p == null) t.title = `${label} score not measured`;
	return t;
}

// ── states ──────────────────────────────────────────────────────────────────
function renderEmptyState() {
	const box = el('div', 'radar-state radar-empty');
	box.append(radarGlyph());
	box.append(el('h2', 'radar-state-title', 'Radar is clear — waiting for the next launch'));
	const p = el('p', 'radar-state-text');
	p.textContent = state.network === 'devnet'
		? 'No devnet coins have been observed yet. The Coin Intelligence Engine watches each new pump.fun launch for its first ~90 seconds, then scores it. Switch to mainnet for the live feed.'
		: 'No coins in the observation window right now. The Coin Intelligence Engine watches every new pump.fun launch for its first ~90 seconds of trading, derives its bundle / organic / concentration signals, classifies it, and posts it here. New cards appear automatically the moment a launch finishes its observation window.';
	box.append(p);

	const actions = el('div', 'radar-state-actions');
	if (state.network !== 'mainnet') {
		const toMain = el('button', 'radar-btn', 'View mainnet');
		toMain.type = 'button';
		toMain.addEventListener('click', () => {
			state.network = 'mainnet'; state.coins = []; state.seen.clear(); onFilterChange();
		});
		actions.append(toMain);
	}
	const live = el('a', 'radar-btn radar-btn--ghost', 'See raw launches →');
	live.href = '/pump-live';
	actions.append(live);
	box.append(actions);

	const note = el('p', 'radar-state-note', 'This view refreshes every 12 seconds. It will populate itself — no need to reload.');
	box.append(note);
	return box;
}

function renderNoMatchState() {
	const box = el('div', 'radar-state radar-empty');
	box.append(radarGlyph());
	box.append(el('h2', 'radar-state-title', 'No coins match these filters'));
	box.append(el('p', 'radar-state-text', 'The radar has live coins, but none pass your current category, quality, or risk filters. Loosen them to see more.'));
	const actions = el('div', 'radar-state-actions');
	const reset = el('button', 'radar-btn', 'Reset filters');
	reset.type = 'button';
	reset.addEventListener('click', () => {
		state.category = null; state.minQuality = 0; state.hideRisky = false;
		onFilterChange();
		render();
	});
	actions.append(reset);
	box.append(actions);
	return box;
}

function renderErrorState() {
	const box = el('div', 'radar-state radar-error');
	box.setAttribute('role', 'alert');
	box.append(el('h2', 'radar-state-title', 'Could not reach the radar feed'));
	box.append(el('p', 'radar-state-text', 'The Coin Intelligence feed did not respond. This is usually temporary — the engine or network may be momentarily unavailable.'));
	const actions = el('div', 'radar-state-actions');
	const retry = el('button', 'radar-btn', 'Retry now');
	retry.type = 'button';
	retry.addEventListener('click', () => fetchFeed());
	actions.append(retry);
	box.append(actions);
	return box;
}

function radarGlyph() {
	const NS = 'http://www.w3.org/2000/svg';
	const svg = document.createElementNS(NS, 'svg');
	svg.setAttribute('viewBox', '0 0 120 120');
	svg.setAttribute('class', 'radar-glyph');
	svg.setAttribute('aria-hidden', 'true');
	for (const rr of [20, 36, 52]) {
		const ci = document.createElementNS(NS, 'circle');
		ci.setAttribute('cx', '60'); ci.setAttribute('cy', '60'); ci.setAttribute('r', String(rr));
		ci.setAttribute('class', 'radar-glyph-ring'); ci.setAttribute('fill', 'none');
		svg.append(ci);
	}
	const sweep = document.createElementNS(NS, 'path');
	sweep.setAttribute('d', 'M60 60 L60 8 A52 52 0 0 1 104 38 Z');
	sweep.setAttribute('class', 'radar-glyph-sweep');
	svg.append(sweep);
	const dot = document.createElementNS(NS, 'circle');
	dot.setAttribute('cx', '60'); dot.setAttribute('cy', '60'); dot.setAttribute('r', '3');
	dot.setAttribute('class', 'radar-glyph-dot');
	svg.append(dot);
	return svg;
}

// ════════════════════════════════════════════════════════════════════════════
// DETAIL DRAWER
// ════════════════════════════════════════════════════════════════════════════
let drawer = null;
let drawerAbort = null;
let lastFocused = null;

function ensureDrawer() {
	if (drawer) return drawer;
	const scrim = el('div', 'radar-drawer-scrim');
	scrim.id = 'radar-drawer';
	scrim.hidden = true;
	scrim.addEventListener('click', (e) => { if (e.target === scrim) closeDrawer(); });

	const panel = el('aside', 'radar-drawer-panel');
	panel.setAttribute('role', 'dialog');
	panel.setAttribute('aria-modal', 'true');
	panel.setAttribute('aria-label', 'Coin intelligence detail');
	panel.tabIndex = -1;
	scrim.append(panel);
	document.body.append(scrim);

	document.addEventListener('keydown', (e) => {
		if (scrim.hidden) return;
		if (e.key === 'Escape') { e.preventDefault(); closeDrawer(); }
		if (e.key === 'Tab') trapFocus(e, panel);
	});

	drawer = { scrim, panel };
	return drawer;
}

function trapFocus(e, panel) {
	const f = panel.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])');
	if (!f.length) return;
	const first = f[0], last = f[f.length - 1];
	if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
	else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

async function openDrawer(mint) {
	const { scrim, panel } = ensureDrawer();
	lastFocused = document.activeElement;
	scrim.hidden = false;
	document.body.classList.add('radar-no-scroll');
	requestAnimationFrame(() => scrim.classList.add('is-open'));

	panel.innerHTML = '';
	panel.append(drawerHeader('Loading intel…', null, null));
	const load = el('div', 'rd-loading');
	for (let i = 0; i < 5; i++) load.append(el('div', 'sk sk-bar'));
	panel.append(load);
	panel.focus();

	if (drawerAbort) drawerAbort.abort();
	drawerAbort = new AbortController();
	const net = state.network;
	try {
		const r = await fetch(`/api/pump/coin-intel?mint=${encodeURIComponent(mint)}&wallets=1&network=${net}`, {
			headers: { accept: 'application/json' },
			signal: drawerAbort.signal,
		});
		if (r.status === 404) { renderDrawerNotFound(panel, mint); return; }
		if (!r.ok) throw new Error(`detail HTTP ${r.status}`);
		const coin = await r.json();
		renderDrawerContent(panel, coin);
	} catch (err) {
		if (err.name === 'AbortError') return;
		console.error('[radar] detail fetch failed:', err.message || err);
		renderDrawerError(panel, mint);
	}
}

function closeDrawer() {
	if (!drawer) return;
	drawer.scrim.classList.remove('is-open');
	document.body.classList.remove('radar-no-scroll');
	if (drawerAbort) { drawerAbort.abort(); drawerAbort = null; }
	const scrim = drawer.scrim;
	const onEnd = () => { scrim.hidden = true; scrim.removeEventListener('transitionend', onEnd); };
	scrim.addEventListener('transitionend', onEnd);
	setTimeout(() => { if (!scrim.hidden) onEnd(); }, 320);
	if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus();
}

function drawerHeader(title, sub, coin) {
	const head = el('div', 'rd-head');
	const titleWrap = el('div', 'rd-head-id');
	if (coin) {
		const img = el('img', 'rd-img');
		img.width = 44; img.height = 44; img.alt = ''; img.loading = 'lazy';
		const seed = coin.symbol || coin.name || coin.mint || 'coin';
		img.src = coin.image_uri && /^https?:\/\//i.test(coin.image_uri)
			? `/api/img?url=${encodeURIComponent(coin.image_uri)}&seed=${encodeURIComponent(seed)}`
			: `/api/img?seed=${encodeURIComponent(seed)}`;
		img.addEventListener('error', () => { img.src = `/api/img?seed=${encodeURIComponent(seed)}`; }, { once: true });
		titleWrap.append(img);
	}
	const txt = el('div');
	txt.append(el('h2', 'rd-title', title));
	if (sub) txt.append(el('div', 'rd-sub', sub));
	titleWrap.append(txt);

	const close = el('button', 'rd-close');
	close.type = 'button';
	close.setAttribute('aria-label', 'Close detail');
	close.innerHTML = '<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 5l10 10M15 5L5 15"/></svg>';
	close.addEventListener('click', closeDrawer);

	head.append(titleWrap, close);
	return head;
}

function renderDrawerNotFound(panel, mint) {
	panel.innerHTML = '';
	panel.append(drawerHeader('Not observed', short(mint, 6, 6), null));
	const box = el('div', 'rd-section');
	box.append(el('p', 'radar-state-text', 'This coin has no intelligence record. It may have launched before the engine started watching, or be too old — the engine only retains coins it observed live.'));
	const scan = el('a', 'radar-btn radar-btn--ghost', 'View on Solscan →');
	scan.href = solscanToken(mint, state.network); scan.target = '_blank'; scan.rel = 'noopener noreferrer';
	box.append(scan);
	panel.append(box);
}

function renderDrawerError(panel, mint) {
	panel.innerHTML = '';
	panel.append(drawerHeader('Could not load intel', short(mint, 6, 6), null));
	const box = el('div', 'rd-section');
	box.setAttribute('role', 'alert');
	box.append(el('p', 'radar-state-text', 'The detail request failed. Try again in a moment.'));
	const retry = el('button', 'radar-btn', 'Retry');
	retry.type = 'button';
	retry.addEventListener('click', () => openDrawer(mint));
	box.append(retry);
	panel.append(box);
}

function renderDrawerContent(panel, coin) {
	panel.innerHTML = '';
	panel.append(drawerHeader(
		coin.name || 'Unnamed coin',
		`${coin.symbol ? '$' + coin.symbol + ' · ' : ''}${CATEGORY_LABEL[coin.category] || 'Unknown'} · observed ${coin.observation_seconds ?? '—'}s`,
		coin,
	));

	// headline: ring + organic/bundle + outcome
	const headline = el('div', 'rd-headline');
	headline.append(renderRing(coin.quality_score));
	headline.append(renderOrganicBundle(coin));
	panel.append(headline);

	if (coin.outcome && coin.outcome.outcome) panel.append(renderOutcome(coin.outcome));

	if (coin.narrative) {
		const sec = el('div', 'rd-section');
		sec.append(el('h3', 'rd-h3', 'Narrative'));
		sec.append(el('p', 'rd-narrative', coin.narrative));
		if (coin.classify_source) {
			sec.append(el('p', 'rd-meta', `Classified by ${coin.classify_source}${coin.classify_confidence != null ? ` · ${pct(coin.classify_confidence)}% confidence` : ''}`));
		}
		panel.append(sec);
	}

	// risk flags
	const flagsSec = el('div', 'rd-section');
	flagsSec.append(el('h3', 'rd-h3', 'Risk flags'));
	const flags = coin.risk_flags || [];
	if (flags.length) {
		const list = el('div', 'rd-flags');
		for (const f of flags) {
			const meta = FLAG_META[f] || { label: f.replace(/_/g, ' '), tone: 'warn', tip: '' };
			const row = el('div', `rd-flag rd-flag--${meta.tone}`);
			row.append(el('span', 'rd-flag-name', meta.label));
			if (meta.tip) row.append(el('span', 'rd-flag-tip', meta.tip));
			list.append(row);
		}
		flagsSec.append(list);
	} else {
		flagsSec.append(el('p', 'rd-meta', 'No risk flags raised during observation.'));
	}
	panel.append(flagsSec);

	// signal breakdown
	const sig = el('div', 'rd-section');
	sig.append(el('h3', 'rd-h3', 'Signal breakdown'));
	const grid = el('div', 'rd-signals');
	const sigRow = (label, val, tip) => {
		const r = el('div', 'rd-sig');
		const l = el('span', 'rd-sig-label', label);
		if (tip) l.title = tip;
		r.append(l, el('span', 'rd-sig-val', val));
		return r;
	};
	const ratio = (v) => (v == null ? 'not measured' : pct(v) + '%');
	grid.append(sigRow('Organic score', ratio(coin.organic_score)));
	grid.append(sigRow('Bundle score', ratio(coin.bundle_score)));
	grid.append(sigRow('Snipe ratio', ratio(coin.snipe_ratio), 'Share of early supply taken by snipers'));
	grid.append(sigRow('Top-10 concentration', ratio(coin.concentration_top10), 'Share of supply held by the top 10 wallets'));
	grid.append(sigRow('Fresh-wallet ratio', ratio(coin.fresh_wallet_ratio), 'Share of buyers using brand-new wallets'));
	grid.append(sigRow('Bubblemap connectivity', ratio(coin.bubblemap_connectivity), 'How interlinked the buyer wallets are by funding'));
	grid.append(sigRow('Unique buyers', fmtInt(coin.unique_buyers)));
	grid.append(sigRow('Unique sellers', fmtInt(coin.unique_sellers)));
	grid.append(sigRow('Buys / sells', `${fmtInt(coin.buy_count)} / ${fmtInt(coin.sell_count)}`));
	grid.append(sigRow('Buy / sell volume', `${coin.buy_volume_sol != null ? fmtSol(coin.buy_volume_sol) : '—'} / ${coin.sell_volume_sol != null ? fmtSol(coin.sell_volume_sol) : '—'} ◎`));
	grid.append(sigRow('Dev buy', coin.dev_buy_sol != null ? fmtSol(coin.dev_buy_sol) + ' ◎' : '—'));
	grid.append(sigRow('Dev sold', coin.dev_sold ? 'Yes' : 'No'));
	grid.append(sigRow('Largest buy', coin.largest_buy_sol != null ? fmtSol(coin.largest_buy_sol) + ' ◎' : '—'));
	sig.append(grid);
	panel.append(sig);

	// tags
	if (Array.isArray(coin.tags) && coin.tags.length) {
		const tagSec = el('div', 'rd-section');
		tagSec.append(el('h3', 'rd-h3', 'Tags'));
		const tw = el('div', 'rd-tags');
		for (const t of coin.tags) tw.append(el('span', 'rd-tag', t));
		tagSec.append(tw);
		panel.append(tagSec);
	}

	// wallet ledger
	panel.append(renderWalletLedger(coin));

	// Oracle conviction — async injection after drawer is visible
	const oracleSec = el('div', 'rd-section rd-oracle');
	const oracleSk = el('div', 'rd-oracle-sk');
	oracleSec.append(el('h3', 'rd-h3', 'Oracle conviction'));
	oracleSec.append(oracleSk);
	panel.append(oracleSec);

	// links + socials
	const links = el('div', 'rd-section rd-links');
	const scan = el('a', 'radar-btn radar-btn--ghost', 'Solscan');
	scan.href = solscanToken(coin.mint, coin.network); scan.target = '_blank'; scan.rel = 'noopener noreferrer';
	links.append(scan);
	const s = coin.socials || {};
	if (s.twitter) links.append(socialLink('Twitter', s.twitter));
	if (s.telegram) links.append(socialLink('Telegram', s.telegram));
	if (s.website) links.append(socialLink('Website', s.website));
	panel.append(links);

	// Fetch Oracle conviction async and inject into the already-visible section
	if (coin.network !== 'devnet') {
		const TIER_META = {
			prime:   { label: 'PRIME',   color: '#c084fc', bg: 'rgba(192,132,252,.14)' },
			strong:  { label: 'STRONG',  color: '#34d399', bg: 'rgba(52,211,153,.12)' },
			lean:    { label: 'LEAN',    color: '#fbbf24', bg: 'rgba(251,191,36,.12)' },
			watch:   { label: 'WATCH',   color: '#94a3b8', bg: 'rgba(148,163,184,.1)' },
			avoid:   { label: 'AVOID',   color: '#f87171', bg: 'rgba(248,113,113,.12)' },
		};
		const PILLAR_COLORS = { pedigree: '#5fe3ff', structure: '#34d399', narrative: '#a07bff', momentum: '#fbbf24' };
		fetch(`/api/oracle/coin?mint=${encodeURIComponent(coin.mint)}`)
			.then(r => r.ok ? r.json() : null)
			.catch(() => null)
			.then(data => {
				if (!oracleSec.isConnected) return;
				const cv = data?.conviction;
				if (!cv) {
					oracleSk.replaceWith(el('p', 'rd-meta', 'No Oracle score yet for this coin.'));
					return;
				}
				const tier = cv.tier || 'watch';
				const meta = TIER_META[tier] || TIER_META.watch;
				const score = Math.round(Number(cv.score ?? 0));
				const pillars = cv.pillars || {};

				const head = el('div', 'rd-oracle-head');
				const dial = el('div', 'rd-oracle-dial');
				const scoreEl = el('span', 'rd-oracle-score', String(score));
				scoreEl.style.color = meta.color;
				const maxEl = el('span', 'rd-oracle-max', '/100');
				const badge = el('span', 'rd-oracle-badge', meta.label);
				badge.style.cssText = `background:${meta.bg};color:${meta.color};border-color:${meta.color}40`;
				dial.append(scoreEl, maxEl);
				head.append(dial, badge);

				const pillarRow = el('div', 'rd-oracle-pillars');
				for (const key of ['pedigree', 'structure', 'narrative', 'momentum']) {
					const val = Math.round(Number(pillars[key] ?? 0));
					const row = el('div', 'rd-oracle-pillar');
					const label = el('span', 'rd-oracle-pillar-label', key);
					const bar = el('div', 'rd-oracle-pillar-bar');
					const fill = el('div', 'rd-oracle-pillar-fill');
					fill.style.cssText = `width:${val}%;background:${PILLAR_COLORS[key]}`;
					const valEl = el('span', 'rd-oracle-pillar-val', String(val));
					bar.append(fill);
					row.append(label, bar, valEl);
					pillarRow.append(row);
				}

				const link = el('a', 'radar-btn radar-btn--ghost rd-oracle-link', 'Full conviction →');
				link.href = `/oracle?mint=${encodeURIComponent(coin.mint)}`;
				link.target = '_blank';
				link.rel = 'noopener noreferrer';
				link.style.cssText = 'color:' + meta.color + ';border-color:' + meta.color + '40;margin-top:8px';

				const body = el('div', 'rd-oracle-body');
				body.append(head, pillarRow, link);
				oracleSk.replaceWith(body);
			});
	} else {
		oracleSec.remove();
	}

	const id = el('div', 'rd-mint');
	id.append(el('span', null, 'Mint'));
	const code = el('code', null, coin.mint);
	const copy = el('button', 'rd-copy', 'Copy');
	copy.type = 'button';
	copy.addEventListener('click', async () => {
		try { await navigator.clipboard.writeText(coin.mint); copy.textContent = 'Copied'; setTimeout(() => copy.textContent = 'Copy', 1400); }
		catch { copy.textContent = 'Copy failed'; setTimeout(() => copy.textContent = 'Copy', 1400); }
	});
	id.append(code, copy);
	panel.append(id);

	// focus close for keyboard users
	const close = panel.querySelector('.rd-close');
	if (close) close.focus();
}

function socialLink(label, href) {
	const a = el('a', 'radar-btn radar-btn--ghost', label);
	const safe = /^https?:\/\//i.test(href) ? href : ('https://' + href);
	a.href = safe; a.target = '_blank'; a.rel = 'noopener noreferrer';
	return a;
}

function renderOutcome(o) {
	const sec = el('div', 'rd-section rd-outcome');
	const tone = o.rugged ? 'danger' : o.graduated ? 'success' : 'neutral';
	sec.classList.add('rd-outcome--' + tone);
	const labelMap = { graduated: 'Graduated', rugged: 'Rugged' };
	const word = o.rugged ? 'Rugged' : o.graduated ? 'Graduated' : (labelMap[o.outcome] || o.outcome);
	const row = el('div', 'rd-outcome-row');
	row.append(el('span', 'rd-outcome-badge', word));
	if (o.ath_multiple != null) row.append(el('span', 'rd-outcome-stat', `ATH ${o.ath_multiple.toFixed(1)}×`));
	if (o.ath_market_cap_usd != null) row.append(el('span', 'rd-outcome-stat', `ATH MC $${Math.round(o.ath_market_cap_usd).toLocaleString()}`));
	if (o.last_market_cap_usd != null) row.append(el('span', 'rd-outcome-stat', `Now $${Math.round(o.last_market_cap_usd).toLocaleString()}`));
	sec.append(el('h3', 'rd-h3', 'Labeled outcome'), row);
	return sec;
}

function renderWalletLedger(coin) {
	const sec = el('div', 'rd-section');
	sec.append(el('h3', 'rd-h3', 'Top trader ledger'));
	const wallets = Array.isArray(coin.wallets) ? coin.wallets : [];
	if (!wallets.length) {
		sec.append(el('p', 'rd-meta', 'No per-wallet ledger available for this coin.'));
		return sec;
	}

	const tableWrap = el('div', 'rd-table-wrap');
	const table = el('table', 'rd-table');
	const thead = el('thead');
	const htr = el('tr');
	['Wallet', 'Buy ◎', 'Sell ◎', 'Net ◎'].forEach((h, i) => {
		const th = el('th', i === 0 ? null : 'rd-num', h);
		th.scope = 'col';
		htr.append(th);
	});
	thead.append(htr);
	table.append(thead);

	const tbody = el('tbody');
	for (const w of wallets) {
		const tr = el('tr');
		const wcell = el('td', 'rd-wcell');
		const a = el('a', 'rd-waddr', short(w.wallet, 4, 4));
		a.href = solscanAccount(w.wallet, coin.network);
		a.target = '_blank'; a.rel = 'noopener noreferrer';
		a.title = w.wallet;
		wcell.append(a);
		if (w.is_creator) wcell.append(el('span', 'rd-wtag', 'creator'));
		tr.append(wcell);

		tr.append(el('td', 'rd-num', w.buy_sol != null ? fmtSol(w.buy_sol) : '—'));
		tr.append(el('td', 'rd-num', w.sell_sol != null ? fmtSol(w.sell_sol) : '—'));
		const net = el('td', 'rd-num ' + (w.net_sol > 0 ? 'rd-pos' : w.net_sol < 0 ? 'rd-neg' : ''), w.net_sol != null ? (w.net_sol > 0 ? '+' : '') + fmtSol(w.net_sol) : '—');
		tr.append(net);
		tbody.append(tr);
	}
	table.append(tbody);
	tableWrap.append(table);
	sec.append(tableWrap);
	return sec;
}

// ════════════════════════════════════════════════════════════════════════════
// MOUNT
// ════════════════════════════════════════════════════════════════════════════
export function mountRadar(mountEl) {
	root = mountEl;
	readUrl();
	render();
	fetchFeed();
	startPolling();

	// keep "updated Xs ago" ticking without re-rendering the grid
	setInterval(updateUpdatedLabel, 1000);

	document.addEventListener('visibilitychange', () => {
		if (!document.hidden) fetchFeed({ silent: true });
	});
}
