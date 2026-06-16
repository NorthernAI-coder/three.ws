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
		state.tier = b.dataset.tier; loadFeed();
	});
	$('#catSel').addEventListener('change', (e) => { state.category = e.target.value; loadFeed(); });
	$('#minSel').addEventListener('change', (e) => { state.minScore = Number(e.target.value) || 0; loadFeed(); });
	const MINT_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
	$('#mintSearch').addEventListener('keydown', (e) => {
		if (e.key !== 'Enter') return;
		const v = e.target.value.trim();
		if (MINT_RE.test(v)) { openCoin(v); e.target.blur(); }
		else if (v) { e.target.style.borderColor = 'var(--down)'; setTimeout(() => { e.target.style.borderColor = ''; }, 900); }
	});
	$('#labelSeg').addEventListener('click', (e) => {
		const b = e.target.closest('button'); if (!b) return;
		$$('#labelSeg button').forEach((x) => x.classList.toggle('on', x === b));
		state.label = b.dataset.label; loadWallets();
	});
	// drawer close
	$$('#drawer [data-close]').forEach((el) => el.addEventListener('click', closeDrawer));
	document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawer(); });

	loadFeed();
	openStream();

	// If the page was opened with ?mint= (e.g. from a shared link or Telegram alert),
	// open that coin's drawer immediately after the feed loads.
	const initialMint = new URLSearchParams(location.search).get('mint');
	const MINT_RE2 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
	if (initialMint && MINT_RE2.test(initialMint)) openCoin(initialMint);
}

function switchView(view) {
	state.view = view;
	$$('.tab').forEach((t) => t.classList.toggle('on', t.dataset.view === view));
	$$('.view').forEach((v) => v.classList.toggle('on', v.id === `view-${view}`));
	if (view === 'wallets' && !$('#walletWrap').dataset.loaded) loadWallets();
	if (view === 'edge' && !$('#edgeWrap').dataset.loaded) loadEdge();
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
	const items = [...state.feed.values()].sort((a, b) => b.score - a.score);
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
	$('#stScored').textContent = data.count ?? items.length;
	$('#stStrong').textContent = items.filter((i) => i.tier === 'strong' || i.tier === 'prime').length;
	$('#stSmart').textContent = items.reduce((s, i) => s + (i.smart_wallet_count || 0), 0);
	$('#stUpdated').textContent = 'now';
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
	return `<button class="lrow" data-wallet="${esc(w.wallet)}">
		<span class="lrank ${i < 3 ? 'top' : ''}">${i + 1}</span>
		<span class="lw"><span class="nlabel lb-${esc(w.label)}">${esc(a.title)}</span><span class="lw-addr">${esc(shortAddr(w.wallet))}</span></span>
		<span class="lstat colhide"><b>${fmtPct(w.win_rate)}</b></span>
		<span class="lstat"><b>${fmtPct(w.early_win_rate)}</b></span>
		<span class="lscore">${Math.round(w.score)}</span>
	</button>`;
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
			<button class="dr-act dr-watch" id="drWatch" data-mint="${esc(c.mint)}" type="button" aria-pressed="${watchedMints().has(c.mint)}">${watchedMints().has(c.mint) ? '★ Watching' : '☆ Watch'}</button>
			<a class="dr-act dr-share" href="${tweetConviction(c)}" target="_blank" rel="noopener" title="Share conviction on X">Share ↗</a>
			${c.structure_cap != null && c.structure_cap < 60 ? `<span class="note warn">structural cap ${c.structure_cap}</span>` : ''}
		</div>
		${narr ? `<div class="dr-sec">Narrative</div><div style="font-size:13.5px;color:var(--ink)">${esc(narr.narrative || '')}</div>
			<div class="coin-meta" style="margin-top:8px"><span class="chip cat">${esc(narr.category)}</span><span class="chip">virality <b>${narr.virality ?? '—'}</b></span><span class="chip">${esc(narr.source || '')}</span></div>` : ''}
		<div class="dr-sec">Why this score</div>${reasons}
		${structurePanel(d.components?.structure)}
		<div class="dr-sec">Who's in <span style="color:var(--faint)">(${(d.whos_in || []).length})</span></div>${whos}
		${out ? `<div class="dr-sec">Outcome</div><div class="coin-meta">
			<span class="chip ${out.graduated ? 'sm' : out.rugged ? 'flag' : ''}">${out.graduated ? 'graduated ✓' : out.rugged ? 'rugged ✕' : 'live'}</span>
			${out.ath_multiple ? `<span class="chip">ATH <b>${Number(out.ath_multiple).toFixed(1)}×</b></span>` : ''}</div>` : ''}
		<div class="dr-sec">Live trades</div>
		<div id="tradeTape" class="trade-tape"></div>
	`;

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
}

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
		<div style="margin-top:14px"><a class="solscan" href="${solscan(wallet)}" target="_blank" rel="noopener">View on solscan ↗</a></div>
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
			<div class="t-lab"><b>Mode</b><span id="agModeSub">Simulate — logs actions, spends nothing</span></div>
			<div class="sw live" id="agLive" role="switch" aria-checked="false"></div>
		</div>
		<div class="toggle">
			<div class="t-lab"><b id="agArmLab">Armed</b><span>Master switch for this agent</span></div>
			<div class="sw" id="agArm" role="switch" aria-checked="false"></div>
		</div>
		<button class="btn primary" id="agSave" style="margin-top:8px">Save configuration</button>
		<div class="note" id="agNote"></div>`;

	// toggles
	wireSwitch('#agSmart');
	wireSwitch('#agLive', (on) => { $('#agModeSub').textContent = on ? 'Live — real SOL from the agent wallet (capped)' : 'Simulate — logs actions, spends nothing'; $('#agLive').classList.toggle('on', on); });
	wireSwitch('#agArm');
	$('#agCats').addEventListener('click', (e) => { const b = e.target.closest('.cchip'); if (b) b.classList.toggle('on'); });
	$('#agSel').addEventListener('change', () => loadWatch($('#agSel').value));
	$('#agSave').addEventListener('click', saveWatch);

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
		setSwitch('#agArm', !!w.armed);
		const live = w.mode === 'live'; setSwitch('#agLive', live);
		$('#agModeSub').textContent = live ? 'Live — real SOL from the agent wallet (capped)' : 'Simulate — logs actions, spends nothing';
		const cats = new Set(w.categories || []);
		$$('#agCats .cchip').forEach((b) => b.classList.toggle('on', cats.has(b.dataset.cat)));
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
	};
	const { ok, data } = await api('/api/oracle/watch', {
		method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
	});
	btn.disabled = false; btn.textContent = 'Save configuration';
	const note = $('#agNote');
	if (ok && data?.watch) {
		note.className = 'note'; note.textContent = data.watch.armed ? `Armed in ${data.watch.mode} mode. Your agent is watching the stream.` : 'Saved. Toggle "Armed" to start watching.';
		loadActions(state.agentId);
	} else {
		note.className = 'note warn';
		note.textContent = data?.error?.message || 'Could not save — sign in and make sure you own this agent.';
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
	return `<tr class="act-row" data-outcome="${esc(outcome)}">
		<td class="act-coin"><a href="https://pump.fun/coin/${esc(a.mint)}" target="_blank" rel="noopener">${esc(a.symbol || a.mint.slice(0, 6))}</a> ${modeBadge}</td>
		<td><span class="tierpill ${tierPill(a.tier)}">${esc(a.tier || '—')}</span></td>
		<td class="act-mono">${a.conviction ?? '—'}</td>
		<td class="act-mono">${fmtSol(a.size_sol)}</td>
		<td class="act-mono ${outCls}">${outLabel}</td>
		<td class="act-mono ${pnlCls}">${pnl}</td>
		<td class="act-when" title="${esc(a.acted_at || '')}">${ago(a.acted_at)} ago</td>
	</tr>`;
}

document.addEventListener('DOMContentLoaded', boot);
