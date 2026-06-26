// Back-an-Agent Vaults — client.
// Discovery feed → vault detail (live NAV, P&L, positions, backers, audit ledger)
// → back / redeem / (owner) trade-the-pool, pause, set terms, claim fees.
// Every number here traces to a real /api/vaults endpoint; nothing is faked.

import { apiFetch } from './api.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const state = {
	me: false,
	agents: [], // the signed-in user's agents
	tab: 'all',
	feed: [],
	vault: null, // current detail vault
	pollTimer: null,
};

// ── formatting ───────────────────────────────────────────────────────────────
const ATOMICS = 1_000_000;
const usd = (atomics) => {
	const n = Number(BigInt(atomics ?? 0)) / ATOMICS;
	return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
const usdCompact = (atomics) => {
	const n = Number(BigInt(atomics ?? 0)) / ATOMICS;
	if (n >= 1000) return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });
	return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
};
const shares = (atomics) => (Number(BigInt(atomics ?? 0)) / ATOMICS).toLocaleString('en-US', { maximumFractionDigits: 4 });
const priceE6 = (e6) => '$' + (Number(BigInt(e6 ?? ATOMICS)) / ATOMICS).toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
const pctBps = (bps) => `${(Number(bps || 0) / 100).toFixed(bps % 100 === 0 ? 0 : 1)}%`;
const roiText = (bps) => `${bps > 0 ? '+' : ''}${(Number(bps || 0) / 100).toFixed(2)}%`;
const signClass = (n) => (n > 0 ? 'is-pos' : n < 0 ? 'is-neg' : 'is-flat');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const shortMint = (m) => (m ? `${m.slice(0, 4)}…${m.slice(-4)}` : '');

function toast(msg, kind = 'info') {
	let host = $('#vx-toast');
	if (!host) {
		host = document.createElement('div');
		host.id = 'vx-toast';
		document.body.appendChild(host);
	}
	const el = document.createElement('div');
	el.className = `vx-toast-item vx-toast--${kind}`;
	el.textContent = msg;
	host.appendChild(el);
	requestAnimationFrame(() => el.classList.add('is-in'));
	setTimeout(() => { el.classList.remove('is-in'); setTimeout(() => el.remove(), 300); }, 4200);
}

async function readErr(res, fallback) {
	try { const j = await res.json(); return j.error_description || j.message || fallback; } catch { return fallback; }
}

// ── auth + agents ──────────────────────────────────────────────────────────────
async function loadMe() {
	try {
		const res = await apiFetch('/api/agents', { allowAnonymous: true });
		if (res.status === 401) { state.me = false; state.agents = []; return; }
		if (!res.ok) { state.me = false; return; }
		const j = await res.json();
		state.me = true;
		state.agents = (j.agents || []).filter(Boolean);
	} catch {
		state.me = false;
	}
	$$('[data-auth="in"]').forEach((el) => { el.hidden = !state.me; });
	$$('[data-auth="out"]').forEach((el) => { el.hidden = !!state.me; });
}

// ── discovery feed ──────────────────────────────────────────────────────────────
async function loadFeed() {
	const grid = $('#vx-grid');
	grid.setAttribute('aria-busy', 'true');
	if (!state.feed.length) grid.innerHTML = skeletonCards(6);
	try {
		const path = state.tab === 'mine' ? '/api/vaults?mine=1' : '/api/vaults';
		const res = await apiFetch(path, { allowAnonymous: state.tab !== 'mine' });
		if (!res.ok) throw new Error(await readErr(res, 'could not load vaults'));
		const j = await res.json();
		state.feed = j.data?.items || [];
		renderFeed();
	} catch (e) {
		grid.innerHTML = `<div class="vx-empty"><p class="vx-empty-t">Couldn't load vaults</p><p class="vx-empty-d">${esc(e.message)}</p><button class="vx-btn" id="vx-retry" type="button">Retry</button></div>`;
		$('#vx-retry')?.addEventListener('click', loadFeed);
	} finally {
		grid.removeAttribute('aria-busy');
	}
}

function skeletonCards(n) {
	return Array.from({ length: n }, () => '<div class="vx-card vx-card--skel"><div class="vx-skel-line"></div><div class="vx-skel-line short"></div><div class="vx-skel-stats"></div></div>').join('');
}

function renderFeed() {
	const grid = $('#vx-grid');
	if (state.tab === 'mine') return renderMine();
	if (!state.feed.length) {
		grid.innerHTML = `<div class="vx-empty">
			<p class="vx-empty-t">No open vaults yet</p>
			<p class="vx-empty-d">Be the first. If your agent has a verified trading track record, open a vault and let backers stake behind it.</p>
			${state.me ? '<button class="vx-btn vx-btn--primary" id="vx-empty-open" type="button">Open a vault</button>' : '<a class="vx-btn vx-btn--primary" href="/leaderboard">Find a trader to verify</a>'}
		</div>`;
		$('#vx-empty-open')?.addEventListener('click', openVaultModal);
		return;
	}
	grid.innerHTML = state.feed.map(cardHtml).join('');
	$$('.vx-card[data-id]', grid).forEach((c) => c.addEventListener('click', () => openDetail(c.dataset.id)));
}

function renderMine() {
	const grid = $('#vx-grid');
	if (!state.feed.length) {
		grid.innerHTML = `<div class="vx-empty"><p class="vx-empty-t">You haven't backed any agent</p><p class="vx-empty-d">Browse open vaults and stake behind a verified trader.</p><button class="vx-btn vx-btn--primary" id="vx-go-all" type="button">Browse vaults</button></div>`;
		$('#vx-go-all')?.addEventListener('click', () => setTab('all'));
		return;
	}
	grid.innerHTML = state.feed.map(mineCardHtml).join('');
	$$('.vx-card[data-id]', grid).forEach((c) => c.addEventListener('click', () => openDetail(c.dataset.id)));
}

function repBadge(rep) {
	if (!rep) return '<span class="vx-rep vx-rep--none">No track record</span>';
	if (rep.verified) return `<span class="vx-rep vx-rep--ok" title="Verified on-chain track record">✓ Verified · score ${Math.round(rep.score)}</span>`;
	return `<span class="vx-rep vx-rep--warn">Unverified · ${rep.closed_count} trades</span>`;
}

function cardHtml(v) {
	const roi = v.roi_bps || 0;
	const img = v.agent_image ? `<img class="vx-card-av" src="${esc(v.agent_image)}" alt="" loading="lazy" />` : '<div class="vx-card-av vx-card-av--ph" aria-hidden="true"></div>';
	const navLine = v.last_nav_atomics ? usdCompact(v.last_nav_atomics) : '—';
	const statusChip = v.status === 'paused' ? '<span class="vx-chip vx-chip--warn">Paused</span>' : '';
	return `<button class="vx-card" data-id="${esc(v.id)}" type="button">
		<div class="vx-card-head">
			${img}
			<div class="vx-card-id">
				<span class="vx-card-name">${esc(v.agent_name || 'Agent')}</span>
				${repBadge(v.reputation)}
			</div>
			${statusChip}
		</div>
		<div class="vx-card-stats">
			<div class="vx-stat"><span class="vx-stat-l">Vault NAV</span><span class="vx-stat-v">${navLine}</span></div>
			<div class="vx-stat"><span class="vx-stat-l">Share price</span><span class="vx-stat-v">${priceE6(v.share_price_e6)}</span></div>
			<div class="vx-stat"><span class="vx-stat-l">Return</span><span class="vx-stat-v ${signClass(roi)}">${roiText(roi)}</span></div>
		</div>
		<div class="vx-card-foot">
			<span title="Performance fee">${pctBps(v.performance_fee_bps)} fee</span>
			<span title="Drawdown circuit breaker">${pctBps(v.max_drawdown_bps)} stop</span>
			<span title="Backers">${v.backer_count} ${v.backer_count === 1 ? 'backer' : 'backers'}</span>
		</div>
	</button>`;
}

function mineCardHtml(v) {
	const deposited = BigInt(v.deposited_atomics || 0);
	const realized = BigInt(v.realized_gain_atomics || 0);
	const img = v.agent_image ? `<img class="vx-card-av" src="${esc(v.agent_image)}" alt="" loading="lazy" />` : '<div class="vx-card-av vx-card-av--ph" aria-hidden="true"></div>';
	return `<button class="vx-card" data-id="${esc(v.id)}" type="button">
		<div class="vx-card-head">${img}<div class="vx-card-id"><span class="vx-card-name">${esc(v.agent_name || 'Agent')}</span><span class="vx-rep vx-rep--muted">${v.status}</span></div></div>
		<div class="vx-card-stats">
			<div class="vx-stat"><span class="vx-stat-l">Your shares</span><span class="vx-stat-v">${shares(v.shares)}</span></div>
			<div class="vx-stat"><span class="vx-stat-l">Deposited</span><span class="vx-stat-v">${usdCompact(deposited)}</span></div>
			<div class="vx-stat"><span class="vx-stat-l">Realized P&L</span><span class="vx-stat-v ${signClass(Number(realized))}">${Number(realized) >= 0 ? '+' : ''}${usdCompact(realized < 0n ? -realized : realized).replace('$', '$')}</span></div>
		</div>
		<div class="vx-card-foot"><span>${pctBps(v.performance_fee_bps)} fee</span><span>Tap to manage →</span></div>
	</button>`;
}

// ── vault detail ─────────────────────────────────────────────────────────────
async function openDetail(id) {
	stopPoll();
	$('#vx-feed-view').hidden = true;
	const dv = $('#vx-detail-view');
	dv.hidden = false;
	$('#vx-detail').innerHTML = '<div class="vx-detail-skel">Loading vault…</div>';
	window.scrollTo({ top: 0, behavior: 'smooth' });
	history.pushState({ v: id }, '', `/vaults?v=${id}`);
	await refreshDetail(id);
	state.pollTimer = setInterval(() => refreshDetail(id, true), 12_000);
}

async function refreshDetail(id, quiet = false) {
	try {
		const [vres, lres] = await Promise.all([
			apiFetch(`/api/vaults/${id}`, { allowAnonymous: true }),
			apiFetch(`/api/vaults/ledger?vault_id=${id}&limit=40`, { allowAnonymous: true }),
		]);
		if (!vres.ok) throw new Error(await readErr(vres, 'vault not found'));
		const v = (await vres.json()).data;
		const ledger = lres.ok ? ((await lres.json()).data?.items || []) : [];
		state.vault = v;
		renderDetail(v, ledger);
	} catch (e) {
		if (!quiet) $('#vx-detail').innerHTML = `<div class="vx-empty"><p class="vx-empty-t">Couldn't load this vault</p><p class="vx-empty-d">${esc(e.message)}</p></div>`;
	}
}

function renderDetail(v, ledger) {
	const nav = v.nav;
	const roi = nav.roi_bps || 0;
	const t = v.terms;
	const agentImg = v.agent?.image ? `<img class="vx-d-av" src="${esc(v.agent.image)}" alt="" loading="lazy" decoding="async" />` : '<div class="vx-d-av vx-d-av--ph" aria-hidden="true"></div>';
	const halted = v.status === 'paused';
	const closed = v.status === 'closing' || v.status === 'closed';

	const statusBanner = halted
		? `<div class="vx-banner vx-banner--warn">⚠ Trading halted${v.halt_reason === 'drawdown' ? ' by the drawdown circuit breaker' : v.halt_reason === 'owner_pause' ? ' by the owner' : ''}. Backers can still redeem.</div>`
		: closed ? '<div class="vx-banner">Vault is winding down, redemptions only.</div>' : '';

	const repLine = v.reputation
		? `${repBadge(v.reputation)} <span class="vx-d-rep-detail">${v.reputation.closed_count} closed · ${(v.reputation.win_rate * 100).toFixed(0)}% win · ${Number(v.reputation.realized_pnl_sol).toFixed(2)} SOL realized · max DD ${Number(v.reputation.max_drawdown_pct).toFixed(0)}%</span>`
		: repBadge(null);

	const myPos = v.my_position;
	const mineBlock = myPos ? `
		<div class="vx-panel vx-panel--mine">
			<h3 class="vx-panel-h">Your position</h3>
			<div class="vx-kv-grid">
				<div><span>Shares</span><b>${shares(myPos.shares)}</b></div>
				<div><span>Current value</span><b>${usd(myPos.current_value_atomics)}</b></div>
				<div><span>Deposited</span><b>${usd(myPos.deposited_atomics)}</b></div>
				<div><span>Unrealized</span><b class="${signClass(Number(BigInt(myPos.unrealized_gain_atomics)))}">${Number(BigInt(myPos.unrealized_gain_atomics)) >= 0 ? '+' : '-'}${usd(BigInt(myPos.unrealized_gain_atomics) < 0n ? -BigInt(myPos.unrealized_gain_atomics) : BigInt(myPos.unrealized_gain_atomics))}</b></div>
			</div>
			<p class="vx-fineprint">Redeem now nets ~${usd(myPos.estimated_net_atomics)} after the ${pctBps(t.performance_fee_bps)} performance fee on gains.</p>
			<button class="vx-btn vx-btn--ghost vx-btn--block" id="vx-redeem-btn" type="button">Redeem</button>
		</div>` : '';

	const positionsRows = v.positions.length
		? v.positions.filter((p) => p.amount_raw !== '0').map((p) => `<tr><td class="vx-mono">${shortMint(p.mint)}</td><td>${Number(p.amount_raw).toLocaleString()}</td><td>${p.mark_atomics != null ? usd(p.mark_atomics) : '<span class="vx-muted">repricing…</span>'}</td></tr>`).join('')
		: '<tr><td colspan="3" class="vx-muted">All capital is in USDC, no open positions.</td></tr>';

	const ownerBlock = v.is_owner ? ownerPanel(v) : '';

	$('#vx-detail').innerHTML = `
		${statusBanner}
		<div class="vx-d-head">
			${agentImg}
			<div class="vx-d-id">
				<h1 class="vx-d-name">${esc(v.agent?.name || 'Agent')}'s Vault</h1>
				<div class="vx-d-rep">${repLine}</div>
				<div class="vx-d-links">
					<a class="vx-link" href="/agent/${esc(v.agent_id)}">Agent profile →</a>
					<a class="vx-link" href="/agent/${esc(v.agent_id)}#trades">Watch it trade →</a>
				</div>
			</div>
			<div class="vx-d-cta">
				${closed ? '' : `<button class="vx-btn vx-btn--primary" id="vx-back-btn" type="button">Back this agent</button>`}
			</div>
		</div>

		<div class="vx-d-metrics">
			<div class="vx-metric"><span class="vx-metric-l">Vault NAV</span><span class="vx-metric-v">${usd(nav.nav_atomics)}</span></div>
			<div class="vx-metric"><span class="vx-metric-l">Share price</span><span class="vx-metric-v">${priceE6(nav.share_price_e6)}</span></div>
			<div class="vx-metric"><span class="vx-metric-l">Return</span><span class="vx-metric-v ${signClass(roi)}">${roiText(roi)}</span></div>
			<div class="vx-metric"><span class="vx-metric-l">Liquid USDC</span><span class="vx-metric-v">${usd(nav.usdc_atomics)}</span></div>
			<div class="vx-metric"><span class="vx-metric-l">Backers</span><span class="vx-metric-v">${v.backer_count}</span></div>
		</div>

		<div class="vx-d-cols">
			<div class="vx-d-main">
				${mineBlock}
				<div class="vx-panel">
					<h3 class="vx-panel-h">Open positions <span class="vx-panel-sub">${nav.priced ? 'marked to market' : 'partial, repricing'}</span></h3>
					<table class="vx-table"><thead><tr><th>Token</th><th>Amount</th><th>Value</th></tr></thead><tbody>${positionsRows}</tbody></table>
				</div>
				${ownerBlock}
			</div>
			<aside class="vx-d-side">
				<div class="vx-panel">
					<h3 class="vx-panel-h">Terms</h3>
					<div class="vx-terms">
						<div><span>Performance fee</span><b>${pctBps(t.performance_fee_bps)}</b></div>
						<div><span>Drawdown stop</span><b>${pctBps(t.max_drawdown_bps)}</b></div>
						<div><span>Max per trade</span><b>${usd(t.max_per_trade_atomics)}</b></div>
						<div><span>Daily budget</span><b>${usd(t.daily_budget_atomics)}</b></div>
						<div><span>Per-backer cap</span><b>${t.per_backer_cap_atomics ? usd(t.per_backer_cap_atomics) : 'None'}</b></div>
						<div><span>Network</span><b>${esc(v.network)}</b></div>
					</div>
					<p class="vx-fineprint">Funds live in a dedicated, segregated wallet. Trading is hard-capped and halts automatically on a ${pctBps(t.max_drawdown_bps)} drawdown. Not investment advice; you can lose principal.</p>
				</div>
				<div class="vx-panel">
					<h3 class="vx-panel-h">Audit trail</h3>
					<ul class="vx-ledger" id="vx-ledger">${ledger.map(ledgerRow).join('') || '<li class="vx-muted">No activity yet.</li>'}</ul>
				</div>
			</aside>
		</div>`;

	$('#vx-back-btn')?.addEventListener('click', () => backModal(v));
	$('#vx-redeem-btn')?.addEventListener('click', () => redeemModal(v));
	wireOwner(v);
}

function ledgerRow(e) {
	const labels = { open: 'Vault opened', deposit: 'Deposit', redeem: 'Redemption', trade: 'Trade', fee: 'Fee accrued', fee_claim: 'Fee claim', drawdown_halt: 'Drawdown halt', pause: 'Paused', resume: 'Resumed', terms: 'Terms changed', close: 'Closing' };
	const icon = { deposit: '↘', redeem: '↗', trade: '⇄', drawdown_halt: '⚠', fee: '◆', fee_claim: '◆', open: '★', pause: '⏸', resume: '▶', terms: '⚙', close: '⏹' }[e.type] || '·';
	let detail = '';
	if (e.type === 'trade') detail = `${e.meta?.side === 'buy' ? 'Bought' : 'Sold'} ${shortMint(e.meta?.mint)}${e.meta?.usdc_in ? ` · ${usd(e.meta.usdc_in)}` : e.meta?.usdc_out ? ` · ${usd(e.meta.usdc_out)}` : ''}`;
	else if (e.type === 'deposit') detail = `+${shares(e.shares_delta || 0)} shares`;
	else if (e.type === 'redeem') detail = `${usd((e.meta?.net_atomics) || 0)} out`;
	else if (e.type === 'drawdown_halt') detail = 'circuit breaker tripped';
	const ts = new Date(e.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
	const link = e.explorer ? `<a class="vx-ledger-x" href="${esc(e.explorer)}" target="_blank" rel="noopener" title="View on-chain">⧉</a>` : '';
	return `<li class="vx-ledger-row vx-ledger--${e.type}"><span class="vx-ledger-i" aria-hidden="true">${icon}</span><span class="vx-ledger-b"><b>${labels[e.type] || e.type}</b><span class="vx-ledger-d">${esc(detail)}</span></span><span class="vx-ledger-t">${ts}${link}</span></li>`;
}

// ── owner controls ─────────────────────────────────────────────────────────────
function ownerPanel(v) {
	const t = v.terms;
	const accrued = v.accrued_fee_atomics || '0';
	return `<div class="vx-panel vx-panel--owner">
		<h3 class="vx-panel-h">Owner controls</h3>
		<div class="vx-owner-row">
			${v.status === 'open' ? '<button class="vx-btn vx-btn--ghost" data-owner="pause" type="button">Pause trading</button>' : v.status === 'paused' ? '<button class="vx-btn" data-owner="resume" type="button">Resume trading</button>' : ''}
			<span class="vx-owner-fee">Accrued fees: <b>${usd(accrued)}</b></span>
			${BigInt(accrued) > 0n ? '<button class="vx-btn vx-btn--ghost" data-owner="claim" type="button">Claim fees</button>' : ''}
		</div>
		<form class="vx-trade-form" id="vx-trade-form">
			<h4 class="vx-trade-h">Deploy the pool</h4>
			<div class="vx-trade-grid">
				<select class="vx-input" id="vx-trade-side">
					<option value="buy">Buy (USDC → token)</option>
					<option value="sell">Sell (token → USDC)</option>
				</select>
				<input class="vx-input vx-mono" id="vx-trade-mint" placeholder="token mint address" />
				<input class="vx-input" id="vx-trade-amount" placeholder="USDC (buy) / amount or max (sell)" />
				<button class="vx-btn vx-btn--primary" id="vx-trade-go" type="submit" ${v.status !== 'open' ? 'disabled' : ''}>Trade</button>
			</div>
			<p class="vx-fineprint">Hard limits: ≤ ${usd(t.max_per_trade_atomics)}/trade, ≤ ${usd(t.daily_budget_atomics)}/day. A ${pctBps(t.max_drawdown_bps)} drawdown auto-halts the vault.</p>
		</form>
	</div>`;
}

function wireOwner(v) {
	$$('[data-owner]').forEach((b) => b.addEventListener('click', async () => {
		const act = b.dataset.owner;
		if (act === 'claim') return claimFees(v);
		b.disabled = true;
		try {
			const res = await apiFetch(`/api/vaults/${v.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: act }) });
			if (!res.ok) throw new Error(await readErr(res, 'action failed'));
			toast(act === 'pause' ? 'Trading paused' : 'Trading resumed', 'ok');
			await refreshDetail(v.id);
		} catch (e) { toast(e.message, 'err'); b.disabled = false; }
	}));

	$('#vx-trade-form')?.addEventListener('submit', async (ev) => {
		ev.preventDefault();
		const side = $('#vx-trade-side').value;
		const mint = $('#vx-trade-mint').value.trim();
		const amountRaw = $('#vx-trade-amount').value.trim();
		if (!mint) return toast('Enter a token mint', 'err');
		const go = $('#vx-trade-go');
		go.disabled = true; go.textContent = 'Trading…';
		const body = { vaultId: v.id, side, mint, slippageBps: 100 };
		if (side === 'buy') { const n = Number(amountRaw); if (!(n > 0)) { go.disabled = false; go.textContent = 'Trade'; return toast('Enter a USDC amount', 'err'); } body.usdc = n; }
		else body.amount = amountRaw || 'max';
		try {
			const res = await apiFetch('/api/vaults/trade', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
			const j = await res.json();
			if (!res.ok) throw new Error(j.error_description || 'trade blocked');
			if (j.data?.halted) toast('Trade filled, drawdown breaker tripped, vault halted to protect capital.', 'warn');
			else toast(`Trade filled (${side}). NAV ${usd(j.data.nav_atomics)}`, 'ok');
			await refreshDetail(v.id);
		} catch (e) { toast(e.message, 'err'); }
		finally { go.disabled = false; go.textContent = 'Trade'; }
	});
}

async function claimFees(v) {
	const fundable = state.agents.filter((a) => a.walletReady);
	if (!fundable.length) return toast('Provision a Solana wallet on one of your agents to receive fees', 'err');
	const to = fundable[0];
	try {
		const res = await apiFetch('/api/vaults/claim-fees', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ vaultId: v.id, toAgentId: to.id }) });
		const j = await res.json();
		if (!res.ok) throw new Error(j.error_description || 'claim failed');
		toast(`Claimed ${usd(j.data.claimed_atomics)} to ${to.name}`, 'ok');
		await refreshDetail(v.id);
	} catch (e) { toast(e.message, 'err'); }
}

// ── back (deposit) + redeem modals ──────────────────────────────────────────────
function modal(id, show) {
	const m = $(id);
	m.hidden = !show;
	document.body.classList.toggle('vx-modal-open', show);
}

function backModal(v) {
	if (!state.me) { window.location.href = '/login?next=' + encodeURIComponent(`/vaults?v=${v.id}`); return; }
	const fundable = state.agents.filter((a) => a.walletReady);
	const t = v.terms;
	const body = $('#vx-back-modal-body');
	if (!fundable.length) {
		body.innerHTML = `<h2 class="vx-modal-title">Fund a wallet first</h2><p class="vx-modal-sub">Backing draws USDC from one of your agents' wallets. None of your agents has a funded Solana wallet yet.</p><a class="vx-btn vx-btn--primary vx-btn--block" href="/dashboard">Set up a wallet</a>`;
		modal('#vx-back-modal', true);
		return;
	}
	const capNote = t.per_backer_cap_atomics ? `Per-backer cap: ${usd(t.per_backer_cap_atomics)}.` : '';
	body.innerHTML = `
		<h2 id="vx-back-title" class="vx-modal-title">Back ${esc(v.agent?.name || 'this agent')}</h2>
		<p class="vx-modal-sub">You'll receive shares priced at the live NAV (${priceE6(v.nav.share_price_e6)}/share). P&amp;L is shared pro-rata; the owner earns ${pctBps(t.performance_fee_bps)} on your gains only.</p>
		<form id="vx-deposit-form" class="vx-form">
			<label class="vx-field">
				<span class="vx-label">Fund from</span>
				<select class="vx-input" id="vx-dep-agent">${fundable.map((a) => `<option value="${esc(a.id)}">${esc(a.name)}</option>`).join('')}</select>
			</label>
			<label class="vx-field">
				<span class="vx-label">Amount (USDC)</span>
				<div class="vx-input-suffix"><span>$</span><input class="vx-input" id="vx-dep-amount" type="number" min="1" step="0.01" placeholder="100.00" required /></div>
				<span class="vx-hint">${esc(capNote)} Real on-chain transfer, spend-limit checked.</span>
			</label>
			<div class="vx-risk">Backing deploys your own funds into a limit-bound, auditable strategy. You can lose principal. Redemptions pay at real NAV and may queue if capital is in open positions.</div>
			<div class="vx-form-err" id="vx-dep-err" hidden></div>
			<button class="vx-btn vx-btn--primary vx-btn--block" id="vx-dep-submit" type="submit">Confirm deposit</button>
		</form>`;
	modal('#vx-back-modal', true);
	$('#vx-deposit-form').addEventListener('submit', async (ev) => {
		ev.preventDefault();
		const backerAgentId = $('#vx-dep-agent').value;
		const amt = Number($('#vx-dep-amount').value);
		const errEl = $('#vx-dep-err');
		errEl.hidden = true;
		if (!(amt > 0)) { errEl.textContent = 'Enter a positive amount'; errEl.hidden = false; return; }
		const sub = $('#vx-dep-submit');
		sub.disabled = true; sub.textContent = 'Depositing…';
		try {
			const res = await apiFetch('/api/vaults/deposit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ vaultId: v.id, backerAgentId, usdc: amt }) });
			const j = await res.json();
			if (!res.ok) throw new Error(j.error_description || 'deposit failed');
			toast(`Deposited ${usd(j.data.shares_minted ? amt * ATOMICS : 0)}, ${shares(j.data.shares_minted)} shares`, 'ok');
			modal('#vx-back-modal', false);
			await refreshDetail(v.id);
		} catch (e) { errEl.textContent = e.message; errEl.hidden = false; }
		finally { sub.disabled = false; sub.textContent = 'Confirm deposit'; }
	});
}

function redeemModal(v) {
	const p = v.my_position;
	if (!p) return;
	const body = $('#vx-back-modal-body');
	body.innerHTML = `
		<h2 id="vx-back-title" class="vx-modal-title">Redeem from ${esc(v.agent?.name || 'this vault')}</h2>
		<p class="vx-modal-sub">You hold ${shares(p.shares)} shares worth ~${usd(p.current_value_atomics)}. Redeeming nets ~${usd(p.estimated_net_atomics)} after the ${pctBps(v.terms.performance_fee_bps)} fee on gains.</p>
		<form id="vx-redeem-form" class="vx-form">
			<label class="vx-field">
				<span class="vx-label">Shares to redeem</span>
				<input class="vx-input" id="vx-red-amount" type="text" value="max" />
				<span class="vx-hint">"max" redeems your full position. Paid to your funding wallet at real NAV.</span>
			</label>
			<div class="vx-form-err" id="vx-red-err" hidden></div>
			<button class="vx-btn vx-btn--primary vx-btn--block" id="vx-red-submit" type="submit">Confirm redemption</button>
		</form>`;
	modal('#vx-back-modal', true);
	$('#vx-redeem-form').addEventListener('submit', async (ev) => {
		ev.preventDefault();
		const raw = $('#vx-red-amount').value.trim();
		const shares_ = raw === 'max' || raw === '' ? 'max' : String(Math.floor(Number(raw) * ATOMICS));
		const errEl = $('#vx-red-err'); errEl.hidden = true;
		const sub = $('#vx-red-submit'); sub.disabled = true; sub.textContent = 'Redeeming…';
		try {
			const res = await apiFetch('/api/vaults/redeem', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ vaultId: v.id, shares: shares_ }) });
			const j = await res.json();
			if (!res.ok && res.status !== 202) throw new Error(j.error_description || 'redeem failed');
			if (j.data?.status === 'queued') toast('No liquid USDC right now, your redemption is queued.', 'warn');
			else if (j.data?.status === 'partial') toast(`Partial: ${usd(j.data.net_atomics)} paid, rest queued.`, 'warn');
			else toast(`Redeemed, ${usd(j.data.net_atomics)} paid out`, 'ok');
			modal('#vx-back-modal', false);
			await refreshDetail(v.id);
		} catch (e) { errEl.textContent = e.message; errEl.hidden = false; }
		finally { sub.disabled = false; sub.textContent = 'Confirm redemption'; }
	});
}

// ── open a vault ────────────────────────────────────────────────────────────────
function openVaultModal() {
	if (!state.me) { window.location.href = '/login?next=' + encodeURIComponent('/vaults'); return; }
	const sel = $('#vx-open-agent');
	if (!state.agents.length) {
		$('#vx-open-agent-hint').textContent = 'You have no agents yet, create one and build a track record first.';
		sel.innerHTML = '<option>No agents</option>';
		sel.disabled = true;
	} else {
		sel.disabled = false;
		sel.innerHTML = state.agents.map((a) => `<option value="${esc(a.id)}">${esc(a.name)}</option>`).join('');
		$('#vx-open-agent-hint').textContent = 'Only an agent with a verified on-chain track record can open a vault.';
	}
	modal('#vx-open-modal', true);
}

async function submitOpen(ev) {
	ev.preventDefault();
	const err = $('#vx-open-err'); err.hidden = true;
	const body = {
		agentId: $('#vx-open-agent').value,
		performanceFeeBps: Math.round(Number($('#vx-open-fee').value) * 100),
		maxDrawdownBps: Math.round(Number($('#vx-open-dd').value) * 100),
		maxPerTradeUsdc: Number($('#vx-open-pertrade').value),
		dailyBudgetUsdc: Number($('#vx-open-daily').value),
		perBackerCapUsdc: $('#vx-open-cap').value ? Number($('#vx-open-cap').value) : null,
	};
	const sub = $('#vx-open-submit'); sub.disabled = true; sub.textContent = 'Opening…';
	try {
		const res = await apiFetch('/api/vaults', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
		const j = await res.json();
		if (!res.ok) throw new Error(j.error_description || 'could not open vault');
		toast('Vault opened, share it so backers can stake.', 'ok');
		modal('#vx-open-modal', false);
		await openDetail(j.data.vault.id);
	} catch (e) { err.textContent = e.message; err.hidden = false; }
	finally { sub.disabled = false; sub.textContent = 'Open vault'; }
}

// ── navigation ───────────────────────────────────────────────────────────────
function setTab(tab) {
	state.tab = tab;
	state.feed = [];
	$$('.vx-tab').forEach((b) => { const on = b.dataset.tab === tab; b.classList.toggle('is-active', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); });
	loadFeed();
}

function backToFeed() {
	stopPoll();
	$('#vx-detail-view').hidden = true;
	$('#vx-feed-view').hidden = false;
	state.vault = null;
	history.pushState({}, '', '/vaults');
}

function stopPoll() { if (state.pollTimer) { clearInterval(state.pollTimer); state.pollTimer = null; } }

function wireGlobal() {
	$('#vx-open-cta')?.addEventListener('click', openVaultModal);
	$('#vx-back')?.addEventListener('click', backToFeed);
	$('#vx-open-form')?.addEventListener('submit', submitOpen);
	$$('.vx-tab').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));
	$$('.vx-modal [data-close]').forEach((el) => el.addEventListener('click', () => { modal('#vx-open-modal', false); modal('#vx-back-modal', false); }));
	document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { modal('#vx-open-modal', false); modal('#vx-back-modal', false); } });
	window.addEventListener('popstate', () => {
		const id = new URL(location.href).searchParams.get('v');
		if (id) openDetail(id); else backToFeed();
	});
}

async function init() {
	wireGlobal();
	await loadMe();
	const id = new URL(location.href).searchParams.get('v');
	if (id) openDetail(id);
	else loadFeed();
}

document.addEventListener('DOMContentLoaded', init);
