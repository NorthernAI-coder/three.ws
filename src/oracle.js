// Oracle — the fused pump.fun conviction war room.
//
// Reads /api/oracle/* (feed, coin, wallet, stream, watch). Every surface
// degrades gracefully: if the backend isn't reachable yet (it deploys with the
// migration), the page shows an honest "warming up" state instead of breaking.
//
// Views: live conviction feed (with SSE), wallet reputation leaderboard,
// conviction-tier edge backtest, and the agent action-loop arm panel.

const NETWORK = 'mainnet';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

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

const CATEGORIES = ['meme', 'tech', 'ai', 'culture', 'community', 'political', 'news', 'animal', 'celebrity', 'utility', 'unknown'];
const ARCH_TITLE = {
	smart_money: 'Smart Money', sniper: 'Sniper', dumper: 'Dumper', rugger: 'Rugger',
	fresh: 'Fresh', neutral: 'Neutral', unproven: 'Unproven',
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
}

function switchView(view) {
	state.view = view;
	$$('.tab').forEach((t) => t.classList.toggle('on', t.dataset.view === view));
	$$('.view').forEach((v) => v.classList.toggle('on', v.id === `view-${view}`));
	if (view === 'wallets' && !$('#walletWrap').dataset.loaded) loadWallets();
	if (view === 'edge' && !$('#edgeWrap').dataset.loaded) loadEdge();
	if (view === 'agent' && !$('#armBody').dataset.loaded) loadAgentPanel();
}

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
	$('#feedGrid').innerHTML = items.map(coinCard).join('');
	$$('#feedGrid .coin').forEach((c) => c.addEventListener('click', () => openCoin(c.dataset.mint)));
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

function coinCard(it) {
	const p = it.pillars || {};
	const img = it.image_uri
		? `<img class="coin-img" src="${esc(it.image_uri)}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'coin-img',textContent:'${esc((it.symbol || '?')[0])}'}))">`
		: `<div class="coin-img">${esc((it.symbol || '?')[0])}</div>`;
	const badges = (it.badges || []).map((b) => {
		const cls = b === 'smart-money' ? 'sm' : b === 'structure-flag' ? 'flag' : b === 'news' ? 'news' : '';
		const txt = b === 'structure-flag' ? 'structure ⚑' : b;
		return `<span class="chip ${cls}">${esc(txt)}</span>`;
	}).join('');
	return `<button class="coin ${tierClass(it.tier)}" data-mint="${esc(it.mint)}">
		<div class="coin-top">
			${img}
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
		</div>
	</button>`;
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
function cacheBacktest(bt) { _backtest = bt; if ($('#edgeWrap').dataset.loaded) renderEdge(); }

async function loadEdge() {
	const wrap = $('#edgeWrap');
	wrap.dataset.loaded = '1';
	if (!_backtest) {
		const { data } = await api(`/api/oracle/feed?network=${NETWORK}&limit=1`);
		_backtest = data?.backtest || [];
	}
	renderEdge();
}

function renderEdge() {
	const wrap = $('#edgeWrap');
	const rows = (_backtest || []).filter((r) => r.scored > 0);
	if (!rows.length) {
		wrap.innerHTML = `<div class="state"><b>The edge is still proving itself</b>Win-rate by tier appears once Oracle has scored coins that have since resolved to an outcome (graduated or not). This is intentionally honest — no backfilled numbers.</div>`;
		return;
	}
	wrap.innerHTML = `
		<div class="ehead"><span>Tier</span><span>Graduation rate</span><span class="colhide">Resolved</span><span>Avg ATH×</span><span>Scored</span></div>
		${rows.map(edgeRow).join('')}`;
}

function edgeRow(r) {
	const grad = r.grad_rate ?? 0;
	return `<div class="erow">
		<span><span class="tierpill ${tierPill(r.tier)}">${esc(r.tier)}</span></span>
		<span><div class="gradbar"><i style="width:${grad}%"></i></div><span class="lstat" style="text-align:left"><b>${r.grad_rate == null ? '—' : grad + '%'}</b></span></span>
		<span class="lstat colhide">${r.resolved}</span>
		<span class="lstat"><b>${r.avg_ath_multiple ? r.avg_ath_multiple.toFixed(1) + '×' : '—'}</b></span>
		<span class="lstat">${r.scored}</span>
	</div>`;
}

// ── coin drawer ──────────────────────────────────────────────────────────────
async function openCoin(mint) {
	const dr = $('#drawer');
	dr.classList.add('open'); dr.setAttribute('aria-hidden', 'false');
	$('#drTitle').textContent = 'Loading…';
	$('#drBody').innerHTML = '<div class="state">Reading the order book…</div>';
	const { ok, data } = await api(`/api/oracle/coin?mint=${encodeURIComponent(mint)}&network=${NETWORK}`);
	if (!ok || !data || !data.conviction) {
		$('#drTitle').textContent = 'Not observed yet';
		$('#drBody').innerHTML = `<div class="state"><b>This launch hasn't been scored</b>Oracle scores coins as they surface on pump.fun. If it's brand new, it'll appear here within moments.</div>`;
		return;
	}
	renderDrawer(data);
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
		<div style="display:flex;gap:14px;margin:14px 0 2px">
			<a class="solscan" href="${pumpUrl(c.mint)}" target="_blank" rel="noopener">pump.fun ↗</a>
			<a class="solscan" href="${solscan(c.mint)}" target="_blank" rel="noopener">solscan ↗</a>
			${c.structure_cap != null && c.structure_cap < 60 ? `<span class="note warn">structural cap ${c.structure_cap}</span>` : ''}
		</div>
		${narr ? `<div class="dr-sec">Narrative</div><div style="font-size:13.5px;color:var(--ink)">${esc(narr.narrative || '')}</div>
			<div class="coin-meta" style="margin-top:8px"><span class="chip cat">${esc(narr.category)}</span><span class="chip">virality <b>${narr.virality ?? '—'}</b></span><span class="chip">${esc(narr.source || '')}</span></div>` : ''}
		<div class="dr-sec">Why this score</div>${reasons}
		<div class="dr-sec">Who's in <span style="color:var(--faint)">(${(d.whos_in || []).length})</span></div>${whos}
		${out ? `<div class="dr-sec">Outcome</div><div class="coin-meta">
			<span class="chip ${out.graduated ? 'sm' : out.rugged ? 'flag' : ''}">${out.graduated ? 'graduated ✓' : out.rugged ? 'rugged ✕' : 'live'}</span>
			${out.ath_multiple ? `<span class="chip">ATH <b>${Number(out.ath_multiple).toFixed(1)}×</b></span>` : ''}</div>` : ''}
	`;
}

function whoRow(w) {
	const title = ARCH_TITLE[w.label] || 'Unproven';
	const sub = [
		w.is_creator ? 'creator' : null,
		w.score != null ? `rep ${Math.round(w.score)}` : null,
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
	if (!actions.length) {
		body.innerHTML = '<div class="state">No actions yet. Once armed, your agent\'s moves will appear here and get graded against outcomes.</div>';
		return;
	}
	body.innerHTML = `<div class="lwrap">${actions.map(actionRow).join('')}</div>`;
}

function actionRow(a) {
	const cls = a.outcome === 'win' ? 'sm' : a.outcome === 'loss' ? 'flag' : '';
	return `<div class="nwallet" style="padding:11px 14px">
		<div class="nw-left">
			<span class="nw-addr">${esc(a.symbol || a.mint.slice(0, 6))} <span class="tierpill ${tierPill(a.tier)}">${esc(a.tier || '')}</span> <span class="chip" style="padding:3px 6px">${esc(a.mode)}</span></span>
			<span class="nw-sub">conviction ${a.conviction ?? '—'} · ${esc(a.status)} · ${ago(a.acted_at)} ago${a.reason ? ' · ' + esc(a.reason) : ''}</span>
		</div>
		<span class="nw-buy ${cls ? 'chip ' + cls : ''}">${a.peak_multiple ? Number(a.peak_multiple).toFixed(1) + '×' : fmtSol(a.size_sol)}</span>
	</div>`;
}

document.addEventListener('DOMContentLoaded', boot);
