// Oracle — the fused pump.fun conviction war room.
//
// Reads /api/oracle/* (feed, coin, wallet, stream, watch, trades). Every
// surface degrades gracefully: if the backend isn't reachable yet (it deploys
// with the migration), the page shows an honest "warming up" state instead of
// breaking.
//
// Views: live conviction feed (with SSE), wallet reputation leaderboard,
// conviction-tier edge backtest, the agent action-loop arm panel, and the 3D
// force graph. The coin drawer also streams live trades via oracle-tape.js.

const NETWORK = 'mainnet';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

// ── watchlist helpers (same key as launch-detail.js and watchlist.js) ────────
const WATCH_KEY = 'ld_watchlist';
function watchedMints() {
	try { return new Set(JSON.parse(localStorage.getItem(WATCH_KEY) || '[]')); } catch { return new Set(); }
}
function toggleOracleWatch(mint) {
	try {
		const list = JSON.parse(localStorage.getItem(WATCH_KEY) || '[]');
		const idx = list.indexOf(mint);
		if (idx >= 0) list.splice(idx, 1); else list.unshift(mint);
		localStorage.setItem(WATCH_KEY, JSON.stringify(list.slice(0, 200)));
		return idx < 0;
	} catch { return false; }
}

// ── tiny helpers ─────────────────────────────────────────────────────────────
function setMeta(prop, content) {
	let el = document.querySelector(`meta[property="${prop}"], meta[name="${prop}"]`);
	if (!el) {
		el = document.createElement('meta');
		document.head.appendChild(el);
	}
	el.setAttribute(prop.startsWith('og:') || prop.startsWith('twitter:') ? 'property' : 'name', prop);
	el.setAttribute('content', content || '');
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const shortAddr = (a) => (a && a.length > 10 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a || '');
const fmtSol = (n) => (n == null ? '—' : `${Number(n) < 0.01 && Number(n) > 0 ? Number(n).toFixed(4) : Number(n).toFixed(2)}◎`);
const fmtPct = (n) => (n == null ? '—' : `${Math.round(Number(n))}%`);
const tierClass = (t) => `t-${t || 'avoid'}`;
const tierPill = (t) => `tp-${t || 'avoid'}`;
function ago(ts) {
	if (!ts) return '—';
	const s = Math.max(0, (Date.now() - new Date(ts).getTime()) / 1000);
	if (s < 60) return `${Math.floor(s)}s`;
	if (s < 3600) return `${Math.floor(s / 60)}m`;
	if (s < 86400) return `${Math.floor(s / 3600)}h`;
	return `${Math.floor(s / 86400)}d`;
}
function solscan(addr) { return `https://solscan.io/account/${addr}`; }
function pumpUrl(mint) { return `https://pump.fun/coin/${mint}`; }
function winTweet(w) {
	const sym = (w.symbol || w.mint.slice(0, 6)).toUpperCase();
	const ath = w.ath_multiple != null ? `${Number(w.ath_multiple).toFixed(1)}×` : 'graduated';
	const score = w.score != null ? `${w.score}/100 ${w.tier}` : w.tier;
	const url = `https://three.ws/oracle?mint=${encodeURIComponent(w.mint)}`;
	const text = `Oracle called $${sym} (${score} conviction) — it went ${ath} 🔮\n\nproof.not.promises @trythreews\n${url}`;
	return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
}

function tweetConviction(c) {
	const tier = c.tier || 'watch';
	const score = c.score ?? '—';
	const symbol = c.symbol || '—';
	const oracleUrl = `https://three.ws/oracle?mint=${encodeURIComponent(c.mint)}`;
	const text = `$${symbol} — ${score}/100 ${tier} conviction on @trythreews Oracle\n\nWho · How · What · Move all fused into one score.\n${oracleUrl}`;
	return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
}

const CATEGORIES = ['meme', 'tech', 'ai', 'culture', 'community', 'political', 'news', 'animal', 'celebrity', 'utility', 'unknown'];
const ARCH_TITLE = {
	smart_money: 'Smart Money', kol: 'KOL', top_dev: 'Top Dev', sniper: 'Sniper',
	dumper: 'Dumper', rugger: 'Rugger', fresh: 'Fresh', neutral: 'Neutral', unproven: 'Unproven',
};

async function api(path, opts = {}) {
	const ctrl = new AbortController();
	const to = setTimeout(() => ctrl.abort(), opts.timeout || 12000);
	try {
		const res = await fetch(path, { credentials: 'include', signal: ctrl.signal, ...opts });
		const data = await res.json().catch(() => null);
		return { ok: res.ok, status: res.status, data };
	} catch {
		return { ok: false, status: 0, data: null };
	} finally {
		clearTimeout(to);
	}
}

// ── state ────────────────────────────────────────────────────────────────────
const state = {
	view: 'feed',
	tier: '',
	category: '',
	minScore: 0,
	sort: 'score',         // 'score' | 'hot' | 'new'
	label: '',
	feed: new Map(),       // mint -> item, preserves SSE + initial load
	es: null,
	agents: [],
	agentId: null,
	watch: null,
	tape: null,            // { destroy() } handle from oracle-tape.js
};

// ── boot ─────────────────────────────────────────────────────────────────────
function boot() {
	// populate category filter
	const catSel = $('#catSel');
	for (const c of CATEGORIES) {
		const o = document.createElement('option');
		o.value = c; o.textContent = c[0].toUpperCase() + c.slice(1);
		catSel.appendChild(o);
	}

	// tabs
	$$('.tab').forEach((t) => t.addEventListener('click', () => switchView(t.dataset.view)));
	// filters
	$('#tierSeg').addEventListener('click', (e) => {
		const b = e.target.closest('button'); if (!b) return;
		$$('#tierSeg button').forEach((x) => x.classList.toggle('on', x === b));
		state.tier = b.dataset.tier; syncFilterUrl(); loadFeed();
	});
	$('#catSel').addEventListener('change', (e) => {
		state.category = e.target.value;
		syncFilterUrl();
		loadFeed();
		$$('#hotSectors .hs-card').forEach((c) => c.classList.toggle('active', c.dataset.cat === state.category && !!state.category));
	});
	$('#minSel').addEventListener('change', (e) => { state.minScore = Number(e.target.value) || 0; syncFilterUrl(); loadFeed(); });
	$('#sortSeg').addEventListener('click', (e) => {
		const b = e.target.closest('[data-fsort]'); if (!b) return;
		$$('#sortSeg button').forEach((x) => x.classList.toggle('on', x === b));
		state.sort = b.dataset.fsort; syncFilterUrl(); renderFeed();
	});
	const MINT_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
	const searchEl = $('#mintSearch');
	let _searchTimer = null;
	const _searchDrop = document.createElement('div');
	_searchDrop.id = 'mintSearchDrop';
	_searchDrop.className = 'ms-drop';
	_searchDrop.style.display = 'none';
	searchEl.parentNode?.insertBefore(_searchDrop, searchEl.nextSibling);

	function closeSearchDrop() { _searchDrop.style.display = 'none'; _searchDrop.innerHTML = ''; }

	async function doSymbolSearch(q) {
		if (!q || q.length < 2) { closeSearchDrop(); return; }
		const res = await fetch(`/api/oracle/search?q=${encodeURIComponent(q)}&network=${NETWORK}&limit=8`).catch(() => null);
		if (!res?.ok) { closeSearchDrop(); return; }
		const data = await res.json().catch(() => null);
		const items = data?.items || [];
		if (!items.length) { closeSearchDrop(); return; }
		const TCOL = { prime: '#c084fc', strong: '#34d399', lean: '#fbbf24', watch: '#94a3b8', avoid: '#f87171' };
		_searchDrop.innerHTML = items.map((it) => {
			const col = TCOL[it.tier] || '#94a3b8';
			return `<button class="ms-item" data-mint="${esc(it.mint)}" type="button">
				<span class="ms-sym">${esc(it.symbol || it.name || it.mint.slice(0, 8))}</span>
				<span class="ms-tier" style="color:${col}">${esc(it.tier || '')}${it.score != null ? ` ${it.score}` : ''}</span>
			</button>`;
		}).join('');
		_searchDrop.style.display = '';
	}

	searchEl.addEventListener('input', () => {
		const v = searchEl.value.trim();
		clearTimeout(_searchTimer);
		if (MINT_RE.test(v)) { closeSearchDrop(); return; }
		_searchTimer = setTimeout(() => doSymbolSearch(v), 280);
	});

	searchEl.addEventListener('keydown', (e) => {
		if (e.key === 'Escape') { closeSearchDrop(); return; }
		if (e.key !== 'Enter') return;
		const v = searchEl.value.trim();
		if (MINT_RE.test(v)) { openCoin(v); searchEl.blur(); closeSearchDrop(); }
	});

	_searchDrop.addEventListener('click', (e) => {
		const btn = e.target.closest('[data-mint]');
		if (!btn) return;
		openCoin(btn.dataset.mint);
		searchEl.value = '';
		closeSearchDrop();
		searchEl.blur();
	});

	document.addEventListener('click', (e) => {
		if (!searchEl.contains(e.target) && !_searchDrop.contains(e.target)) closeSearchDrop();
	});
	// movers filters
	$('#movDirSeg')?.addEventListener('click', (e) => {
		const b = e.target.closest('[data-movdir]'); if (!b) return;
		$$('#movDirSeg button').forEach((x) => x.classList.toggle('on', x === b));
		_moversState.direction = b.dataset.movdir; loadMovers(true);
	});
	$('#movHrSeg')?.addEventListener('click', (e) => {
		const b = e.target.closest('[data-movhr]'); if (!b) return;
		$$('#movHrSeg button').forEach((x) => x.classList.toggle('on', x === b));
		_moversState.hours = Number(b.dataset.movhr); loadMovers(true);
	});

	$('#labelSeg').addEventListener('click', (e) => {
		const b = e.target.closest('button'); if (!b) return;
		$$('#labelSeg button').forEach((x) => x.classList.toggle('on', x === b));
		state.label = b.dataset.label; loadWallets();
	});
	// proof filters
	$('#proofTierSeg')?.addEventListener('click', (e) => {
		const b = e.target.closest('[data-ptier]'); if (!b) return;
		$$('#proofTierSeg button').forEach((x) => x.classList.toggle('on', x === b));
		_proofState.tier = b.dataset.ptier; loadProof(true);
	});
	$('#proofPeriodSeg')?.addEventListener('click', (e) => {
		const b = e.target.closest('[data-pperiod]'); if (!b) return;
		$$('#proofPeriodSeg button').forEach((x) => x.classList.toggle('on', x === b));
		_proofState.period = b.dataset.pperiod; loadProof(true);
	});
	$('#proofLoadMoreBtn')?.addEventListener('click', () => {
		$('#proofLoadMoreBtn').disabled = true; loadProof(false);
	});
	// activity feed filters
	$('#afModeSeg')?.addEventListener('click', (e) => {
		const b = e.target.closest('[data-afmode]'); if (!b) return;
		$$('#afModeSeg button').forEach((x) => x.classList.toggle('on', x === b));
		_afState.mode = b.dataset.afmode; loadActivity(true);
	});
	$('#afTierSeg')?.addEventListener('click', (e) => {
		const b = e.target.closest('[data-aftier]'); if (!b) return;
		$$('#afTierSeg button').forEach((x) => x.classList.toggle('on', x === b));
		_afState.tier = b.dataset.aftier; loadActivity(true);
	});
	$('#afOutcomeSeg')?.addEventListener('click', (e) => {
		const b = e.target.closest('[data-afoutcome]'); if (!b) return;
		$$('#afOutcomeSeg button').forEach((x) => x.classList.toggle('on', x === b));
		_afState.outcome = b.dataset.afoutcome; loadActivity(true);
	});
	$('#afMoreBtn')?.addEventListener('click', () => {
		$('#afMoreBtn').disabled = true; loadActivity(false);
	});
	// follow agent panel — delegated on the leaderboard container
	document.addEventListener('click', (e) => {
		const followBtn = e.target.closest('.lrow-follow');
		if (!followBtn) return;
		const entry = followBtn.closest('.al-entry');
		if (!entry) return;
		const panel = entry.querySelector('.follow-panel');
		if (!panel) return;
		const open = followBtn.getAttribute('aria-expanded') === 'true';
		followBtn.setAttribute('aria-expanded', String(!open));
		panel.hidden = open;
		if (!open && !panel.dataset.loaded) {
			panel.dataset.loaded = '1';
			initFollowPanel(entry.dataset.agentId, panel);
		}
	});

	// drawer close
	$$('#drawer [data-close]').forEach((el) => el.addEventListener('click', closeDrawer));
	document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawer(); });

	// Read initial filter state from URL — enables shareable filter links.
	const qs = new URLSearchParams(location.search);
	const VALID_TIERS = new Set(['prime', 'strong', 'lean', 'watch', 'avoid']);
	const VALID_SORTS = new Set(['score', 'hot', 'new']);
	const VALID_CATS = new Set(CATEGORIES);

	const qTier     = qs.get('tier') || '';
	const qCategory = qs.get('category') || '';
	const qMinScore = Math.max(0, Math.min(100, Number(qs.get('min_score')) || 0));
	const qSort     = qs.get('sort') || 'score';

	if (VALID_TIERS.has(qTier))    { state.tier     = qTier;     const b = $(`#tierSeg [data-tier="${qTier}"]`); if (b) { $$('#tierSeg button').forEach((x) => x.classList.toggle('on', x === b)); } }
	if (VALID_CATS.has(qCategory)) { state.category  = qCategory; const s = $('#catSel'); if (s) s.value = qCategory; }
	if (qMinScore)                 { state.minScore  = qMinScore; const s = $('#minSel'); if (s) s.value = String(qMinScore); }
	if (VALID_SORTS.has(qSort) && qSort !== 'score') { state.sort = qSort; const b = $(`#sortSeg [data-fsort="${qSort}"]`); if (b) { $$('#sortSeg button').forEach((x) => x.classList.toggle('on', x === b)); } }

	loadFeed();
	loadHotSectors();
	openStream();

	// If the page was opened with ?mint= (e.g. from a shared link or Telegram alert),
	// open that coin's drawer immediately after the feed loads.
	const MINT_RE2 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
	const initialMint = qs.get('mint');
	if (initialMint && MINT_RE2.test(initialMint)) openCoin(initialMint);
}

function syncFilterUrl() {
	const url = new URL(location.href);
	if (state.tier)     url.searchParams.set('tier', state.tier); else url.searchParams.delete('tier');
	if (state.category) url.searchParams.set('category', state.category); else url.searchParams.delete('category');
	if (state.minScore) url.searchParams.set('min_score', String(state.minScore)); else url.searchParams.delete('min_score');
	if (state.sort && state.sort !== 'score') url.searchParams.set('sort', state.sort); else url.searchParams.delete('sort');
	history.replaceState(null, '', url.toString());
}

function switchView(view) {
	state.view = view;
	$$('.tab').forEach((t) => t.classList.toggle('on', t.dataset.view === view));
	$$('.view').forEach((v) => v.classList.toggle('on', v.id === `view-${view}`));
	if (view === 'movers' && !$('#moversGrid').dataset.loaded) loadMovers();
	if (view === 'wallets' && !$('#walletWrap').dataset.loaded) loadWallets();
	if (view === 'edge' && !$('#edgeWrap').dataset.loaded) loadEdge();
	if (view === 'proof' && !$('#proofGrid').dataset.loaded) loadProof();
	if (view === 'agents' && !$('#agentLeadWrap').dataset.loaded) loadAgentLeaderboard();
	if (view === 'activity' && !$('#afTableWrap').dataset.loaded) loadActivity(true);
	if (view === 'agent' && !$('#armBody').dataset.loaded) loadAgentPanel();
	if (view === 'graph') loadGraph();
}

let graphHandle = null;
async function loadGraph() {
	const canvas = $('#og-canvas');
	const labels = $('#og-labels');
	const stateEl = $('#og-state');
	if (!canvas || canvas.dataset.loaded) return;
	canvas.dataset.loaded = '1';
	if (stateEl) stateEl.textContent = 'Loading conviction data…';
	try {
		const { mountOracleGraph } = await import('./oracle-graph.js');
		const q = new URLSearchParams({ network: NETWORK, limit: '80' });
		const { data } = await api(`/api/oracle/feed?${q}`);
		const coins = Array.isArray(data?.items) ? data.items : [];
		if (!coins.length) {
			if (stateEl) stateEl.textContent = 'No scored coins yet — check back once the Oracle has swept.';
			return;
		}
		if (stateEl) stateEl.textContent = '';
		graphHandle = mountOracleGraph(canvas, labels);
		graphHandle.loadCoins(coins);
	} catch (err) {
		if (stateEl) stateEl.textContent = `Graph failed to load: ${err.message}`;
	}
}

// Open coin drawer from the 3D graph node click.
window.addEventListener('oracle:open-coin', (e) => {
	const mint = e.detail?.mint;
	if (mint) openCoin(mint);
});

// ── feed ─────────────────────────────────────────────────────────────────────
function feedSkeletons() {
	$('#feedGrid').innerHTML = Array.from({ length: 6 }, () => '<div class="skel"></div>').join('');
}

async function loadFeed() {
	feedSkeletons();
	const q = new URLSearchParams({ network: NETWORK, limit: '60' });
	if (state.tier) q.set('tier', state.tier);
	if (state.category) q.set('category', state.category);
	if (state.minScore) q.set('min_score', String(state.minScore));
	const { ok, data } = await api(`/api/oracle/feed?${q}`);

	if (!ok || !data) return renderFeedEmpty('warming');
	state.feed = new Map((data.items || []).map((it) => [it.mint, it]));
	setStats(data);
	renderFeed();
	if (Array.isArray(data.backtest)) cacheBacktest(data.backtest);
}

function renderFeed() {
	const sorter = state.sort === 'new'
		? (a, b) => new Date(b.scored_at || 0) - new Date(a.scored_at || 0)
		: state.sort === 'hot'
			? (a, b) => (Number(b.pillars?.momentum) || 0) - (Number(a.pillars?.momentum) || 0)
			: (a, b) => b.score - a.score;
	const items = [...state.feed.values()].sort(sorter);
	$('#ctFeed').textContent = items.length ? items.length : '';
	if (!items.length) return renderFeedEmpty('empty');
	const grid = $('#feedGrid');
	grid.innerHTML = '';
	const watched = watchedMints();
	items.forEach((it) => grid.appendChild(coinCard(it, watched)));
}

function renderFeedEmpty(kind) {
	const msg = kind === 'warming'
		? { b: 'Oracle is warming up', p: 'The conviction engine ships with its backend — once the ingestion augmentor is live it scores every new pump.fun launch in real time. Check back shortly.' }
		: { b: 'No launches clear this filter yet', p: 'Loosen the tier or score filter, or wait for the next wave — new coins are scored the moment they surface.' };
	$('#feedGrid').innerHTML = `<div class="state" style="grid-column:1/-1"><b>${msg.b}</b>${esc(msg.p)}</div>`;
	$('#ctFeed').textContent = '';
}

// ── hot sectors ───────────────────────────────────────────────────────────────
async function loadHotSectors() {
	const el = $('#hotSectors');
	if (!el || el.dataset.loaded) return;
	el.dataset.loaded = '1';

	const { ok, data } = await api(`/api/oracle/categories?network=${NETWORK}&hours=24`);
	const items = ok && data ? (data.items || []) : [];
	if (!items.length) return;

	el.innerHTML = items.map((c) => {
		const initial = esc((c.best_symbol || c.category || '?')[0].toUpperCase());
		const imgEl = c.best_image_uri
			? `<img class="hs-img" src="${esc(c.best_image_uri)}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'hs-img',textContent:'${initial}'}))"/>`
			: `<div class="hs-img">${initial}</div>`;
		const primeBadge  = c.prime_count  > 0 ? `<span class="hs-badge prime">${c.prime_count} prime</span>`   : '';
		const strongBadge = c.strong_count > 0 ? `<span class="hs-badge strong">${c.strong_count} strong</span>` : '';
		const totalBadge  = `<span class="hs-badge">${c.total} coins</span>`;
		return `<button class="hs-card" type="button" data-cat="${esc(c.category)}">
			<div class="hs-head">${imgEl}<div class="hs-cat">${esc(c.category)}</div></div>
			<div style="display:flex;align-items:baseline;gap:6px">
				<span class="hs-avg">${Math.round(c.avg_score)}</span>
				<span class="hs-avg-label">avg conviction</span>
			</div>
			<div class="hs-badges">${primeBadge}${strongBadge}${totalBadge}</div>
		</button>`;
	}).join('');

	el.style.display = '';

	// Sync active state with any pre-selected category from URL params.
	if (state.category) {
		const activeCard = el.querySelector(`[data-cat="${CSS.escape(state.category)}"]`);
		if (activeCard) activeCard.classList.add('active');
	}

	el.addEventListener('click', (e) => {
		const card = e.target.closest('.hs-card');
		if (!card) return;
		const cat = card.dataset.cat;
		// Toggle: clicking the active category again deselects it.
		state.category = state.category === cat ? '' : cat;
		syncFilterUrl();
		const catSel = $('#catSel');
		if (catSel) catSel.value = state.category;
		loadFeed();
		$$('#hotSectors .hs-card').forEach((c) => c.classList.toggle('active', c === card && !!state.category));
	});
}

function pillar(kind, label, val) {
	return `<div class="pil ${kind}"><div class="lab">${label}<b>${val ?? '—'}</b></div>
		<div class="track"><div class="fill" style="width:${Math.max(0, Math.min(100, val || 0))}%"></div></div></div>`;
}

function coinCard(it, watched = new Set()) {
	const p = it.pillars || {};
	const badges = (it.badges || []).map((b) => {
		const cls = b === 'smart-money' ? 'sm' : b === 'structure-flag' ? 'flag' : b === 'news' ? 'news' : '';
		const txt = b === 'structure-flag' ? 'structure ⚑' : b;
		return `<span class="chip ${cls}">${esc(txt)}</span>`;
	}).join('');

	const btn = document.createElement('button');
	btn.className = `coin ${tierClass(it.tier)}`;
	btn.dataset.mint = it.mint;
	btn.innerHTML = `
		<div class="coin-top">
			${it.image_uri
				? `<img class="coin-img" src="${esc(it.image_uri)}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'coin-img',textContent:'${esc((it.symbol || '?')[0])}'}))">`
				: `<div class="coin-img">${esc((it.symbol || '?')[0])}</div>`}
			<div class="coin-id">
				<div class="coin-sym">${esc(it.symbol || '—')}</div>
				<div class="coin-name">${esc(it.name || it.mint.slice(0, 8))}</div>
			</div>
			<div class="dial">
				<b>${it.score}</b><span>conviction</span>
				<div class="tierpill ${tierPill(it.tier)}">${esc(it.tier)}</div>
			</div>
		</div>
		<div class="pillars">
			${pillar('ped', 'Who', p.pedigree)}
			${pillar('str', 'How', p.structure)}
			${pillar('nar', 'What', p.narrative)}
			${pillar('mom', 'Move', p.momentum)}
		</div>
		<div class="coin-meta">
			${it.category ? `<span class="chip cat">${esc(it.category)}</span>` : ''}
			${it.smart_wallet_count ? `<span class="chip sm"><b>${it.smart_wallet_count}</b> smart in</span>` : ''}
			${badges}
			<span class="chip">${ago(it.scored_at)} ago</span>
		</div>`;
	btn.addEventListener('click', () => openCoin(it.mint));

	const isWatched = watched.has(it.mint);
	const watchBtn = document.createElement('button');
	watchBtn.className = `oc-watch${isWatched ? ' oc-watched' : ''}`;
	watchBtn.type = 'button';
	watchBtn.textContent = isWatched ? '★' : '☆';
	watchBtn.setAttribute('aria-label', isWatched ? 'Remove from watchlist' : 'Add to watchlist');
	watchBtn.setAttribute('aria-pressed', String(isWatched));
	watchBtn.title = isWatched ? 'Remove from watchlist' : 'Add to watchlist';
	watchBtn.addEventListener('click', (e) => {
		e.stopPropagation();
		const nowWatched = toggleOracleWatch(it.mint);
		watchBtn.textContent = nowWatched ? '★' : '☆';
		watchBtn.classList.toggle('oc-watched', nowWatched);
		watchBtn.setAttribute('aria-pressed', String(nowWatched));
		watchBtn.setAttribute('aria-label', nowWatched ? 'Remove from watchlist' : 'Add to watchlist');
		watchBtn.title = nowWatched ? 'Remove from watchlist' : 'Add to watchlist';
	});

	const wrap = document.createElement('div');
	wrap.className = 'coin-wrap';
	wrap.appendChild(btn);
	wrap.appendChild(watchBtn);
	return wrap;
}

function setStats(data) {
	const items = data.items || [];
	// Populate from feed immediately, then override with richer global stats.
	$('#stScored').textContent = data.count ?? items.length;
	$('#stStrong').textContent = items.filter((i) => i.tier === 'strong' || i.tier === 'prime').length;
	$('#stSmart').textContent = items.reduce((s, i) => s + (i.smart_wallet_count || 0), 0);
	$('#stUpdated').textContent = '—';
	// Fetch global platform stats asynchronously.
	loadGlobalStats();
}

async function loadGlobalStats() {
	try {
		const { ok, data } = await api('/api/oracle/stats');
		if (!ok || !data) return;
		if (data.scored_24h != null) $('#stScored').textContent = data.scored_24h.toLocaleString();
		if (data.win_rate != null) $('#stStrong').textContent = data.win_rate + '%';
		else $('#stStrong').textContent = '—';
		if (data.best_ath != null) $('#stSmart').textContent = Number(data.best_ath).toFixed(1) + '×';
		else $('#stSmart').textContent = '—';
		if (data.prime_count != null) $('#stUpdated').textContent = data.prime_count.toLocaleString();
	} catch { /* non-fatal */ }
}

// ── live stream ──────────────────────────────────────────────────────────────
function openStream() {
	try {
		const es = new EventSource(`/api/oracle/stream?network=${NETWORK}`);
		state.es = es;
		es.addEventListener('hello', () => { setLive(true); });
		es.addEventListener('coin', (e) => {
			let it; try { it = JSON.parse(e.data); } catch { return; }
			onLiveCoin(it);
		});
		es.addEventListener('bye', () => { es.close(); setTimeout(openStream, 1500); });
		es.onerror = () => { setLive(false); es.close(); setTimeout(openStream, 4000); };
	} catch { setLive(false); }
}

function setLive(on) {
	$('#liveDot').classList.toggle('off', !on);
	$('#liveLabel').textContent = on ? 'Live · fused conviction' : 'Reconnecting…';
}

function onLiveCoin(it) {
	// passes active filters?
	if (state.tier && it.tier !== state.tier) return;
	if (state.category && it.category !== state.category) return;
	if (state.minScore && it.score < state.minScore) return;
	const isNew = !state.feed.has(it.mint);
	state.feed.set(it.mint, it);
	// Push fresh coin to the 3D graph if it's mounted.
	if (graphHandle?.addCoin) graphHandle.addCoin(it);
	if (state.view !== 'feed') return;
	renderFeed();
	if (isNew) {
		const el = $(`#feedGrid .coin[data-mint="${CSS.escape(it.mint)}"]`);
		if (el) { el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 950); }
	}
}

// ── wallets ──────────────────────────────────────────────────────────────────
async function loadWallets() {
	const wrap = $('#walletWrap');
	wrap.innerHTML = '<div class="state">Loading the reputation graph…</div>';
	const q = new URLSearchParams({ leaderboard: '1', network: NETWORK, limit: '60' });
	if (state.label) q.set('label', state.label);
	const { ok, data } = await api(`/api/oracle/wallet?${q}`);
	wrap.dataset.loaded = '1';
	if (!ok || !data || !(data.items || []).length) {
		wrap.innerHTML = `<div class="state"><b>No wallets ranked yet</b>The reputation graph fills in as coins resolve to outcomes. Once the brain has judged enough launches, the proven money surfaces here.</div>`;
		$('#ctWallets').textContent = '';
		return;
	}
	$('#ctWallets').textContent = data.items.length;
	wrap.innerHTML = `
		<div class="lhead"><span>#</span><span>Wallet</span><span class="colhide">Win rate</span><span>Early win</span><span>Score</span></div>
		${data.items.map((w, i) => walletRow(w, i)).join('')}`;
	$$('#walletWrap .lrow').forEach((r) => r.addEventListener('click', () => openWallet(r.dataset.wallet)));
}

function walletRow(w, i) {
	const a = w.archetype || { label: w.label, title: ARCH_TITLE[w.label] || 'Unproven' };
	return `<div class="lrow-wrap">
		<button class="lrow" data-wallet="${esc(w.wallet)}">
			<span class="lrank ${i < 3 ? 'top' : ''}">${i + 1}</span>
			<span class="lw"><span class="nlabel lb-${esc(w.label)}">${esc(a.title)}</span><span class="lw-addr">${esc(shortAddr(w.wallet))}</span></span>
			<span class="lstat colhide"><b>${fmtPct(w.win_rate)}</b></span>
			<span class="lstat"><b>${fmtPct(w.early_win_rate)}</b></span>
			<span class="lscore">${Math.round(w.score)}</span>
		</button>
		<a class="lrow-copy" href="/trader/${encodeURIComponent(w.wallet)}" title="Trader profile + copy trades">→</a>
	</div>`;
}

// ── oracle agent leaderboard ──────────────────────────────────────────────────
async function loadAgentLeaderboard() {
	const wrap = $('#agentLeadWrap');
	wrap.dataset.loaded = '1';
	wrap.innerHTML = '<div class="state">Loading agent rankings…</div>';
	const { ok, data } = await api(`/api/oracle/leaderboard?network=${NETWORK}&limit=30&min_actions=1`);
	const agents = ok && data ? (data.agents || []) : [];
	if (!agents.length) {
		wrap.innerHTML = `<div class="state"><b>No ranked agents yet</b>Once oracle agents have resolved enough conviction calls, they appear here ranked by win rate. Agents in simulate mode are included — their track records are just as honest.</div>`;
		$('#ctAgents').textContent = '';
		return;
	}
	$('#ctAgents').textContent = agents.length;
	wrap.innerHTML = `
		<div class="alhead"><span>#</span><span>Agent</span><span class="colhide">Actions</span><span>Win rate</span><span>PnL ◎</span></div>
		${agents.map((a, i) => agentLeadRow(a, i)).join('')}`;
	bindFollowHandlers(wrap);
}

function bindFollowHandlers(wrap) {
	wrap.addEventListener('click', (e) => {
		const btn = e.target.closest('.lrow-follow');
		if (!btn) return;
		e.preventDefault();
		const entry = btn.closest('.al-entry');
		const panel = entry?.querySelector('.follow-panel');
		if (!panel) return;
		const opening = panel.hidden;
		panel.hidden = !opening;
		btn.setAttribute('aria-expanded', String(opening));
		if (opening) panel.querySelector('.fp-chat')?.focus();
	});

	wrap.addEventListener('input', (e) => {
		const slider = e.target.closest('.fp-score');
		if (!slider) return;
		const label = slider.closest('.fp-score-field')?.querySelector('.fp-score-val');
		if (label) label.textContent = slider.value;
	});

	wrap.addEventListener('submit', async (e) => {
		const form = e.target.closest('.follow-form');
		if (!form) return;
		e.preventDefault();
		const entry = form.closest('.al-entry');
		const agentId = entry?.dataset.agentId;
		const chatId = form.querySelector('.fp-chat')?.value.trim();
		const minScore = Number(form.querySelector('.fp-score')?.value) || 54;
		const msg = form.querySelector('.fp-msg');
		if (!chatId) { showFpMsg(msg, 'Enter your Telegram chat ID or @handle', 'err'); return; }
		localStorage.setItem('oracle_follow_chat', chatId);
		showFpMsg(msg, 'Subscribing…', '');
		const { ok, data } = await api('/api/oracle/follow', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ agent_id: agentId, chat_id: chatId, min_score: minScore }),
		});
		if (ok) {
			showFpMsg(msg, data?.action === 'updated' ? 'Updated ✓' : 'Subscribed ✓', 'ok');
		} else {
			showFpMsg(msg, data?.message || 'Failed', 'err');
		}
	});

	wrap.addEventListener('click', async (e) => {
		const btn = e.target.closest('.fp-unsub');
		if (!btn) return;
		const form = btn.closest('.follow-form');
		const entry = form?.closest('.al-entry');
		const agentId = entry?.dataset.agentId;
		const chatId = form?.querySelector('.fp-chat')?.value.trim();
		const msg = form?.querySelector('.fp-msg');
		if (!chatId) { showFpMsg(msg, 'Enter your chat ID first', 'err'); return; }
		showFpMsg(msg, 'Unsubscribing…', '');
		const { ok } = await api('/api/oracle/follow', {
			method: 'DELETE',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ agent_id: agentId, chat_id: chatId }),
		});
		showFpMsg(msg, ok ? 'Unsubscribed' : 'Failed', ok ? 'ok' : 'err');
	});
}

function showFpMsg(el, text, cls) {
	if (!el) return;
	el.textContent = text;
	el.className = `fp-msg${cls ? ` fp-msg-${cls}` : ''}`;
}

async function initFollowPanel(agentId, panel) {
	if (!agentId) return;
	const chatInput = panel.querySelector('.fp-chat');
	const savedChat = localStorage.getItem('oracle_follow_chat') || '';
	if (chatInput && savedChat) {
		chatInput.value = savedChat;
		// Also cache for next open
		chatInput.addEventListener('change', () => {
			if (chatInput.value.trim()) localStorage.setItem('oracle_follow_chat', chatInput.value.trim());
		});
	}
	if (!savedChat) return;
	const { ok, data } = await api(
		`/api/oracle/follow?agent_id=${encodeURIComponent(agentId)}&chat_id=${encodeURIComponent(savedChat)}&network=${NETWORK}`
	);
	if (!ok || !data?.following) return;
	const msg = panel.querySelector('.fp-msg');
	if (msg) showFpMsg(msg, 'Already following', 'ok');
	if (data.min_score != null) {
		const slider = panel.querySelector('.fp-score');
		const val    = panel.querySelector('.fp-score-val');
		if (slider) slider.value = String(data.min_score);
		if (val)    val.textContent = String(data.min_score);
	}
}

function agentLeadRow(a, i) {
	const winRate = a.win_rate != null ? `${a.win_rate}%` : '—';
	const wrClass = (a.win_rate || 0) >= 50 ? 'up' : 'dn';
	const pnlVal = a.realized_pnl_sol != null ? Number(a.realized_pnl_sol) : null;
	const pnlStr = pnlVal != null ? `${pnlVal >= 0 ? '+' : ''}${Math.abs(pnlVal) < 0.01 ? pnlVal.toFixed(4) : pnlVal.toFixed(3)}` : '—';
	const pnlClass = pnlVal != null ? (pnlVal >= 0 ? 'up' : 'dn') : '';
	const img = a.image_url
		? `<img class="ag-av" src="${esc(a.image_url)}" alt="" loading="lazy" />`
		: `<div class="ag-av ag-av-ph">${esc((a.name || '?')[0].toUpperCase())}</div>`;
	const subLine = `${a.wins}W / ${a.losses}L${a.roi_pct != null ? ` · ROI ${a.roi_pct >= 0 ? '+' : ''}${a.roi_pct}%` : ''}`;
	return `<div class="al-entry" data-agent-id="${esc(a.agent_id)}">
		<div class="lrow-wrap">
			<a class="alrow lrow" href="/agents/${encodeURIComponent(a.agent_id)}" target="_blank" rel="noopener">
				<span class="lrank ${i < 3 ? 'top' : ''}">${i + 1}</span>
				<span class="lw">${img}
					<span>
						<div class="ag-name">${esc(a.name || shortAddr(a.agent_id))}</div>
						<div class="ag-wl colhide">${esc(subLine)}</div>
					</span>
				</span>
				<span class="lstat colhide">${a.total}</span>
				<span class="lstat"><b class="${wrClass}">${winRate}</b></span>
				<span class="lstat"><b class="${pnlClass}">${pnlStr}</b></span>
			</a>
			<a class="lrow-copy" href="/trader/${encodeURIComponent(a.agent_id)}#tp-copy-panel" title="Copy this agent" rel="noopener">→</a>
			<button class="lrow-follow" type="button" title="Follow agent signals on Telegram" aria-label="Follow agent on Telegram">+</button>
		</div>
		<div class="follow-panel" hidden>
			<form class="follow-form" autocomplete="off">
				<div class="fp-field">
					<label class="fp-label">Telegram chat ID or @handle</label>
					<input type="text" class="fp-chat" placeholder="@handle or -100…" spellcheck="false" />
				</div>
				<div class="fp-field fp-score-field">
					<label class="fp-label">Min conviction score: <b class="fp-score-val">54</b></label>
					<input type="range" class="fp-score" min="36" max="100" value="54" step="1" />
				</div>
				<div class="fp-actions">
					<button type="submit" class="fp-sub">Subscribe</button>
					<button type="button" class="fp-unsub">Unsubscribe</button>
					<span class="fp-msg"></span>
				</div>
			</form>
		</div>
	</div>`;
}

// ── activity feed ─────────────────────────────────────────────────────────────
const _afState = { mode: '', tier: '', outcome: '', cursor: null, loading: false };

async function loadActivity(reset = false) {
	if (_afState.loading) return;
	_afState.loading = true;
	const wrap = $('#afTableWrap');
	wrap.dataset.loaded = '1';
	if (reset) { _afState.cursor = null; wrap.innerHTML = afSkeletons(8); }

	const params = new URLSearchParams({ network: NETWORK, limit: '40' });
	if (_afState.mode)    params.set('mode',    _afState.mode);
	if (_afState.tier)    params.set('tier',    _afState.tier);
	if (_afState.outcome) params.set('outcome', _afState.outcome);
	if (_afState.cursor)  params.set('before',  _afState.cursor);

	const { ok, data } = await api(`/api/oracle/activity?${params}`);
	_afState.loading = false;

	const items = ok && data ? (data.items || []) : [];
	if (!items.length && reset) {
		wrap.innerHTML = `<div class="state"><b>No actions yet</b>Once Oracle-armed agents make their first call, the floor lights up here — every buy, every outcome, in real time.</div>`;
		$('#ctActivity').textContent = '';
		$('#afMore').style.display = 'none';
		return;
	}

	if (reset) {
		wrap.innerHTML = afTableHtml(items);
	} else {
		const tbody = wrap.querySelector('tbody');
		if (tbody) tbody.insertAdjacentHTML('beforeend', items.map(afRow).join(''));
	}

	_afState.cursor = data?.next_before || null;
	const moreEl = $('#afMore');
	const moreBtn = $('#afMoreBtn');
	moreEl.style.display = _afState.cursor ? '' : 'none';
	if (moreBtn) moreBtn.disabled = false;
	const total = data?.summary?.total ?? data?.total ?? null;
	if (reset && total != null) $('#ctActivity').textContent = total;
}

function afSkeletons(n) {
	return `<div class="af-outer">${Array.from({length: n}, () => '<div class="af-skel" style="height:46px;border-bottom:1px solid rgba(255,255,255,0.04)"></div>').join('')}</div>`;
}

function afTableHtml(items) {
	return `<div class="af-outer"><table class="af-table"><thead><tr>
		<th>Agent</th><th>Coin</th><th>Tier</th><th>Score</th><th>Size ◎</th><th>Mode</th><th>Outcome</th><th>PnL ◎</th><th>When</th>
	</tr></thead><tbody>${items.map(afRow).join('')}</tbody></table></div>`;
}

function afRow(a) {
	const av = a.agent_image
		? `<img class="af-av" src="${esc(a.agent_image)}" alt="" loading="lazy">`
		: `<div class="af-av" style="display:grid;place-items:center;font:700 11px/1 var(--mono);color:var(--faint)">${esc((a.agent_name || '?')[0].toUpperCase())}</div>`;
	const outcome = a.outcome || 'open';
	const outCls = outcome === 'win' ? 'af-outcome-win' : outcome === 'loss' ? 'af-outcome-loss' : 'af-outcome-open';
	const outLabel = outcome === 'win'
		? `✓ Win${a.peak_multiple ? ` ${Number(a.peak_multiple).toFixed(1)}×` : ''}`
		: outcome === 'loss' ? '✗ Loss' : '—';
	const pnl = a.realized_pnl_sol != null ? Number(a.realized_pnl_sol) : null;
	const pnlStr = pnl != null ? `${pnl >= 0 ? '+' : ''}${Math.abs(pnl) < 0.01 ? pnl.toFixed(4) : pnl.toFixed(3)}` : '—';
	const pnlCls = pnl != null ? (pnl >= 0 ? 'up' : 'dn') : '';
	const modeBadge = a.mode === 'live' ? '<span class="act-live">live</span>' : '<span class="act-sim">sim</span>';
	return `<tr class="af-row">
		<td class="af-agent">${av}<a class="af-name" href="/trader/${encodeURIComponent(a.agent_id)}" target="_blank" rel="noopener">${esc(a.agent_name || 'Agent')}</a></td>
		<td class="af-coin"><a href="${esc(a.pump_url)}" target="_blank" rel="noopener">${esc(a.symbol || a.mint?.slice(0, 6) || '?')}</a></td>
		<td><span class="tierpill ${tierPill(a.tier)}">${esc(a.tier || '—')}</span></td>
		<td class="af-mono">${a.conviction ?? '—'}</td>
		<td class="af-mono">${a.size_sol != null ? Number(a.size_sol).toFixed(3) : '—'}</td>
		<td>${modeBadge}</td>
		<td class="${outCls}">${outLabel}</td>
		<td class="af-mono ${pnlCls}">${pnlStr}</td>
		<td class="af-mono" style="color:var(--faint);font-size:11px">${a.acted_at ? ago(a.acted_at) + ' ago' : '—'}</td>
	</tr>`;
}

// ── edge (backtest) ──────────────────────────────────────────────────────────
let _backtest = null;
function cacheBacktest(bt) {
	// Normalize old { tier, scored, resolved, grad_rate, avg_ath_multiple } rows
	// into the richer format from /api/oracle/backtest if the feed returns both.
	if (!_backtest && Array.isArray(bt)) _backtest = { by_tier: bt, aggregate: null, top_performers: [] };
	if ($('#edgeWrap').dataset.loaded) renderEdge();
}

async function loadEdge() {
	const wrap = $('#edgeWrap');
	wrap.dataset.loaded = '1';
	wrap.innerHTML = '<div class="state">Loading performance data…</div>';
	const { ok, data } = await api(`/api/oracle/backtest?period=30d&network=${NETWORK}`);
	if (ok && data) {
		_backtest = data;
	} else if (!_backtest) {
		// Fallback: try to get the old format from the feed
		const { data: feed } = await api(`/api/oracle/feed?network=${NETWORK}&limit=1`);
		if (feed?.backtest) _backtest = { by_tier: feed.backtest, aggregate: null, top_performers: [] };
	}
	renderEdge();
}

function renderEdge() {
	const wrap = $('#edgeWrap');
	const bt = _backtest;
	const tiers = bt?.by_tier || [];
	const rows = tiers.filter((r) => (r.total || r.scored || 0) > 0);

	if (!rows.length) {
		wrap.innerHTML = `<div class="state"><b>The edge is still proving itself.</b> Win-rate by tier appears once Oracle has scored coins that have since resolved to an outcome. This is intentionally honest — no backfilled numbers.</div>`;
		return;
	}

	const agg = bt?.aggregate;
	const aggLine = agg && agg.total > 0 ? `
		<div class="edge-agg">
			<div class="edge-kpi"><span>Total scored</span><b>${agg.total}</b></div>
			<div class="edge-kpi"><span>Win rate</span><b class="${(agg.win_rate||0) >= 50 ? 'up' : 'dn'}">${agg.win_rate != null ? agg.win_rate + '%' : '—'}</b></div>
			<div class="edge-kpi"><span>Wins</span><b class="up">${agg.wins}</b></div>
			<div class="edge-kpi"><span>Losses</span><b class="dn">${agg.losses}</b></div>
			<div class="edge-kpi"><span>Graduated</span><b>${agg.graduated}</b></div>
			<div class="edge-kpi"><span>Rugged</span><b>${agg.rugged}</b></div>
			<div class="edge-kpi"><span>≥ 5×</span><b>${agg.five_x}</b></div>
			<div class="edge-kpi"><span>≥ 10×</span><b>${agg.ten_x}</b></div>
		</div>` : '';

	const top = bt?.top_performers?.slice(0, 5) || [];
	const topHtml = top.length ? `
		<div class="dr-sec" style="margin-top:20px">Top performers (30d by ATH)</div>
		<div class="edge-top">
			${top.map((t) => `<a class="edge-top-row" href="https://pump.fun/coin/${esc(t.mint)}" target="_blank" rel="noopener">
				<span class="tierpill ${tierPill(t.tier)}">${esc(t.tier)}</span>
				<b>${esc(t.symbol || t.mint.slice(0, 6))}</b>
				<span class="edge-ath">${t.ath_multiple ? Number(t.ath_multiple).toFixed(1) + '×' : t.graduated ? '✓ grad' : '—'}</span>
			</a>`).join('')}
		</div>` : '';

	wrap.innerHTML = `
		${aggLine}
		<div class="ehead" style="margin-top:${agg ? '20px' : '0'}"><span>Tier</span><span>Win rate</span><span class="colhide">Wins / Losses</span><span>Avg ATH×</span><span>≥ 5×</span></div>
		${rows.map(edgeRow).join('')}
		${topHtml}
		<p style="font-size:11px;color:var(--faint);margin-top:18px">Win = graduated OR ATH ≥ 2×. Loss = rugged OR ATH &lt; 1.2×. Open positions excluded. 30-day window.</p>`;
}

function edgeRow(r) {
	// Support both old format (grad_rate, scored) and new format (win_rate, total, wins, losses)
	const winRate = r.win_rate ?? r.grad_rate ?? null;
	const total = r.total || r.scored || 0;
	const wins = r.wins ?? 0;
	const losses = r.losses ?? 0;
	const ath = r.avg_ath ? Number(r.avg_ath).toFixed(1) : (r.avg_ath_multiple ? Number(r.avg_ath_multiple).toFixed(1) : null);
	const fiveX = r.five_x ?? 0;
	return `<div class="erow">
		<span><span class="tierpill ${tierPill(r.tier)}">${esc(r.tier)}</span></span>
		<span><div class="gradbar"><i style="width:${winRate ?? 0}%"></i></div><span class="lstat" style="text-align:left"><b>${winRate != null ? winRate + '%' : '—'}</b></span></span>
		<span class="lstat colhide">${wins} / ${losses}</span>
		<span class="lstat"><b>${ath ? ath + '×' : '—'}</b></span>
		<span class="lstat">${fiveX}</span>
	</div>`;
}

// ── proof / wins gallery ──────────────────────────────────────────────────────

const _proofState = { tier: '', period: '30d', cursor: null, loading: false };

// ── movers ──────────────────────────────────────────────────────────────────
const _moversState = { direction: 'rising', hours: 24 };

function moverCardHtml(m) {
	const tier = m.tier || 'watch';
	const deltaSign = m.delta >= 0 ? '+' : '';
	const deltaCls = m.delta >= 0 ? 'up' : 'dn';
	const imgSrc = m.image_uri
		? `<img class="mv-img" src="${esc(m.image_uri)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">`
		: `<div class="mv-img">${esc((m.symbol || '?')[0])}</div>`;
	const TIER_META = { prime: { color: '#c084fc' }, strong: { color: '#34d399' }, lean: { color: '#fbbf24' }, watch: { color: '#94a3b8' }, avoid: { color: '#f87171' } };
	const tierColor = (TIER_META[tier] || TIER_META.watch).color;

	const pil = (val, key) => {
		const v = Math.max(0, Math.min(100, Number(val) || 0));
		const labels = { pedigree: 'Who', structure: 'How', narrative: 'What', momentum: 'Move' };
		return `<div class="mv-pil">
			<div class="mv-pil-label">${labels[key] || key}</div>
			<div class="mv-pil-bar"><div class="mv-pil-fill" style="width:${v}%"></div></div>
		</div>`;
	};

	const tierChangedHtml = m.tier_changed
		? `<div class="mv-tier-change">Tier: ${esc(m.first_tier)} → ${esc(m.tier)}</div>`
		: '';

	return `<div class="mv-card mv-${m.delta >= 0 ? 'rising' : 'falling'}" role="button" tabindex="0"
		data-mint="${esc(m.mint)}" onclick="window.oracleOpenMover('${esc(m.mint)}')"
		onkeydown="if(event.key==='Enter'||event.key===' ')window.oracleOpenMover('${esc(m.mint)}')">
		<div class="mv-head">
			${imgSrc}
			<div class="mv-id">
				<div class="mv-sym">${esc(m.symbol || m.mint.slice(0, 8))}</div>
				<div class="mv-name">${esc(m.name || '')}</div>
			</div>
			<div class="mv-delta">
				<div class="mv-delta-val ${deltaCls}">${deltaSign}${m.delta}</div>
				<div class="mv-delta-label">score Δ</div>
			</div>
		</div>
		<div class="mv-scores">
			<span style="color:var(--muted)">${m.first_score ?? '?'}</span>
			<span class="mv-arrow">→</span>
			<span class="mv-score-cur" style="color:${tierColor}">${m.score ?? '?'}</span>
			<span class="tierpill tp-${tier}" style="margin-left:4px;padding:1px 6px;font-size:10px">${tier}</span>
			${m.category ? `<span style="color:var(--faint);font-size:11px;margin-left:auto">${esc(m.category)}</span>` : ''}
		</div>
		${tierChangedHtml}
		<div class="mv-pillars">
			${pil(m.pillars?.pedigree, 'pedigree')}
			${pil(m.pillars?.structure, 'structure')}
			${pil(m.pillars?.narrative, 'narrative')}
			${pil(m.pillars?.momentum, 'momentum')}
		</div>
	</div>`;
}

async function loadMovers(reset = false) {
	const grid = $('#moversGrid');
	if (!grid) return;
	grid.dataset.loaded = '1';

	const skels = Array.from({ length: 6 }, () =>
		'<div class="skel" style="height:160px;border-radius:var(--r)"></div>'
	).join('');
	if (reset || !grid.children.length) grid.innerHTML = skels;

	const { direction, hours } = _moversState;
	const { ok, data } = await api(
		`/api/oracle/movers?network=${NETWORK}&direction=${direction}&hours=${hours}&limit=40`
	);

	if (!ok || !data?.items?.length) {
		grid.innerHTML = `<div class="state" style="grid-column:1/-1">
			<b>No movers yet in this window.</b>
			Conviction deltas appear once Oracle re-scores the same coins in the selected window.
			${direction === 'rising' ? 'Try the 48h window or check back as more coins get re-scored.' : ''}
		</div>`;
		return;
	}

	grid.innerHTML = data.items.map(moverCardHtml).join('');
}

window.oracleOpenMover = (mint) => openCoin(mint);

function winCardHtml(w, idx) {
	const tier = w.tier || 'watch';
	const athStr = w.ath_multiple != null ? `${Number(w.ath_multiple).toFixed(1)}×` : w.graduated ? 'Grad ✓' : '—';
	const imgSrc = w.image_uri || '';
	const sym = esc((w.symbol || w.mint.slice(0, 6)).toUpperCase());
	const scoreColor = tier === 'prime' ? 'var(--up)' : tier === 'strong' ? 'var(--up)' : tier === 'lean' ? 'var(--gold)' : 'var(--muted)';
	const pillars = w.pillars || {};
	const pil = (k, cls, lbl) => {
		const v = pillars[k] != null ? Math.round(Number(pillars[k])) : null;
		return `<div class="win-pil ${cls}">
			<label>${lbl}<b>${v != null ? v : '?'}</b></label>
			<div class="win-pil-bar"><div class="win-pil-fill" style="width:${v ?? 0}%"></div></div>
		</div>`;
	};
	const when = w.scored_at ? ago(w.scored_at) : '';
	return `<a class="win-card win-in" href="${esc(w.oracle_url)}" style="animation-delay:${Math.min(idx * 40, 400)}ms">
		<div class="win-card-head">
			<div class="win-img">${imgSrc ? `<img src="${esc(imgSrc)}" alt="" style="width:42px;height:42px;border-radius:10px;object-fit:cover" onerror="this.style.display='none'" loading="lazy" />` : sym.slice(0, 2)}</div>
			<div class="win-id">
				<div class="win-sym">$${sym}</div>
				${w.name ? `<div class="win-name">${esc(w.name)}</div>` : ''}
			</div>
			<div class="win-ath">
				<span class="win-ath-val">${esc(athStr)}</span>
				<span class="win-ath-label">ATH</span>
			</div>
		</div>
		<div class="win-body">
			<div class="win-score-row">
				<span class="win-score-label">Oracle at entry</span>
				<span class="win-score-val" style="color:${scoreColor}">${w.score != null ? w.score : '—'}</span>
				<span class="tierpill tp-${tier}" style="margin-left:6px">${tier}</span>
			</div>
			<div class="win-pillars">
				${pil('pedigree', 'ped', 'Who')}${pil('structure', 'str', 'How')}${pil('narrative', 'nar', 'What')}${pil('momentum', 'mom', 'Move')}
			</div>
			<div class="win-badges">
				${w.graduated ? '<span class="win-grad">Graduated</span>' : ''}
				<span class="win-when">${esc(when)}</span>
			</div>
			<div class="win-links">
				<a class="win-link" href="${esc(w.pump_url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">pump.fun ↗</a>
				<a class="win-link" href="${esc(w.oracle_url)}" onclick="event.stopPropagation()">Oracle ↗</a>
				<a class="win-link" style="margin-left:auto;color:var(--muted)" href="${esc(winTweet(w))}" target="_blank" rel="noopener" onclick="event.stopPropagation()" title="Share on X">Share ↗</a>
			</div>
		</div>
	</a>`;
}

function proofSkeletons(n = 6) {
	return Array.from({ length: n }, () => '<div class="skel" style="height:220px;border-radius:var(--r)"></div>').join('');
}

async function loadProof(reset = false) {
	if (_proofState.loading) return;
	_proofState.loading = true;
	const grid = $('#proofGrid');
	grid.dataset.loaded = '1';
	if (reset) { _proofState.cursor = null; grid.innerHTML = proofSkeletons(); }

	const url = `/api/oracle/wins?network=${NETWORK}&period=${_proofState.period}&limit=24&min_ath=2`;
	const q = url + (_proofState.tier ? `&tier=${_proofState.tier}` : '') + (_proofState.cursor ? `&before=${_proofState.cursor}` : '');

	const { ok, data } = await api(q);
	_proofState.loading = false;

	if (!ok || !data?.items) {
		if (reset) grid.innerHTML = `<div class="state" style="grid-column:1/-1"><b>No proved wins yet.</b><br>Once Oracle-scored coins resolve to a positive outcome, they appear here. The engine is scoring live.</div>`;
		return;
	}

	const items = data.items || [];
	if (reset) {
		grid.innerHTML = items.length ? items.map(winCardHtml).join('') : `<div class="state" style="grid-column:1/-1"><b>No wins resolved yet in this period.</b><br>Try a longer window or check back as more coins resolve.</div>`;
	} else {
		items.forEach((w, i) => grid.insertAdjacentHTML('beforeend', winCardHtml(w, i)));
	}

	_proofState.cursor = data.next_before || null;
	const moreWrap = $('#proofLoadMore');
	const moreBtn  = $('#proofLoadMoreBtn');
	moreWrap.style.display = _proofState.cursor ? '' : 'none';
	if (moreBtn) { moreBtn.disabled = false; }

	// Render KPIs on first load
	if (reset && data.summary) {
		const kpis = $('#proofKpis');
		const s = data.summary;
		kpis.style.display = '';
		kpis.innerHTML = [
			['Wins', s.total_wins ?? 0, 'up'],
			['Best ATH', s.best_ath != null ? `${Number(s.best_ath).toFixed(1)}×` : '—', 'up'],
			['5× or more', s.five_x_count ?? 0, ''],
			['10× or more', s.ten_x_count ?? 0, ''],
			['Graduated', s.graduated_count ?? 0, ''],
		].map(([l, v, cls]) => `<div class="proof-kpi"><span>${l}</span><b class="${cls}">${v}</b></div>`).join('');
		const ctProof = $('#ctProof');
		if (ctProof && s.total_wins) ctProof.textContent = s.total_wins;
	}
}

// ── coin drawer ──────────────────────────────────────────────────────────────
async function openCoin(mint) {
	const dr = $('#drawer');
	dr.classList.add('open'); dr.setAttribute('aria-hidden', 'false');
	$('#drTitle').textContent = 'Loading…';
	$('#drBody').innerHTML = '<div class="state">Reading the order book…</div>';
	// Update URL so this conviction view is shareable / bookmarkable.
	const url = new URL(location.href);
	url.searchParams.set('mint', mint);
	history.replaceState(null, '', url.toString());
	const { ok, data } = await api(`/api/oracle/coin?mint=${encodeURIComponent(mint)}&network=${NETWORK}`);
	if (!ok || !data || !data.conviction) {
		$('#drTitle').textContent = 'Not observed yet';
		$('#drBody').innerHTML = `<div class="state"><b>This launch hasn't been scored</b>Oracle scores coins as they surface on pump.fun. If it's brand new, it'll appear here within moments.</div>`;
		return;
	}
	renderDrawer(data);
}

function structurePanel(st) {
	if (!st) return '';
	const pct = (n) => (n == null ? '—' : `${Math.round(Number(n))}%`);
	const bar = (val, color) => `<div class="str-track"><div class="str-fill" style="width:${Math.max(0,Math.min(100,val||0))}%;background:${color}"></div></div>`;
	const organic  = Number(st.organicScore  ?? 0);
	const bundle   = Number(st.bundleScore   ?? 0);
	const top10    = Number(st.top10Pct      ?? 0);
	const connect  = Number(st.bubblemapConnectivity ?? 0);
	const devSold  = Number(st.devSoldPct    ?? 0);
	const devBuy   = st.creatorHoldPct != null ? `${Math.round(Number(st.creatorHoldPct))}%` : '—';
	const buyers   = st.uniqueBuyers   ?? '—';
	const bundleFl = st.bundleFlag;
	if (!st.organicScore && !st.bundleScore && !st.top10Pct && !st.bubblemapConnectivity) return '';
	return `
		<div class="dr-sec">Structure <span style="color:var(--faint);font-weight:400;font-size:10px">wallet graph · buy pattern</span></div>
		<div class="str-grid">
			<div class="str-row">
				<span class="str-lbl">Organic buy</span>
				${bar(organic, 'var(--up)')}
				<span class="str-val" style="color:var(--up)">${pct(organic)}</span>
			</div>
			<div class="str-row">
				<span class="str-lbl">Bundle / coord</span>
				${bar(bundle, bundleFl ? 'var(--down)' : 'var(--amber)')}
				<span class="str-val" style="color:${bundleFl ? 'var(--down)' : 'var(--amber)'}">${pct(bundle)}${bundleFl ? ' ⚑' : ''}</span>
			</div>
			${top10 ? `<div class="str-row">
				<span class="str-lbl">Top 10 hold</span>
				${bar(top10, top10 > 60 ? 'var(--down)' : 'var(--gold)')}
				<span class="str-val" style="color:${top10 > 60 ? 'var(--down)' : 'var(--gold)'}">${pct(top10)}</span>
			</div>` : ''}
			${connect ? `<div class="str-row">
				<span class="str-lbl">Graph density</span>
				${bar(connect, connect > 50 ? 'var(--down)' : 'var(--muted)')}
				<span class="str-val" style="color:${connect > 50 ? 'var(--down)' : 'var(--muted)'}">${pct(connect)}</span>
			</div>` : ''}
		</div>
		<div class="coin-meta" style="margin-top:10px">
			${buyers !== '—' ? `<span class="chip">buyers <b>${buyers}</b></span>` : ''}
			${devBuy !== '—' ? `<span class="chip ${devSold > 50 ? 'flag' : ''}">dev hold <b>${devBuy}</b>${devSold > 20 ? ` · sold ${Math.round(devSold)}%` : ''}</span>` : ''}
		</div>`;
}


function renderDrawer(d) {
	const c = d.conviction; const p = c.pillars || {};
	$('#drTitle').innerHTML = `${esc(c.symbol || '—')} <span style="color:var(--muted);font:600 13px var(--mono)">${esc(c.name || '')}</span>`;
	const reasons = (d.reasons || []).map((r) => `<div class="reason"><span class="rdot ${esc(r.pillar)}"></span><span>${esc(r.text)}</span></div>`).join('') || '<div class="state">No breakdown available.</div>';
	const narr = d.narrative;
	const whos = (d.whos_in || []).map(whoRow).join('') || '<div class="state">No wallet footprint recorded yet.</div>';
	const out = d.outcome;
	$('#drBody').innerHTML = `
		<div style="display:flex;align-items:center;gap:18px;margin-bottom:6px">
			<div class="dial ${tierClass(c.tier)}" style="text-align:left">
				<b style="font-size:40px">${c.score}</b>
				<div class="tierpill ${tierPill(c.tier)}">${esc(c.tier)} conviction</div>
			</div>
			<div style="flex:1" class="pillars">
				${pillar('ped', 'Who', p.pedigree)}
				${pillar('str', 'How', p.structure)}
				${pillar('nar', 'What', p.narrative)}
				${pillar('mom', 'Move', p.momentum)}
			</div>
		</div>
		<div class="dr-actions">
			<a class="dr-act" href="${pumpUrl(c.mint)}" target="_blank" rel="noopener">pump.fun ↗</a>
			<a class="dr-act" href="${solscan(c.mint)}" target="_blank" rel="noopener">solscan ↗</a>
			<a class="dr-act" href="/launches/${esc(c.mint)}" target="_blank" rel="noopener">Details ↗</a>
			<button class="dr-act dr-watch" id="drWatch" data-mint="${esc(c.mint)}" type="button" aria-pressed="${watchedMints().has(c.mint)}">${watchedMints().has(c.mint) ? '★ Watching' : '☆ Watch'}</button>
			<button class="dr-act" id="drCopyMint" type="button" title="Copy mint address" data-mint="${esc(c.mint)}">Copy mint</button>
			<a class="dr-act dr-share" href="${tweetConviction(c)}" target="_blank" rel="noopener" title="Share conviction on X">Share ↗</a>
			${c.structure_cap != null && c.structure_cap < 60 ? `<span class="note warn">structural cap ${c.structure_cap}</span>` : ''}
		</div>
		<div id="scoreHistoryWrap" style="margin-top:12px"></div>
		${narr ? `<div class="dr-sec">Narrative</div><div style="font-size:13.5px;color:var(--ink)">${esc(narr.narrative || '')}</div>
			<div class="coin-meta" style="margin-top:8px"><span class="chip cat">${esc(narr.category)}</span><span class="chip">virality <b>${narr.virality ?? '—'}</b></span><span class="chip">${esc(narr.source || '')}</span></div>` : ''}
		<div class="dr-sec">Why this score</div>${reasons}
		<div id="communityPulseWrap"></div>
		${structurePanel(d.components?.structure)}
		<div class="dr-sec">Who's in <span style="color:var(--faint)">(${(d.whos_in || []).length})</span></div>${whos}
		${out ? `<div class="dr-sec">Outcome</div><div class="coin-meta">
			<span class="chip ${out.graduated ? 'sm' : out.rugged ? 'flag' : ''}">${out.graduated ? 'graduated ✓' : out.rugged ? 'rugged ✕' : 'live'}</span>
			${out.ath_multiple ? `<span class="chip">ATH <b>${Number(out.ath_multiple).toFixed(1)}×</b></span>` : ''}</div>` : ''}
		<div class="dr-sec">Live trades</div>
		<div id="tradeTape" class="trade-tape"></div>
	`;

	// Fetch and render conviction score history sparkline + community sentiment.
	loadScoreHistory(c.mint);
	loadSentimentPulse(c.mint);

	// Update OG / Twitter meta so shared links carry the coin's conviction card.
	const ogImg    = `https://three.ws/api/oracle/og?mint=${encodeURIComponent(c.mint)}`;
	const ogTitle  = `$${c.symbol || c.mint.slice(0, 8)} — ${c.score ?? '?'}/100 ${c.tier || ''} conviction · Oracle`;
	const ogDesc   = `Oracle scored this launch ${c.score ?? '?'}/100 (${c.tier || 'unscored'}). Who · How · What · Move — all fused into one signal.`;
	setMeta('og:title',            ogTitle);
	setMeta('og:description',      ogDesc);
	setMeta('og:image',            ogImg);
	setMeta('og:url',              `https://three.ws/oracle?mint=${encodeURIComponent(c.mint)}`);
	setMeta('twitter:card',        'summary_large_image');
	setMeta('twitter:title',       ogTitle);
	setMeta('twitter:description', ogDesc);
	setMeta('twitter:image',       ogImg);

	// Tear down any previous tape, then mount fresh for this coin.
	state.tape?.destroy();
	state.tape = null;
	const tapeEl = $('#tradeTape');
	if (tapeEl) {
		import('./oracle-tape.js').then(({ mountTradeTape }) => {
			// Guard: drawer may have been closed while the import was in flight.
			if (!$('#tradeTape')) return;
			state.tape = mountTradeTape(tapeEl, { mint: c.mint, network: NETWORK });
		}).catch(() => {
			if (tapeEl) tapeEl.innerHTML = '<div class="state" style="padding:16px 0">Trade feed unavailable.</div>';
		});
	}

	// Watch toggle
	const watchBtn = $('#drWatch');
	if (watchBtn) {
		watchBtn.addEventListener('click', () => {
			toggleOracleWatch(c.mint);
			const now = watchedMints().has(c.mint);
			watchBtn.textContent = now ? '★ Watching' : '☆ Watch';
			watchBtn.setAttribute('aria-pressed', String(now));
			// Reflect on the coin card in the feed grid if visible.
			const cardEl = document.querySelector(`#feedGrid .coin[data-mint="${CSS.escape(c.mint)}"]`);
			const cardWatchBtn = cardEl?.querySelector('.oc-watch');
			if (cardWatchBtn) {
				cardWatchBtn.textContent = now ? '★' : '☆';
				cardWatchBtn.classList.toggle('oc-watched', now);
				cardWatchBtn.setAttribute('aria-pressed', String(now));
			}
		});
	}

	// Copy mint address
	const copyMintBtn = $('#drCopyMint');
	if (copyMintBtn) {
		copyMintBtn.addEventListener('click', () => {
			navigator.clipboard.writeText(c.mint).then(() => {
				const orig = copyMintBtn.textContent;
				copyMintBtn.textContent = 'Copied!';
				setTimeout(() => { copyMintBtn.textContent = orig; }, 1800);
			}).catch(() => {});
		});
	}

	// Load related coins in same category (async — does not block drawer)
	if (c.category) loadRelatedCoins(c.mint, c.category);
}

async function loadRelatedCoins(mint, category) {
	const whosSec = $('#drBody')?.querySelector('.dr-sec:last-of-type');
	if (!whosSec || !$('#drBody')) return;

	const { ok, data } = await api(
		`/api/oracle/feed?network=${NETWORK}&category=${encodeURIComponent(category)}&limit=6&min_score=60`
	);
	if (!ok || !data?.items?.length) return;
	if (!$('#drBody')) return; // drawer closed while fetching

	const related = data.items.filter((it) => it.mint !== mint).slice(0, 3);
	if (!related.length) return;

	const TIER_META = { prime: { color: '#c084fc' }, strong: { color: '#34d399' }, lean: { color: '#fbbf24' }, watch: { color: '#94a3b8' }, avoid: { color: '#f87171' } };

	const html = `<div class="dr-sec" style="margin-top:16px">Related · ${esc(category)}</div>
		<div style="display:flex;flex-direction:column;gap:6px">
			${related.map((r) => {
				const tc = (TIER_META[r.tier] || TIER_META.watch).color;
				const imgEl = r.image_uri
					? `<img src="${esc(r.image_uri)}" alt="" style="width:28px;height:28px;border-radius:7px;object-fit:cover;flex:none;border:1px solid var(--line)" loading="lazy">`
					: `<div style="width:28px;height:28px;border-radius:7px;background:var(--line);display:grid;place-items:center;font:700 11px/1 var(--mono);color:var(--faint);flex:none">${esc((r.symbol||'?')[0])}</div>`;
				return `<button type="button" onclick="window.__oracleOpenRelated('${esc(r.mint)}')"
					style="display:flex;align-items:center;gap:10px;background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:8px 10px;cursor:pointer;text-align:left;width:100%;transition:background .12s"
					onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background='var(--panel)'">
					${imgEl}
					<span style="flex:1;min-width:0">
						<span style="font-weight:700;font-size:13px;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(r.symbol || r.mint.slice(0,8))}</span>
						<span style="font-size:11px;color:var(--muted)">${esc(r.name||'')}</span>
					</span>
					<span style="display:flex;flex-direction:column;align-items:flex-end;flex:none">
						<span style="font:700 14px/1 var(--mono);color:${tc}">${r.score}</span>
						<span class="tierpill tp-${esc(r.tier)}" style="margin-top:3px;padding:1px 5px;font-size:9px">${esc(r.tier)}</span>
					</span>
				</button>`;
			}).join('')}
		</div>`;

	// Insert before the "Who's in" section.
	const body = $('#drBody');
	if (!body) return;
	const whosSecEl = Array.from(body.querySelectorAll('.dr-sec')).find((el) => el.textContent.startsWith("Who's in"));
	if (whosSecEl) {
		whosSecEl.insertAdjacentHTML('beforebegin', html);
	} else {
		body.insertAdjacentHTML('beforeend', html);
	}
}

window.__oracleOpenRelated = (mint) => openCoin(mint);

function whoRow(w) {
	const title = ARCH_TITLE[w.label] || 'Unproven';
	const sub = [
		w.is_creator ? 'creator' : null,
		w.tag ? `@${w.tag}` : null,
		w.source === 'gmgn' ? 'gmgn-known' : (w.score != null ? `rep ${Math.round(w.score)}` : null),
		w.win_rate != null ? `${Math.round(w.win_rate)}% win` : null,
	].filter(Boolean).join(' · ');
	return `<div class="nwallet">
		<div class="nw-left">
			<span class="nw-addr"><span class="nlabel lb-${esc(w.label)}">${esc(title)}</span><a class="solscan" href="${solscan(w.wallet)}" target="_blank" rel="noopener">${esc(shortAddr(w.wallet))}</a></span>
			<span class="nw-sub">${esc(sub || '—')}</span>
		</div>
		<span class="nw-buy">${fmtSol(w.buy_sol)}</span>
	</div>`;
}

async function loadScoreHistory(mint) {
	const wrap = $('#scoreHistoryWrap');
	if (!wrap) return;
	const { ok, data } = await api(`/api/oracle/history?mint=${encodeURIComponent(mint)}&network=${NETWORK}&hours=48`);
	if (!ok || !data?.points?.length || data.points.length < 2) { wrap.innerHTML = ''; return; }
	wrap.innerHTML = renderSparkline(data.points, data.trend);
}

async function loadSentimentPulse(mint) {
	const wrap = $('#communityPulseWrap');
	if (!wrap) return;
	try {
		const res = await fetch('/api/social/sentiment-pulse', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ token: mint }),
			signal: AbortSignal.timeout(10000),
		});
		if (!res.ok) { if ($('#communityPulseWrap')) $('#communityPulseWrap').innerHTML = ''; return; }
		const d = await res.json();
		const el = $('#communityPulseWrap');
		if (!el) return;
		if (!d.ok || !d.overall || d.overall.count < 3) { el.innerHTML = ''; return; }
		const o = d.overall;
		const scoreColor = o.score >= 60 ? 'var(--up)' : o.score <= 40 ? 'var(--down)' : 'var(--muted)';
		const sentLabel = o.score >= 60 ? 'bullish' : o.score <= 40 ? 'bearish' : 'mixed';
		const sentChipCls = o.score >= 60 ? 'sm' : o.score <= 40 ? 'flag' : '';
		const exHtml = (o.examples || []).slice(0, 2).map(
			(ex) => `<div class="reason" style="font-size:11.5px;opacity:.75"><span class="rdot nar"></span><span>${esc(ex)}</span></div>`
		).join('');
		el.innerHTML = `
			<div class="dr-sec">Community pulse <span style="color:var(--faint);font-weight:400;font-size:10px">pump.fun · ${o.count} comments</span></div>
			<div class="coin-meta" style="margin-bottom:8px">
				<span class="chip ${sentChipCls}" style="color:${scoreColor}">${sentLabel} · ${o.score}</span>
			</div>
			<div class="str-grid">
				<div class="str-row">
					<span class="str-lbl">Positive</span>
					<div class="str-track"><div class="str-fill" style="width:${Math.round(o.posPct)}%;background:var(--up)"></div></div>
					<span class="str-val" style="color:var(--up)">${Math.round(o.posPct)}%</span>
				</div>
				<div class="str-row">
					<span class="str-lbl">Negative</span>
					<div class="str-track"><div class="str-fill" style="width:${Math.round(o.negPct)}%;background:var(--down)"></div></div>
					<span class="str-val" style="color:var(--down)">${Math.round(o.negPct)}%</span>
				</div>
				<div class="str-row">
					<span class="str-lbl">Neutral</span>
					<div class="str-track"><div class="str-fill" style="width:${Math.round(o.neuPct)}%;background:var(--muted)"></div></div>
					<span class="str-val" style="color:var(--muted)">${Math.round(o.neuPct)}%</span>
				</div>
			</div>
			${exHtml}`;
	} catch {
		const el = $('#communityPulseWrap');
		if (el) el.innerHTML = '';
	}
}

function renderSparkline(points, trend) {
	const W = 220; const H = 40; const PAD = 4;
	const scores = points.map((p) => Number(p.score));
	const min = Math.max(0, Math.min(...scores) - 5);
	const max = Math.min(100, Math.max(...scores) + 5);
	const range = max - min || 1;
	const n = scores.length;
	const xs = scores.map((_, i) => PAD + (i / (n - 1)) * (W - PAD * 2));
	const ys = scores.map((s) => PAD + (1 - (s - min) / range) * (H - PAD * 2));
	const d = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ');
	const trendColor = trend === 'rising' ? '#34d399' : trend === 'falling' ? '#f87171' : '#94a3b8';
	const trendArrow = trend === 'rising' ? '↑' : trend === 'falling' ? '↓' : '→';
	const lastScore = scores[n - 1];
	const firstScore = scores[0];
	const delta = lastScore - firstScore;
	const deltaStr = delta > 0 ? `+${delta}` : `${delta}`;
	return `<div style="display:flex;align-items:center;gap:8px;padding:8px 0 4px">
		<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="flex-shrink:0;overflow:visible" aria-label="Conviction history">
			<polyline points="${xs.map((x, i) => `${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ')}" fill="none" stroke="${trendColor}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.9"/>
			<circle cx="${xs[n-1].toFixed(1)}" cy="${ys[n-1].toFixed(1)}" r="2.5" fill="${trendColor}"/>
		</svg>
		<div style="font-size:11px;line-height:1.4;flex-shrink:0">
			<div style="color:${trendColor};font-weight:700;letter-spacing:.02em">${trendArrow} ${deltaStr} pts</div>
			<div style="color:var(--muted)">${points.length} readings · 48 h</div>
		</div>
	</div>`;
}

function closeDrawer() {
	const dr = $('#drawer'); dr.classList.remove('open'); dr.setAttribute('aria-hidden', 'true');
	// Tear down the trade tape so the PumpPortal SSE connection closes.
	state.tape?.destroy();
	state.tape = null;
	// Clear the mint param so the URL reflects the closed state.
	const url = new URL(location.href);
	if (url.searchParams.has('mint')) {
		url.searchParams.delete('mint');
		history.replaceState(null, '', url.toString());
	}
}

async function openWallet(wallet) {
	switchView('feed'); // close any drawer context; wallets open in drawer too
	const dr = $('#drawer');
	dr.classList.add('open'); dr.setAttribute('aria-hidden', 'false');
	$('#drTitle').textContent = shortAddr(wallet);
	$('#drBody').innerHTML = '<div class="state">Pulling track record…</div>';
	const { ok, data } = await api(`/api/oracle/wallet?address=${encodeURIComponent(wallet)}&network=${NETWORK}`);
	if (!ok || !data) { $('#drBody').innerHTML = '<div class="state">Could not load this wallet.</div>'; return; }
	const r = data.reputation; const a = data.archetype || {};
	$('#drTitle').innerHTML = `<span class="nlabel lb-${esc(a.label)}">${esc(a.title || 'Unproven')}</span> ${esc(shortAddr(wallet))}`;
	const recent = (data.recent || []).map((c) => `<div class="nwallet"><div class="nw-left"><span class="nw-addr">${esc(c.symbol || c.mint.slice(0, 6))} ${c.is_creator ? '<span class="nlabel lb-rugger">created</span>' : ''}</span><span class="nw-sub">${esc(c.category || '')}</span></div><span class="nw-buy">${fmtSol(c.buy_sol)}</span></div>`).join('') || '<div class="state">No recent coins recorded.</div>';
	$('#drBody').innerHTML = `
		<div style="font-size:13px;color:var(--muted);margin-bottom:14px">${esc(a.blurb || '')}</div>
		${r ? `<div class="pillars" style="grid-template-columns:repeat(2,1fr);gap:12px">
			${pillar('ped', 'Smart score', Math.round(r.score))}
			${pillar('str', 'Win rate', Math.round(r.win_rate))}
			${pillar('nar', 'Early win', Math.round(r.early_win_rate))}
			${pillar('mom', 'Dump rate', Math.round(r.dump_rate))}
		</div>
		<div class="coin-meta" style="margin-top:14px">
			<span class="chip">coins <b>${r.coins_traded ?? 0}</b></span>
			<span class="chip">early <b>${r.early_entries ?? 0}</b></span>
			<span class="chip sm">wins <b>${r.wins ?? 0}</b></span>
			<span class="chip flag">duds <b>${r.duds ?? 0}</b></span>
			${r.creator_count ? `<span class="chip">created <b>${r.creator_count}</b></span>` : ''}
		</div>` : '<div class="state">This wallet has no judged history yet.</div>'}
		<div class="dr-sec">Recent footprint</div>${recent}
		<div class="dr-actions" style="margin-top:16px">
			<a class="dr-act" href="/trader/${encodeURIComponent(wallet)}" rel="noopener">Trader profile ↗</a>
			<a class="dr-act" href="/trader/${encodeURIComponent(wallet)}#copy" rel="noopener" style="background:rgba(139,92,246,.18);border-color:rgba(139,92,246,.45)">Copy trades →</a>
			<a class="dr-act solscan" href="${solscan(wallet)}" target="_blank" rel="noopener">Solscan ↗</a>
		</div>
	`;
}

// ── agent arm panel ──────────────────────────────────────────────────────────
async function loadAgentPanel() {
	const body = $('#armBody');
	body.dataset.loaded = '1';
	body.innerHTML = '<div class="state">Loading your agents…</div>';
	const { ok, data } = await api('/api/agents');
	const agents = ok && data ? (data.agents || data.items || data || []) : [];
	state.agents = Array.isArray(agents) ? agents : [];
	if (!state.agents.length) {
		body.innerHTML = `<div class="state"><b>Sign in and create a 3D agent</b>Your agent needs its own custodial Solana wallet to act on conviction. Create one in the studio, then come back to arm it.
			<div style="margin-top:16px"><a class="btn" href="/create/studio">Create an agent →</a></div></div>`;
		return;
	}
	renderArmForm();
}

function renderArmForm() {
	const body = $('#armBody');
	const opts = state.agents.map((a) => `<option value="${esc(a.id)}">${esc(a.name || a.id)}</option>`).join('');
	body.innerHTML = `
		<div class="field"><label>Agent</label><select id="agSel">${opts}</select></div>
		<div class="row2">
			<div class="field"><label>Min conviction</label><select id="agMin">
				<option value="86">Prime only (≥86)</option>
				<option value="72" selected>Strong+ (≥72)</option>
				<option value="56">Lean+ (≥56)</option>
			</select></div>
			<div class="field"><label>Size / trade (SOL)</label><input id="agSize" type="number" min="0.001" step="0.01" value="0.05"></div>
		</div>
		<div class="row2">
			<div class="field"><label>Max daily (SOL)</label><input id="agDaily" type="number" min="0.01" step="0.05" value="0.5"></div>
			<div class="field"><label>Max open</label><input id="agOpen" type="number" min="1" step="1" value="5"></div>
		</div>
		<div class="field"><label>Only these narratives (none = any)</label>
			<div class="chips" id="agCats">${CATEGORIES.map((c) => `<button type="button" class="cchip" data-cat="${c}">${c}</button>`).join('')}</div>
		</div>
		<div class="toggle">
			<div class="t-lab"><b>Require smart money in</b><span>Only act if ≥1 proven wallet has bought</span></div>
			<div class="sw on" id="agSmart" role="switch" aria-checked="true"></div>
		</div>
		<div class="toggle">
			<div class="t-lab"><b>Scale by conviction</b><span id="agScaleSub">1.0× at min score → up to 1.5× at score 100</span></div>
			<div class="sw" id="agScale" role="switch" aria-checked="false"></div>
		</div>
		<div class="toggle">
			<div class="t-lab"><b>Mode</b><span id="agModeSub">Simulate — logs actions, spends nothing</span></div>
			<div class="sw live" id="agLive" role="switch" aria-checked="false"></div>
		</div>
		<div class="toggle">
			<div class="t-lab"><b id="agArmLab">Armed</b><span>Master switch for this agent</span></div>
			<div class="sw" id="agArm" role="switch" aria-checked="false"></div>
		</div>
		<div class="field" style="margin-top:12px">
			<label>Personal Telegram alerts <span class="chip sm" style="background:rgba(139,92,246,.15);color:#c084fc;border-color:rgba(139,92,246,.35)">optional</span></label>
			<div style="display:flex;gap:6px;align-items:center">
				<input id="agTelegram" type="text" placeholder="Your chat ID or @channel" autocomplete="off" style="font-size:12px;font-family:var(--mono,monospace);flex:1;min-width:0">
				<button id="agTgTest" class="btn sm" style="white-space:nowrap;flex-shrink:0" type="button">Send test</button>
			</div>
			<div id="agTgNote" style="display:none;margin-top:5px;font-size:11.5px;line-height:1.4"></div>
			<div class="field-hint">Chat <a href="https://t.me/three_ws_bot" target="_blank" rel="noopener">@three_ws_bot</a> on Telegram and send <code>/start</code> to get your chat ID. You'll receive a signal whenever a coin crosses your threshold.</div>
		</div>
		<button class="btn primary" id="agSave" style="margin-top:8px">Save configuration</button>
		<div class="note" id="agNote"></div>`;

	// toggles
	wireSwitch('#agSmart');
	wireSwitch('#agScale', (on) => {
		const sizeInput = $('#agSize');
		$('#agScaleSub').textContent = on
			? `${Number(sizeInput?.value || 0.05).toFixed(3)} SOL base → up to ${(Number(sizeInput?.value || 0.05) * 1.5).toFixed(3)} SOL at score 100`
			: '1.0× at min score → up to 1.5× at score 100';
	});
	wireSwitch('#agLive', (on) => { $('#agModeSub').textContent = on ? 'Live — real SOL from the agent wallet (capped)' : 'Simulate — logs actions, spends nothing'; $('#agLive').classList.toggle('on', on); });
	wireSwitch('#agArm');
	$('#agCats').addEventListener('click', (e) => { const b = e.target.closest('.cchip'); if (b) b.classList.toggle('on'); });
	$('#agSel').addEventListener('change', () => loadWatch($('#agSel').value));
	$('#agSave').addEventListener('click', saveWatch);
	$('#agTgTest').addEventListener('click', sendTelegramTest);

	state.agentId = state.agents[0].id;
	loadWatch(state.agentId);
}

function wireSwitch(sel, cb) {
	const el = $(sel);
	el.addEventListener('click', () => {
		const on = !el.classList.contains('on');
		el.classList.toggle('on', on);
		el.setAttribute('aria-checked', String(on));
		if (cb) cb(on);
	});
}

async function loadWatch(agentId) {
	state.agentId = agentId;
	const { ok, data } = await api(`/api/oracle/watch?agent_id=${encodeURIComponent(agentId)}&network=${NETWORK}`);
	const w = ok && data ? data.watch : null;
	state.watch = w;
	if (w) {
		$('#agMin').value = String(w.min_score >= 86 ? 86 : w.min_score >= 72 ? 72 : 56);
		$('#agSize').value = w.per_trade_sol ?? 0.05;
		$('#agDaily').value = w.max_daily_sol ?? 0.5;
		$('#agOpen').value = w.max_open ?? 5;
		setSwitch('#agSmart', w.require_smart_money !== false);
		setSwitch('#agScale', !!w.size_scaling);
		setSwitch('#agArm', !!w.armed);
		const live = w.mode === 'live'; setSwitch('#agLive', live);
		$('#agModeSub').textContent = live ? 'Live — real SOL from the agent wallet (capped)' : 'Simulate — logs actions, spends nothing';
		const base = Number(w.per_trade_sol) || 0.05;
		$('#agScaleSub').textContent = w.size_scaling
			? `${base.toFixed(3)} SOL base → up to ${(base * 1.5).toFixed(3)} SOL at score 100`
			: '1.0× at min score → up to 1.5× at score 100';
		const cats = new Set(w.categories || []);
		$$('#agCats .cchip').forEach((b) => b.classList.toggle('on', cats.has(b.dataset.cat)));
		$('#agTelegram').value = w.telegram_chat_id || '';
	}
	loadActions(agentId);
}

function setSwitch(sel, on) { const el = $(sel); el.classList.toggle('on', on); el.setAttribute('aria-checked', String(on)); }

async function saveWatch() {
	const btn = $('#agSave'); btn.disabled = true; btn.textContent = 'Saving…';
	const cats = $$('#agCats .cchip.on').map((b) => b.dataset.cat);
	const min = Number($('#agMin').value);
	const payload = {
		agent_id: state.agentId, network: NETWORK,
		armed: $('#agArm').classList.contains('on'),
		mode: $('#agLive').classList.contains('on') ? 'live' : 'simulate',
		min_score: min, min_tier: min >= 86 ? 'prime' : min >= 72 ? 'strong' : 'lean',
		categories: cats,
		per_trade_sol: Number($('#agSize').value) || 0.05,
		max_daily_sol: Number($('#agDaily').value) || 0.5,
		max_open: Number($('#agOpen').value) || 5,
		require_smart_money: $('#agSmart').classList.contains('on'),
		size_scaling: $('#agScale').classList.contains('on'),
		telegram_chat_id: ($('#agTelegram').value || '').trim() || null,
	};
	const { ok, data } = await api('/api/oracle/watch', {
		method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
	});
	btn.disabled = false; btn.textContent = 'Save configuration';
	const note = $('#agNote');
	if (ok && data?.watch) {
		const tgNote = data.watch.telegram_chat_id ? ' Telegram alerts active.' : '';
		note.className = 'note'; note.textContent = data.watch.armed ? `Armed in ${data.watch.mode} mode. Your agent is watching the stream.${tgNote}` : `Saved. Toggle "Armed" to start watching.${tgNote}`;
		loadActions(state.agentId);
	} else {
		note.className = 'note warn';
		note.textContent = data?.error?.message || 'Could not save — sign in and make sure you own this agent.';
	}
}

async function sendTelegramTest() {
	const chatId = ($('#agTelegram').value || '').trim();
	const note = $('#agTgNote');
	if (!chatId) {
		note.style.display = 'block';
		note.style.color = 'var(--warn, #fbbf24)';
		note.textContent = 'Enter your Telegram chat ID or @channel first.';
		return;
	}
	const btn = $('#agTgTest');
	btn.disabled = true; btn.textContent = 'Sending…';
	note.style.display = 'none';
	const { ok, data } = await api('/api/oracle/test-alert', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ agent_id: state.agentId, chat_id: chatId }),
	});
	btn.disabled = false; btn.textContent = 'Send test';
	note.style.display = 'block';
	if (ok && data?.ok) {
		note.style.color = 'var(--green, #34d399)';
		note.textContent = '✓ Test message delivered. Check Telegram.';
	} else {
		note.style.color = 'var(--warn, #fbbf24)';
		note.textContent = (data?.error || 'Delivery failed.') + (data?.hint ? ' ' + data.hint : '');
	}
}

async function loadActions(agentId) {
	const body = $('#actionsBody');
	const { ok, data } = await api(`/api/oracle/watch?agent_id=${encodeURIComponent(agentId)}&network=${NETWORK}`);
	const actions = ok && data ? (data.actions || []) : [];
	const s = (ok && data && data.summary) || null;

	const pnlSign = (v) => v >= 0 ? '+' : '';
	const statline = s && s.total ? `
		<div class="act-kpis">
			<div class="act-kpi"><span>Total</span><b>${s.total}</b></div>
			<div class="act-kpi"><span>Wins</span><b class="${s.wins > 0 ? 'up' : ''}">${s.wins}</b></div>
			<div class="act-kpi"><span>Losses</span><b class="${s.losses > 0 ? 'dn' : ''}">${s.losses}</b></div>
			<div class="act-kpi"><span>Win rate</span><b>${s.win_rate == null ? '—' : s.win_rate + '%'}</b></div>
			<div class="act-kpi"><span>Realized PnL</span><b class="${s.realized_pnl_sol >= 0 ? 'up' : 'dn'}">${pnlSign(s.realized_pnl_sol)}${fmtSol(s.realized_pnl_sol)}</b></div>
			${s.roi_pct != null ? `<div class="act-kpi"><span>ROI</span><b class="${s.roi_pct >= 0 ? 'up' : 'dn'}">${pnlSign(s.roi_pct)}${s.roi_pct}%</b></div>` : ''}
			${s.open > 0 ? `<div class="act-kpi"><span>Open</span><b>${s.open}</b></div>` : ''}
		</div>` : '';

	if (!actions.length) {
		body.innerHTML = `${statline}<div class="state">No actions yet — once armed, every buy lands here and gets graded against the outcome in real time.</div>`;
		return;
	}

	const rows = actions.map(actionRow).join('');
	body.innerHTML = `
		${statline}
		<div class="act-wrap">
			<table class="act-table">
				<thead><tr>
					<th>Coin</th><th>Tier</th><th>Conv.</th>
					<th>Size</th><th>Outcome</th><th>PnL</th><th>When</th>
				</tr></thead>
				<tbody>${rows}</tbody>
			</table>
		</div>`;
}

function actionRow(a) {
	const outcome = a.outcome || 'open';
	const outCls = outcome === 'win' ? 'up' : outcome === 'loss' ? 'dn' : '';
	const outLabel = outcome === 'win' ? `✓ Win${a.peak_multiple ? ` · ${Number(a.peak_multiple).toFixed(1)}×` : ''}` : outcome === 'loss' ? '✗ Loss' : 'Open';
	const pnl = a.realized_pnl_sol != null ? `${Number(a.realized_pnl_sol) >= 0 ? '+' : ''}${fmtSol(a.realized_pnl_sol)}` : '—';
	const pnlCls = a.realized_pnl_sol != null ? (Number(a.realized_pnl_sol) >= 0 ? 'up' : 'dn') : '';
	const modeBadge = a.mode === 'live' ? '<span class="act-live">live</span>' : '<span class="act-sim">sim</span>';

	// For open positions show current conviction score alongside entry, with delta.
	let convCell;
	if (outcome === 'open' && a.current_score != null) {
		const entry = Number(a.conviction) || 0;
		const cur = Number(a.current_score);
		const delta = cur - entry;
		const deltaCls = delta > 0 ? 'up' : delta < 0 ? 'dn' : '';
		const deltaStr = delta !== 0 ? `<span class="act-delta ${deltaCls}">${delta > 0 ? '+' : ''}${delta}</span>` : '';
		const curCls = tierPill(a.current_tier);
		convCell = `<span class="${curCls}" style="padding:1px 4px;font-size:11px">${cur}</span>${deltaStr}`;
	} else {
		convCell = a.conviction ?? '—';
	}

	return `<tr class="act-row" data-outcome="${esc(outcome)}">
		<td class="act-coin"><a href="https://pump.fun/coin/${esc(a.mint)}" target="_blank" rel="noopener">${esc(a.symbol || a.mint.slice(0, 6))}</a> ${modeBadge}</td>
		<td><span class="tierpill ${tierPill(a.tier)}">${esc(a.tier || '—')}</span></td>
		<td class="act-mono">${convCell}</td>
		<td class="act-mono">${fmtSol(a.size_sol)}</td>
		<td class="act-mono ${outCls}">${outLabel}</td>
		<td class="act-mono ${pnlCls}">${pnl}</td>
		<td class="act-when" title="${esc(a.acted_at || '')}">${ago(a.acted_at)} ago</td>
	</tr>`;
}

document.addEventListener('DOMContentLoaded', boot);
