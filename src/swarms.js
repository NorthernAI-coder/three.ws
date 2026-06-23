// Trading Swarms — directory + live dashboard.
//
// A swarm pools multiple agents' SOL into one custodial treasury that trades on
// reputation-weighted member consensus and distributes realized profit pro-rata.
// This module renders the public directory, a per-swarm dashboard with a live SSE
// feed of consensus votes + payouts, and the create / join / contribute / exit /
// kill flows — every money action calls a real on-chain endpoint.

const root = document.getElementById('sw-view');
const SOL = (n) => (n == null ? '—' : `${Number(n).toLocaleString(undefined, { maximumFractionDigits: 4 })} SOL`);
const PCT = (n) => (n == null ? '—' : `${(Number(n) * 100).toFixed(0)}%`);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const short = (a) => (a ? `${a.slice(0, 4)}…${a.slice(-4)}` : '');

const state = { network: 'mainnet', agents: null, authed: false };

async function api(path, opts = {}) {
	const ctrl = new AbortController();
	const to = setTimeout(() => ctrl.abort(), opts.timeout || 20000);
	try {
		const res = await fetch(path, { credentials: 'include', signal: ctrl.signal, ...opts });
		const data = await res.json().catch(() => null);
		return { ok: res.ok, status: res.status, data: data?.data ?? data, error: res.ok ? null : data?.message || data?.error || `HTTP ${res.status}` };
	} catch (e) {
		return { ok: false, status: 0, data: null, error: e?.name === 'AbortError' ? 'request timed out' : 'network error' };
	} finally {
		clearTimeout(to);
	}
}

function toast(msg, isErr = false) {
	const t = document.createElement('div');
	t.className = 'sw-toast' + (isErr ? ' err' : '');
	t.textContent = msg;
	document.body.appendChild(t);
	setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; setTimeout(() => t.remove(), 300); }, isErr ? 5200 : 3400);
}

async function loadAgents() {
	if (state.agents) return state.agents;
	const r = await api('/api/agents');
	const list = Array.isArray(r.data) ? r.data : Array.isArray(r.data?.agents) ? r.data.agents : [];
	state.agents = list.map((a) => ({ id: a.id, name: a.name || 'Agent' }));
	state.authed = r.ok;
	return state.agents;
}

// ── router ────────────────────────────────────────────────────────────────────

function currentId() {
	return new URL(location.href).searchParams.get('id');
}
function goto(id) {
	const u = new URL(location.href);
	if (id) u.searchParams.set('id', id); else u.searchParams.delete('id');
	history.pushState({}, '', u);
	render();
}
window.addEventListener('popstate', render);

function render() {
	const id = currentId();
	if (id) renderDashboard(id);
	else renderDirectory();
}

// ── directory ──────────────────────────────────────────────────────────────────

async function renderDirectory() {
	root.innerHTML = `
		<section class="sw-hero">
			<div>
				<h1>Trading Swarms</h1>
				<p>Pool capital with other agents into one auditable on-chain treasury. The swarm only fires when enough of its members' verified track record agrees — and pays realized profit back to every member pro-rata.</p>
			</div>
			<div class="sw-hero-actions">
				<button class="sw-btn sw-btn--primary" id="sw-create">＋ Create a swarm</button>
			</div>
		</section>
		<div class="sw-toolbar">
			<div class="sw-seg" role="tablist" aria-label="Network">
				<button data-net="mainnet" aria-pressed="${state.network === 'mainnet'}">Mainnet</button>
				<button data-net="devnet" aria-pressed="${state.network === 'devnet'}">Devnet</button>
			</div>
			<button class="sw-btn sw-btn--ghost sw-btn--sm" id="sw-mine">My swarms</button>
		</div>
		<div id="sw-list" class="sw-grid" aria-busy="true">${skeletons(6)}</div>`;

	document.getElementById('sw-create').onclick = openCreateModal;
	root.querySelectorAll('[data-net]').forEach((b) => {
		b.onclick = () => { state.network = b.dataset.net; renderDirectory(); };
	});
	document.getElementById('sw-mine').onclick = () => loadList(true);

	loadList(false);
}

function skeletons(n) {
	return Array.from({ length: n }, () => '<div class="sw-skel"></div>').join('');
}

async function loadList(mine) {
	const listEl = document.getElementById('sw-list');
	if (!listEl) return;
	listEl.setAttribute('aria-busy', 'true');
	listEl.innerHTML = skeletons(6);
	const path = mine ? `/api/swarms?mine=1&network=${state.network}` : `/api/swarms?network=${state.network}`;
	const r = await api(path);
	listEl.setAttribute('aria-busy', 'false');
	if (!r.ok && r.status === 401 && mine) {
		listEl.innerHTML = msg('Sign in to see your swarms', 'Your swarms — ones you created or funded — appear here once you sign in.');
		return;
	}
	if (!r.ok) {
		listEl.innerHTML = msg('Couldn’t load swarms', esc(r.error || 'Something went wrong.'), 'Retry', () => loadList(mine));
		return;
	}
	const swarms = Array.isArray(r.data) ? r.data : [];
	if (!swarms.length) {
		listEl.innerHTML = mine
			? msg('No swarms yet', 'You haven’t created or joined a swarm. Start one and invite agents to pool capital.', 'Create a swarm', openCreateModal)
			: msg('No open swarms yet', 'Be the first — create a swarm, set its consensus policy, and invite other agents to fund the treasury.', 'Create a swarm', openCreateModal);
		return;
	}
	listEl.innerHTML = swarms.map(cardHTML).join('');
	listEl.querySelectorAll('[data-swarm]').forEach((c) => {
		c.onclick = () => goto(c.dataset.swarm);
		c.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goto(c.dataset.swarm); } };
	});
}

function statusPill(s) {
	const cls = { active: 'active', paused: 'paused', killed: 'killed', open: 'open', closed: 'killed' }[s] || '';
	const label = { open: 'Funding', active: 'Live', paused: 'Paused', killed: 'Killed', closed: 'Closed' }[s] || s;
	return `<span class="sw-pill sw-pill--${cls}">${esc(label)}</span>`;
}

function cardHTML(s) {
	const pnlCls = s.realized_pnl_sol > 0 ? 'pos' : s.realized_pnl_sol < 0 ? 'neg' : '';
	const wr = s.win_rate == null ? '—' : `${Math.round(s.win_rate * 100)}%`;
	return `
		<a class="sw-card" tabindex="0" role="button" data-swarm="${esc(s.id)}" aria-label="Open ${esc(s.name)}">
			<div class="sw-card-top">
				<h3 class="sw-card-name">${esc(s.name)}</h3>
				${statusPill(s.status)}
			</div>
			${s.description ? `<p class="sw-card-desc">${esc(s.description)}</p>` : ''}
			<div class="sw-stats">
				<div class="sw-stat"><span class="sw-stat-v">${s.members}</span><span class="sw-stat-l">Members</span></div>
				<div class="sw-stat"><span class="sw-stat-v">${SOL(s.contributed_sol)}</span><span class="sw-stat-l">Pooled</span></div>
				<div class="sw-stat"><span class="sw-stat-v ${pnlCls}">${s.realized_pnl_sol >= 0 ? '+' : ''}${SOL(s.realized_pnl_sol)}</span><span class="sw-stat-l">Realized P&amp;L</span></div>
				<div class="sw-stat"><span class="sw-stat-v">${s.closed_trades}</span><span class="sw-stat-l">Closed</span></div>
				<div class="sw-stat"><span class="sw-stat-v">${wr}</span><span class="sw-stat-l">Win rate</span></div>
				<div class="sw-stat"><span class="sw-stat-v">${PCT(s.policy?.min_consensus)}</span><span class="sw-stat-l">Min consensus</span></div>
			</div>
		</a>`;
}

function msg(title, body, action, onAction) {
	const id = 'm' + Math.random().toString(36).slice(2);
	queueMicrotask(() => { const b = document.getElementById(id); if (b && onAction) b.onclick = onAction; });
	return `<div class="sw-msg" style="grid-column:1/-1"><h3>${esc(title)}</h3><p>${body}</p>${action ? `<button class="sw-btn sw-btn--primary" id="${id}">${esc(action)}</button>` : ''}</div>`;
}

// ── dashboard ──────────────────────────────────────────────────────────────────

let activeStream = null;

function closeStream() {
	if (activeStream) { try { activeStream.close(); } catch {} activeStream = null; }
}

async function renderDashboard(id) {
	closeStream();
	root.innerHTML = `<a class="sw-back" id="sw-back" href="/swarms">← All swarms</a><div id="sw-dash" aria-busy="true">${skeletons(3)}</div>`;
	document.getElementById('sw-back').onclick = (e) => { e.preventDefault(); goto(null); };

	const r = await api(`/api/swarms/${id}`);
	const dash = document.getElementById('sw-dash');
	if (!dash) return;
	dash.setAttribute('aria-busy', 'false');
	if (!r.ok) {
		dash.innerHTML = msg('Swarm not found', esc(r.error || 'This swarm doesn’t exist or was removed.'), 'Back to directory', () => goto(null));
		return;
	}
	paintDashboard(dash, r.data);
	subscribeStream(id);
}

function paintDashboard(dash, s) {
	const sw = s.swarm;
	const pol = s.policy;
	const tr = s.treasury;
	const rec = s.track_record;
	const member = s.viewer_member;
	const pnlCls = rec.realized_pnl_sol > 0 ? 'pos' : rec.realized_pnl_sol < 0 ? 'neg' : '';

	dash.innerHTML = `
		<div class="sw-dash-head">
			<div>
				<h1>${esc(sw.name)} ${statusPill(sw.status)}</h1>
				${sw.description ? `<p class="muted" style="color:var(--ink-dim);max-width:60ch;margin:.2rem 0 0">${esc(sw.description)}</p>` : ''}
				${sw.status === 'killed' && sw.kill_reason ? `<p style="color:var(--danger);font-size:var(--text-sm);margin:.4rem 0 0">Killed: ${esc(sw.kill_reason)}</p>` : ''}
			</div>
			<div class="sw-live" id="sw-livedot" data-state="connecting"><span class="dot"></span><span id="sw-livetxt">connecting</span></div>
		</div>

		<div class="sw-disclose">
			<strong>Real money, real risk.</strong> The treasury holds real SOL and trades autonomously on member consensus — you can lose your entire contribution. Profit on each closed trade is split pro-rata by share${pol.creator_fee_bps ? `, after a ${(pol.creator_fee_bps / 100).toFixed(1)}% creator fee` : ' (no creator fee)'}. Exit policy: <strong>${pol.exit_policy === 'wait_to_close' ? 'wait-to-close' : 'settle-at-mark'}</strong> — ${pol.exit_policy === 'wait_to_close' ? 'you can redeem only when no positions are open.' : 'on exit you redeem your share of the treasury’s liquid SOL at current value.'} No member can hold more than ${(pol.max_member_share_bps / 100).toFixed(0)}% of the treasury.
		</div>

		<div class="sw-tiles">
			<div class="sw-tile"><div class="sw-tile-v" id="sw-bal">${tr.balance_sol == null ? '—' : SOL(tr.balance_sol)}</div><div class="sw-tile-l">Treasury (on-chain)</div><a href="${esc(tr.explorer)}" target="_blank" rel="noopener">${short(tr.address)} ↗</a></div>
			<div class="sw-tile"><div class="sw-tile-v">${SOL(tr.net_contributed_sol)}</div><div class="sw-tile-l">Net contributed</div></div>
			<div class="sw-tile"><div class="sw-tile-v ${pnlCls}" id="sw-pnl">${rec.realized_pnl_sol >= 0 ? '+' : ''}${SOL(rec.realized_pnl_sol)}</div><div class="sw-tile-l">Realized P&amp;L</div></div>
			<div class="sw-tile"><div class="sw-tile-v" id="sw-open">${rec.open_positions}</div><div class="sw-tile-l">Open positions</div></div>
			<div class="sw-tile"><div class="sw-tile-v">${rec.win_rate == null ? '—' : Math.round(rec.win_rate * 100) + '%'}</div><div class="sw-tile-l">Win rate · ${rec.closed_trades} closed</div></div>
		</div>

		<div class="sw-hero-actions" id="sw-actions" style="margin-bottom:var(--space-lg);flex-wrap:wrap"></div>

		<div class="sw-cols">
			<div>
				${panel('Members & shares', s.members.length, membersHTML(s.members))}
				${panel('Open & closed positions', s.positions.length, positionsHTML(s.positions))}
			</div>
			<div>
				${panel('Consensus vote log', s.votes.length, votesHTML(s.votes), 'sw-votes')}
				${panel('Pro-rata payout ledger', s.payouts.length, payoutsHTML(s.payouts), 'sw-payouts')}
			</div>
		</div>`;

	renderActions(s);
}

function panel(title, count, body, bodyId) {
	return `<div class="sw-panel"><div class="sw-panel-h"><h2>${esc(title)}</h2><span class="count">${count}</span></div><div class="sw-panel-body"${bodyId ? ` id="${bodyId}"` : ''}>${body}</div></div>`;
}

function membersHTML(members) {
	if (!members.length) return emptyRow('No members yet.');
	return members.map((m) => `
		<div class="sw-row">
			<div class="grow">
				<div class="name">${esc(m.name)}${m.is_creator ? ' <span class="sw-pill" style="font-size:9px">creator</span>' : ''}</div>
				<div class="sw-bar"><span style="width:${Math.min(100, (m.share_bps || 0) / 100)}%"></span></div>
			</div>
			<div style="text-align:right">
				<div class="mono name">${(m.share_bps / 100).toFixed(1)}%</div>
				<div class="muted mono" style="font-size:var(--text-2xs)">${SOL(m.contribution_sol)} · rep ${m.reputation == null ? '—' : Math.round(m.reputation)}</div>
			</div>
		</div>`).join('');
}

function positionsHTML(positions) {
	if (!positions.length) return emptyRow('No trades yet — the treasury fires when member consensus clears.');
	return positions.map((p) => {
		const closed = p.status === 'closed';
		const pnl = p.pnl_sol;
		const cls = pnl > 0 ? 'pos' : pnl < 0 ? 'neg' : '';
		const link = (closed ? p.sell_url : p.buy_url);
		return `<div class="sw-row">
			<div class="grow"><span class="name">${esc(p.symbol || short(p.mint))}</span> <span class="muted" style="font-size:var(--text-2xs)">${closed ? esc(p.exit_reason || 'closed') : p.status}</span></div>
			<div class="mono" style="text-align:right">${closed ? `<span class="${cls}">${pnl >= 0 ? '+' : ''}${SOL(pnl)}</span>` : `<span class="muted">${SOL(p.current_sol)}</span>`}${link ? ` <a href="${esc(link)}" target="_blank" rel="noopener" class="muted">↗</a>` : ''}</div>
		</div>`;
	}).join('');
}

function voteRowHTML(v) {
	const pct = Math.min(100, (v.consensus || 0) * 100);
	const thr = Math.min(100, (v.min_consensus || 0) * 100);
	return `<div class="sw-vote">
		<div class="sw-vote-top">
			<span class="verdict ${v.decision}">${v.decision === 'fire' ? '✓ fire' : 'skip'}</span>
			<span class="name grow">${esc(v.mint ? short(v.mint) : '')}</span>
			<span class="muted mono" style="font-size:var(--text-2xs)">${v.members_long}/${v.members_total} long</span>
		</div>
		<div class="meter">
			<div class="sw-meter-track"><div class="sw-meter-fill" style="width:${pct}%"></div><div class="sw-meter-thresh" style="left:${thr}%"></div></div>
			<span class="mono muted" style="font-size:var(--text-2xs)">${Math.round(pct)}%</span>
		</div>
		<div class="reason">${esc(v.reason || '')}${v.smart_money_score ? ` · smart-money ${Math.round(v.smart_money_score)}` : ''}${v.size_sol ? ` · sized ${SOL(v.size_sol)}` : ''}</div>
	</div>`;
}

function votesHTML(votes) {
	if (!votes.length) return emptyRow('No consensus decisions yet. Each evaluation — fire or skip — logs here with the full weighted vote.');
	return votes.map(voteRowHTML).join('');
}

function payoutRowHTML(p) {
	const kindLabel = { profit: 'Profit', exit: 'Exit', fee: 'Creator fee' }[p.kind] || p.kind;
	const stCls = p.status === 'confirmed' ? 'pos' : p.status === 'failed' ? 'neg' : 'muted';
	return `<div class="sw-row">
		<div class="grow"><span class="name">${esc(kindLabel)}</span> <span class="muted" style="font-size:var(--text-2xs)">${p.share_bps != null ? (p.share_bps / 100).toFixed(1) + '%' : ''}</span></div>
		<div class="mono" style="text-align:right"><span class="${p.kind === 'fee' ? 'muted' : 'pos'}">${SOL(p.amount_sol)}</span> <span class="${stCls}" style="font-size:var(--text-2xs)">${p.status}</span>${p.tx_url ? ` <a href="${esc(p.tx_url)}" target="_blank" rel="noopener" class="muted">↗</a>` : ''}</div>
	</div>`;
}

function payoutsHTML(payouts) {
	if (!payouts.length) return emptyRow('No payouts yet. When a position closes in profit, each member’s pro-rata share is sent on-chain and listed here.');
	return payouts.map(payoutRowHTML).join('');
}

function emptyRow(text) {
	return `<div class="sw-row" style="color:var(--ink-dim);justify-content:center;padding:var(--space-lg);text-align:center;font-size:var(--text-sm)">${esc(text)}</div>`;
}

// ── actions ────────────────────────────────────────────────────────────────────

async function renderActions(s) {
	const el = document.getElementById('sw-actions');
	if (!el) return;
	await loadAgents();
	const sw = s.swarm;
	const member = s.viewer_member;
	const isOwner = s.is_owner;
	const killable = sw.status !== 'killed' && sw.status !== 'closed';

	const btns = [];
	if (killable && !member) btns.push(`<button class="sw-btn sw-btn--primary" data-act="join">Join & contribute</button>`);
	if (killable && member) {
		btns.push(`<button class="sw-btn sw-btn--primary" data-act="contribute">Add SOL</button>`);
		btns.push(`<button class="sw-btn" data-act="exit">Exit & redeem</button>`);
	}
	if (isOwner && killable) {
		btns.push(`<button class="sw-btn sw-btn--ghost sw-btn--sm" data-act="${sw.status === 'paused' ? 'resume' : 'pause'}">${sw.status === 'paused' ? 'Resume' : 'Pause'}</button>`);
	}
	if (killable) btns.push(`<button class="sw-btn sw-btn--danger sw-btn--sm" data-act="kill">Kill switch</button>`);

	el.innerHTML = btns.join('') || `<span class="muted" style="color:var(--ink-dim);font-size:var(--text-sm)">This swarm is closed.</span>`;
	el.querySelectorAll('[data-act]').forEach((b) => {
		b.onclick = () => handleAction(b.dataset.act, s);
	});
}

function handleAction(act, s) {
	if (!state.authed || !state.agents?.length) {
		toast('Sign in and create an agent first', true);
		return;
	}
	if (act === 'join' || act === 'contribute') return openContributeModal(s, act);
	if (act === 'exit') return openExitModal(s);
	if (act === 'kill') return openKillModal(s);
	if (act === 'pause' || act === 'resume') return doSimpleAction(act, s.swarm.id);
}

async function doSimpleAction(action, swarmId, extra = {}) {
	const r = await api('/api/swarms', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, swarm_id: swarmId, ...extra }) });
	if (!r.ok) { toast(r.error || 'Action failed', true); return false; }
	toast(`Done`);
	renderDashboard(swarmId);
	return true;
}

// ── modals ─────────────────────────────────────────────────────────────────────

function modal(html) {
	const scrim = document.createElement('div');
	scrim.className = 'sw-scrim';
	scrim.innerHTML = `<div class="sw-modal" role="dialog" aria-modal="true">${html}</div>`;
	document.body.appendChild(scrim);
	scrim.addEventListener('click', (e) => { if (e.target === scrim) close(); });
	const close = () => { scrim.remove(); document.removeEventListener('keydown', onKey); };
	const onKey = (e) => { if (e.key === 'Escape') close(); };
	document.addEventListener('keydown', onKey);
	return { scrim, close };
}

function agentOptions(selectedFirst = true) {
	return (state.agents || []).map((a) => `<option value="${esc(a.id)}">${esc(a.name)}</option>`).join('');
}

async function openCreateModal() {
	await loadAgents();
	if (!state.authed) { toast('Sign in to create a swarm', true); return; }
	if (!state.agents.length) { toast('Create an agent first', true); return; }
	const { close } = modal(`
		<h2>Create a trading swarm</h2>
		<p class="sub">A dedicated custodial treasury wallet is provisioned on-chain. You set the consensus threshold and risk policy; members fund it with real SOL.</p>
		<div class="sw-field"><label>Swarm name</label><input id="f-name" maxlength="80" placeholder="e.g. Alpha Hunters" /></div>
		<div class="sw-field"><label>Description <span class="hint">(optional)</span></label><textarea id="f-desc" rows="2" maxlength="1000" placeholder="What does this swarm hunt?"></textarea></div>
		<div class="sw-field"><label>Owner agent</label><select id="f-owner">${agentOptions()}</select></div>
		<div class="sw-grid2">
			<div class="sw-field"><label>Min consensus</label><input id="f-cons" type="number" min="5" max="100" step="5" value="60" /><span class="hint">% of weighted track record that must agree</span></div>
			<div class="sw-field"><label>Network</label><select id="f-net"><option value="mainnet">Mainnet</option><option value="devnet">Devnet</option></select></div>
			<div class="sw-field"><label>Max / trade (SOL)</label><input id="f-mpt" type="number" min="0.001" step="0.01" value="0.05" /></div>
			<div class="sw-field"><label>Daily budget (SOL)</label><input id="f-budget" type="number" min="0.001" step="0.1" value="0.5" /></div>
			<div class="sw-field"><label>Stop loss (%)</label><input id="f-sl" type="number" min="1" max="95" value="35" /></div>
			<div class="sw-field"><label>Take profit (%)</label><input id="f-tp" type="number" min="5" value="80" /></div>
			<div class="sw-field"><label>Creator fee (%)</label><input id="f-fee" type="number" min="0" max="20" step="0.5" value="0" /><span class="hint">on distributed profit</span></div>
			<div class="sw-field"><label>Max member share (%)</label><input id="f-cap" type="number" min="10" max="100" value="50" /></div>
			<div class="sw-field"><label>Exit policy</label><select id="f-exit"><option value="settle_at_mark">Settle at mark</option><option value="wait_to_close">Wait to close</option></select></div>
			<div class="sw-field"><label>Join</label><select id="f-join"><option value="open">Open to anyone</option><option value="invite">Invite-only</option></select></div>
		</div>
		<div class="sw-modal-err" id="f-err"></div>
		<div class="sw-modal-actions">
			<button class="sw-btn sw-btn--ghost" id="f-cancel">Cancel</button>
			<button class="sw-btn sw-btn--primary" id="f-go">Create swarm</button>
		</div>`);

	document.getElementById('f-cancel').onclick = close;
	const errEl = document.getElementById('f-err');
	document.getElementById('f-go').onclick = async (e) => {
		const btn = e.currentTarget;
		const name = document.getElementById('f-name').value.trim();
		if (!name) { errEl.textContent = 'Name is required.'; return; }
		btn.disabled = true; btn.textContent = 'Creating…'; errEl.textContent = '';
		const policy = {
			min_consensus: Number(document.getElementById('f-cons').value) / 100,
			max_per_trade_lamports: Math.round(Number(document.getElementById('f-mpt').value) * 1e9),
			daily_budget_lamports: Math.round(Number(document.getElementById('f-budget').value) * 1e9),
			stop_loss_pct: Number(document.getElementById('f-sl').value),
			take_profit_pct: Number(document.getElementById('f-tp').value),
			creator_fee_bps: Math.round(Number(document.getElementById('f-fee').value) * 100),
			max_member_share_bps: Math.round(Number(document.getElementById('f-cap').value) * 100),
			exit_policy: document.getElementById('f-exit').value,
			join_open: document.getElementById('f-join').value === 'open',
		};
		const r = await api('/api/swarms', {
			method: 'POST', headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				action: 'create', name,
				description: document.getElementById('f-desc').value.trim() || null,
				owner_agent_id: document.getElementById('f-owner').value,
				network: document.getElementById('f-net').value, policy,
			}),
		});
		if (!r.ok) { errEl.textContent = r.error || 'Could not create swarm.'; btn.disabled = false; btn.textContent = 'Create swarm'; return; }
		close();
		toast('Swarm created — fund the treasury to go live');
		goto(r.data.swarm.id);
	};
}

async function openContributeModal(s, mode) {
	const sw = s.swarm;
	const { close } = modal(`
		<h2>${mode === 'join' ? 'Join' : 'Add to'} ${esc(sw.name)}</h2>
		<p class="sub">Your agent sends real SOL from its custodial wallet to the swarm treasury. Your share is your net contribution ÷ the total pool, capped at ${(s.policy.max_member_share_bps / 100).toFixed(0)}%. You can exit and redeem any time.</p>
		<div class="sw-field"><label>Your agent</label><select id="c-agent">${agentOptions()}</select></div>
		<div class="sw-field"><label>Amount (SOL)</label><input id="c-amt" type="number" min="0.005" step="0.01" value="0.05" /><span class="hint">minimum 0.005 SOL</span></div>
		<div class="sw-modal-err" id="c-err"></div>
		<div class="sw-modal-actions">
			<button class="sw-btn sw-btn--ghost" id="c-cancel">Cancel</button>
			<button class="sw-btn sw-btn--primary" id="c-go">Send ${mode === 'join' ? '& join' : ''}</button>
		</div>`);
	document.getElementById('c-cancel').onclick = close;
	const errEl = document.getElementById('c-err');
	document.getElementById('c-go').onclick = async (e) => {
		const btn = e.currentTarget;
		const agentId = document.getElementById('c-agent').value;
		const sol = Number(document.getElementById('c-amt').value);
		if (!(sol > 0)) { errEl.textContent = 'Enter an amount.'; return; }
		btn.disabled = true; btn.textContent = 'Sending…'; errEl.textContent = '';
		const r = await api('/api/swarms', {
			method: 'POST', headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ action: 'contribute', swarm_id: sw.id, agent_id: agentId, sol }),
			timeout: 60000,
		});
		if (!r.ok) { errEl.textContent = r.error || 'Contribution failed.'; btn.disabled = false; btn.textContent = 'Send'; return; }
		close();
		toast(`Contributed ${SOL(sol)} — share updated`);
		renderDashboard(sw.id);
	};
}

async function openExitModal(s) {
	const sw = s.swarm;
	const member = s.viewer_member;
	const { close } = modal(`
		<h2>Exit ${esc(sw.name)}</h2>
		<p class="sub">${s.policy.exit_policy === 'wait_to_close'
			? 'This swarm redeems exits only when no positions are open. If positions are live, exit will be refused — wait for them to close or trigger the kill switch.'
			: 'You’ll redeem your share of the treasury’s liquid SOL at current value, sent on-chain to your agent wallet. Open positions stay with the swarm — you forfeit claims on them after exit.'}</p>
		<div class="sw-field"><label>Your member agent</label><select id="x-agent">${(s.members || []).filter((m) => m.status === 'active').map((m) => `<option value="${esc(m.agent_id)}">${esc(m.name)} · ${(m.share_bps / 100).toFixed(1)}%</option>`).join('') || agentOptions()}</select></div>
		<div class="sw-modal-err" id="x-err"></div>
		<div class="sw-modal-actions">
			<button class="sw-btn sw-btn--ghost" id="x-cancel">Stay in</button>
			<button class="sw-btn sw-btn--danger" id="x-go">Exit & redeem</button>
		</div>`);
	document.getElementById('x-cancel').onclick = close;
	const errEl = document.getElementById('x-err');
	document.getElementById('x-go').onclick = async (e) => {
		const btn = e.currentTarget;
		btn.disabled = true; btn.textContent = 'Redeeming…'; errEl.textContent = '';
		const r = await api('/api/swarms', {
			method: 'POST', headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ action: 'exit', swarm_id: sw.id, agent_id: document.getElementById('x-agent').value }),
			timeout: 60000,
		});
		if (!r.ok) { errEl.textContent = r.error || 'Exit failed.'; btn.disabled = false; btn.textContent = 'Exit & redeem'; return; }
		close();
		toast(`Redeemed ${SOL(r.data.redeemed_sol)}${r.data.capped ? ' (capped to liquid SOL)' : ''}`);
		renderDashboard(sw.id);
	};
}

function openKillModal(s) {
	const sw = s.swarm;
	const { close } = modal(`
		<h2>Trigger the kill switch</h2>
		<p class="sub">This halts all new consensus trades and forces every open position to liquidate on the next sweep. ${s.is_owner ? 'As the creator you can always kill.' : `You need ≥ ${(s.policy.kill_threshold_bps / 100).toFixed(0)}% of the treasury to kill.`} This cannot be undone.</p>
		<div class="sw-field"><label>Reason <span class="hint">(optional)</span></label><input id="k-reason" maxlength="280" placeholder="Why are you killing this swarm?" /></div>
		<div class="sw-modal-err" id="k-err"></div>
		<div class="sw-modal-actions">
			<button class="sw-btn sw-btn--ghost" id="k-cancel">Cancel</button>
			<button class="sw-btn sw-btn--danger" id="k-go">Kill swarm</button>
		</div>`);
	document.getElementById('k-cancel').onclick = close;
	const errEl = document.getElementById('k-err');
	document.getElementById('k-go').onclick = async (e) => {
		const btn = e.currentTarget;
		btn.disabled = true; btn.textContent = 'Killing…'; errEl.textContent = '';
		const r = await api('/api/swarms', {
			method: 'POST', headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ action: 'kill', swarm_id: sw.id, reason: document.getElementById('k-reason').value.trim() || null }),
		});
		if (!r.ok) { errEl.textContent = r.error || 'Kill failed.'; btn.disabled = false; btn.textContent = 'Kill swarm'; return; }
		close();
		toast('Swarm killed — positions liquidating');
		renderDashboard(sw.id);
	};
}

// ── live stream ────────────────────────────────────────────────────────────────

function subscribeStream(id) {
	if (typeof window.EventSource !== 'function') return;
	let fails = 0;
	const dot = () => document.getElementById('sw-livedot');
	const setLive = (state, txt) => { const d = dot(); if (d) { d.dataset.state = state; const t = document.getElementById('sw-livetxt'); if (t) t.textContent = txt; } };

	const connect = () => {
		closeStream();
		let es;
		try { es = new EventSource(`/api/swarms/${id}/stream`); } catch { return; }
		activeStream = es;
		es.addEventListener('hello', () => { fails = 0; setLive('live', 'live'); });
		es.addEventListener('vote', (e) => {
			try {
				const v = JSON.parse(e.data);
				const box = document.getElementById('sw-votes');
				if (box) { if (box.querySelector('.sw-msg, .sw-row')) box.innerHTML = ''; box.insertAdjacentHTML('afterbegin', voteRowHTML(v)); flash(box.firstElementChild); }
				if (v.decision === 'fire') toast(`Consensus fired · ${short(v.mint)}`);
			} catch {}
		});
		es.addEventListener('payout', (e) => {
			try {
				const p = JSON.parse(e.data);
				const box = document.getElementById('sw-payouts');
				if (box) { if (box.querySelector('.sw-msg, .sw-row[style]')) box.innerHTML = ''; box.insertAdjacentHTML('afterbegin', payoutRowHTML({ ...p, amount_sol: p.amount_sol })); flash(box.firstElementChild); }
			} catch {}
		});
		es.addEventListener('tick', (e) => {
			try {
				const t = JSON.parse(e.data);
				const bal = document.getElementById('sw-bal'); if (bal && t.balance_sol != null) bal.textContent = SOL(t.balance_sol);
				const op = document.getElementById('sw-open'); if (op) op.textContent = t.open_positions;
				const pnl = document.getElementById('sw-pnl'); if (pnl) { pnl.textContent = `${t.realized_pnl_sol >= 0 ? '+' : ''}${SOL(t.realized_pnl_sol)}`; pnl.className = 'sw-tile-v ' + (t.realized_pnl_sol > 0 ? 'pos' : t.realized_pnl_sol < 0 ? 'neg' : ''); }
			} catch {}
		});
		es.onerror = () => { fails++; setLive('connecting', 'reconnecting'); try { es.close(); } catch {} activeStream = null; setTimeout(connect, Math.min(20000, 1000 * 2 ** fails)); };
	};
	connect();
}

function flash(el) {
	if (!el) return;
	el.style.background = 'var(--surface-3)';
	el.style.transition = 'background 1.2s ease';
	requestAnimationFrame(() => { el.style.background = ''; });
}

window.addEventListener('beforeunload', closeStream);

// ── boot ────────────────────────────────────────────────────────────────────────

loadAgents().finally(render);
