// Arm your agent — standalone automation setup (the trading-bot config surface).
// Reuses the Oracle watch API: /api/agents, /api/oracle/watch, /api/oracle/test-alert.
// Self-contained: no imports from oracle.js so this page stands on its own.

const NETWORK = 'mainnet';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const CATEGORIES = ['meme', 'tech', 'ai', 'culture', 'community', 'political', 'news', 'animal', 'celebrity', 'utility', 'unknown'];

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtSol = (n) => (n == null ? '—' : `${Number(n) < 0.01 && Number(n) > 0 ? Number(n).toFixed(4) : Number(n).toFixed(2)}◎`);
const tierPill = (t) => `tp-${t || 'avoid'}`;
function ago(ts) {
	if (!ts) return '—';
	const s = Math.max(0, (Date.now() - new Date(ts).getTime()) / 1000);
	if (s < 60) return `${Math.floor(s)}s`;
	if (s < 3600) return `${Math.floor(s / 60)}m`;
	if (s < 86400) return `${Math.floor(s / 3600)}h`;
	return `${Math.floor(s / 86400)}d`;
}

const state = { agents: [], agentId: null, watch: null, minScore: 72, wallet: null, feed: [], feedAt: null, edge: null };
let feedTimer = null;

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

// ── boot ──────────────────────────────────────────────────────────────────────
async function boot() {
	wireStaticControls();
	showSkeletons();
	const { ok, data } = await api('/api/agents');
	const agents = ok && data ? (data.agents || data.items || data || []) : [];
	state.agents = Array.isArray(agents) ? agents : [];

	if (!state.agents.length) {
		$('#setup').style.display = 'none';
		$('#statsStrip').style.display = 'none';
		$('#ledgerCard').style.display = 'none';
		$('.layout').style.display = 'none';
		$('#emptyState').style.display = 'block';
		return;
	}

	const sel = $('#agentSel');
	sel.innerHTML = state.agents.map((a) => `<option value="${esc(a.id)}">${esc(a.name || a.id)}</option>`).join('');
	sel.addEventListener('change', () => loadWatch(sel.value));
	state.agentId = state.agents[0].id;

	loadEdge();        // 30-day proof-of-edge for the conviction bar (global)
	startFeedLoop();   // live "clearing your bar" preview (global, polls)
	loadWatch(state.agentId);
}

// Skeleton placeholders so nothing renders as a dead "—" while real data loads.
function showSkeletons() {
	['#statWin', '#statPnl', '#statOpen', '#statTotal'].forEach((id) => {
		const el = $(id); el.classList.add('sk'); el.textContent = '00%';
	});
	$('#edgeReadout').innerHTML = '<div class="e-note">Loading 30-day track record for this bar…</div>';
	$('#qualBody').innerHTML = '<div class="qual-empty">Reading the live conviction stream…</div>';
	$('#ledgerBody').innerHTML = skeletonLedger();
}

function skeletonLedger() {
	const row = `<div style="display:flex;gap:10px;padding:11px 0;border-bottom:1px solid rgba(255,255,255,0.04)">
		<span class="sk" style="height:13px;flex:1"></span><span class="sk" style="height:13px;width:42px"></span><span class="sk" style="height:13px;width:50px"></span></div>`;
	return row.repeat(4);
}

// Controls that exist in the static markup (segmented + toggles + chips + buttons).
function wireStaticControls() {
	// narrative chips
	$('#catChips').innerHTML = CATEGORIES.map((c) => `<button type="button" class="cchip" data-cat="${esc(c)}">${esc(c)}</button>`).join('');
	$('#catChips').addEventListener('click', (e) => {
		const b = e.target.closest('.cchip');
		if (b) { b.classList.toggle('on'); markDirty(); renderQualifying(); }
	});

	// min-conviction segmented
	$('#convSeg').addEventListener('click', (e) => {
		const b = e.target.closest('button[data-min]');
		if (!b) return;
		$$('#convSeg button').forEach((x) => x.classList.toggle('on', x === b));
		state.minScore = Number(b.dataset.min);
		markDirty();
		renderEdge();
		renderQualifying();
	});

	// mode segmented (simulate / live)
	$('#modeSeg').addEventListener('click', (e) => {
		const b = e.target.closest('button[data-mode]');
		if (!b) return;
		const live = b.dataset.mode === 'live';
		$$('#modeSeg button').forEach((x) => x.classList.toggle('on', x === b));
		$('#modeSeg').classList.toggle('live-on', live);
		updateArmStatus();
		markDirty();
	});

	wireSwitch('#smartToggle', renderQualifying);
	wireSwitch('#scaleToggle', () => { renderScaleSub(); renderQualifying(); });
	wireSwitch('#armToggle', updateArmStatus);

	['#fSize', '#fDaily', '#fOpen'].forEach((s) => $(s).addEventListener('input', () => {
		renderScaleSub(); renderRisk(); renderWalletRunway(); renderQualifying(); markDirty();
	}));

	$('#saveBtn').addEventListener('click', saveWatch);
	$('#tgTest').addEventListener('click', sendTelegramTest);
	$('#tgInput').addEventListener('input', markDirty);
}

function wireSwitch(sel, cb) {
	const el = $(sel);
	el.addEventListener('click', () => {
		const on = !el.classList.contains('on');
		el.classList.toggle('on', on);
		el.setAttribute('aria-checked', String(on));
		markDirty();
		if (cb) cb(on);
	});
}
function setSwitch(sel, on) { const el = $(sel); el.classList.toggle('on', !!on); el.setAttribute('aria-checked', String(!!on)); }
function isOn(sel) { return $(sel).classList.contains('on'); }

function markDirty() {
	const btn = $('#saveBtn');
	if (btn.dataset.dirty === '1') return;
	btn.dataset.dirty = '1';
	btn.classList.add('dirty');
	$('#saveNote').textContent = '';
}

// ── derived UI ────────────────────────────────────────────────────────────────
function modeIsLive() { return $('#modeSeg').classList.contains('live-on'); }

function updateArmStatus() {
	const armed = isOn('#armToggle');
	const live = modeIsLive();
	const dot = $('#armStatusDot');
	const lab = $('#armStatusLab');
	const sub = $('#armStatusSub');
	dot.className = 'arm-dot ' + (armed ? (live ? 'live' : 'sim') : 'off');
	if (!armed) {
		lab.textContent = 'Disarmed';
		sub.textContent = 'Your agent is idle. Flip the switch to start watching the conviction stream.';
	} else if (live) {
		lab.textContent = 'Armed · Live';
		sub.textContent = 'Spending real SOL from the agent wallet when a coin clears your bar — capped by your limits.';
	} else {
		lab.textContent = 'Armed · Simulate';
		sub.textContent = 'Logging every play it would take, risk-free. Outcomes get graded so you can trust it before going live.';
	}
}

function renderScaleSub() {
	const base = Number($('#fSize').value) || 0.05;
	$('#scaleSub').textContent = isOn('#scaleToggle')
		? `${base.toFixed(3)} SOL at your floor → up to ${(base * 1.5).toFixed(3)} SOL at score 100`
		: 'Off — every qualifying play uses the same size';
}

function renderRisk() {
	const size = Number($('#fSize').value) || 0;
	const daily = Number($('#fDaily').value) || 0;
	const open = Number($('#fOpen').value) || 0;
	const trades = size > 0 ? Math.floor(daily / size) : 0;
	$('#riskSummary').textContent = size > 0 && daily > 0
		? `≈ ${trades} ${trades === 1 ? 'buy' : 'buys'}/day max · up to ${fmtSol(daily)} deployed · ${open} position${open === 1 ? '' : 's'} open at once`
		: 'Set a per-trade size and daily cap to see your exposure.';
}

// ── load current config ───────────────────────────────────────────────────────
async function loadWatch(agentId) {
	state.agentId = agentId;
	$('#saveNote').textContent = '';
	const { ok, data } = await api(`/api/oracle/watch?agent_id=${encodeURIComponent(agentId)}&network=${NETWORK}`);
	const w = ok && data ? data.watch : null;
	state.watch = w;

	const min = w ? (w.min_score >= 86 ? 86 : w.min_score >= 72 ? 72 : 56) : 72;
	state.minScore = min;
	$$('#convSeg button').forEach((b) => b.classList.toggle('on', Number(b.dataset.min) === min));

	$('#fSize').value = w?.per_trade_sol ?? 0.05;
	$('#fDaily').value = w?.max_daily_sol ?? 0.5;
	$('#fOpen').value = w?.max_open ?? 5;

	setSwitch('#smartToggle', w ? w.require_smart_money !== false : true);
	setSwitch('#scaleToggle', !!w?.size_scaling);
	setSwitch('#armToggle', !!w?.armed);

	const live = w?.mode === 'live';
	$$('#modeSeg button').forEach((b) => b.classList.toggle('on', (b.dataset.mode === 'live') === live));
	$('#modeSeg').classList.toggle('live-on', live);

	const cats = new Set(w?.categories || []);
	$$('#catChips .cchip').forEach((b) => b.classList.toggle('on', cats.has(b.dataset.cat)));
	$('#tgInput').value = w?.telegram_chat_id || '';

	renderScaleSub();
	renderRisk();
	updateArmStatus();
	renderEdge();
	renderQualifying();
	$('#saveBtn').dataset.dirty = '0';
	$('#saveBtn').classList.remove('dirty');

	loadWallet(agentId);
	loadActions(agentId);
}

async function saveWatch() {
	const btn = $('#saveBtn');
	btn.disabled = true; btn.textContent = 'Saving…';
	const cats = $$('#catChips .cchip.on').map((b) => b.dataset.cat);
	const min = state.minScore;
	const payload = {
		agent_id: state.agentId, network: NETWORK,
		armed: isOn('#armToggle'),
		mode: modeIsLive() ? 'live' : 'simulate',
		min_score: min, min_tier: min >= 86 ? 'prime' : min >= 72 ? 'strong' : 'lean',
		categories: cats,
		per_trade_sol: Number($('#fSize').value) || 0.05,
		max_daily_sol: Number($('#fDaily').value) || 0.5,
		max_open: Number($('#fOpen').value) || 5,
		require_smart_money: isOn('#smartToggle'),
		size_scaling: isOn('#scaleToggle'),
		telegram_chat_id: ($('#tgInput').value || '').trim() || null,
	};
	const { ok, data } = await api('/api/oracle/watch', {
		method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
	});
	btn.disabled = false; btn.textContent = 'Save configuration';
	const note = $('#saveNote');
	if (ok && data?.watch) {
		state.watch = data.watch;
		btn.dataset.dirty = '0'; btn.classList.remove('dirty');
		const tg = data.watch.telegram_chat_id ? ' Telegram alerts active.' : '';
		note.className = 'save-note ok';
		note.textContent = data.watch.armed
			? `✓ Armed in ${data.watch.mode} mode — your agent is watching the stream.${tg}`
			: `✓ Saved. Flip “Armed” when you’re ready to start watching.${tg}`;
		// reflect any server-side clamping
		$('#fSize').value = data.watch.per_trade_sol;
		$('#fDaily').value = data.watch.max_daily_sol;
		$('#fOpen').value = data.watch.max_open;
		renderRisk();
		loadActions(state.agentId);
	} else {
		note.className = 'save-note warn';
		note.textContent = data?.error?.message || 'Could not save — sign in and make sure you own this agent.';
	}
}

async function sendTelegramTest() {
	const chatId = ($('#tgInput').value || '').trim();
	const note = $('#tgNote');
	note.style.display = 'block';
	if (!chatId) {
		note.className = 'tg-note warn';
		note.textContent = 'Enter your Telegram chat ID or @channel first.';
		return;
	}
	const btn = $('#tgTest');
	btn.disabled = true; btn.textContent = 'Sending…';
	const { ok, data } = await api('/api/oracle/test-alert', {
		method: 'POST', headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ agent_id: state.agentId, chat_id: chatId }),
	});
	btn.disabled = false; btn.textContent = 'Send test';
	if (ok && data?.ok) {
		note.className = 'tg-note ok';
		note.textContent = '✓ Test message delivered. Check Telegram.';
	} else {
		note.className = 'tg-note warn';
		note.textContent = (data?.error || 'Delivery failed.') + (data?.hint ? ' ' + data.hint : '');
	}
}

// ── activity ledger ───────────────────────────────────────────────────────────
async function loadActions(agentId) {
	const body = $('#ledgerBody');
	const { ok, data } = await api(`/api/oracle/watch?agent_id=${encodeURIComponent(agentId)}&network=${NETWORK}`);
	const actions = ok && data ? (data.actions || []) : [];
	const s = (ok && data && data.summary) || null;

	// top stat strip
	const setStat = (id, val, cls) => { const el = $(id); el.textContent = val; el.className = 'stat-val' + (cls ? ' ' + cls : ''); };
	if (s && s.total) {
		setStat('#statWin', s.win_rate == null ? '—' : s.win_rate + '%');
		setStat('#statPnl', `${s.realized_pnl_sol >= 0 ? '+' : ''}${fmtSol(s.realized_pnl_sol)}`, s.realized_pnl_sol >= 0 ? 'up' : 'dn');
		setStat('#statOpen', String(s.open ?? 0));
		setStat('#statTotal', String(s.total));
	} else {
		['#statWin', '#statPnl', '#statOpen', '#statTotal'].forEach((id) => setStat(id, '—'));
	}

	if (!actions.length) {
		body.innerHTML = `<div class="ledger-empty">No actions yet — once armed, every buy lands here and gets graded against the outcome in real time.</div>`;
		return;
	}
	const rows = actions.map(actionRow).join('');
	body.innerHTML = `
		<div class="act-wrap">
			<table class="act-table">
				<thead><tr>
					<th scope="col">Coin</th><th scope="col">Tier</th><th scope="col">Conv.</th>
					<th scope="col">Size</th><th scope="col">Outcome</th><th scope="col">PnL</th><th scope="col">When</th>
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

	let convCell;
	if (outcome === 'open' && a.current_score != null) {
		const entry = Number(a.conviction) || 0;
		const cur = Number(a.current_score);
		const delta = cur - entry;
		const deltaCls = delta > 0 ? 'up' : delta < 0 ? 'dn' : '';
		const deltaStr = delta !== 0 ? `<span class="act-delta ${deltaCls}">${delta > 0 ? '+' : ''}${delta}</span>` : '';
		convCell = `<span class="${tierPill(a.current_tier)}" style="padding:1px 4px;font-size:11px">${cur}</span>${deltaStr}`;
	} else {
		convCell = a.conviction ?? '—';
	}

	return `<tr class="act-row" data-outcome="${esc(outcome)}">
		<td class="act-coin"><a href="https://pump.fun/coin/${esc(a.mint)}" target="_blank" rel="noopener">${esc(a.symbol || (a.mint || '').slice(0, 6))}</a> ${modeBadge}</td>
		<td><span class="tierpill ${tierPill(a.tier)}">${esc(a.tier || '—')}</span></td>
		<td class="act-mono">${convCell}</td>
		<td class="act-mono">${fmtSol(a.size_sol)}</td>
		<td class="act-mono ${outCls}">${outLabel}</td>
		<td class="act-mono ${pnlCls}">${pnl}</td>
		<td class="act-when" title="${esc(a.acted_at || '')}">${ago(a.acted_at)} ago</td>
	</tr>`;
}

document.addEventListener('DOMContentLoaded', boot);
