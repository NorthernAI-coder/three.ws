/**
 * Agent Wallet hub — Programmable Orders tab (trading-frontier/02).
 *
 * Owner-only. Set-and-forget order tooling pump.fun never had: limit, stop,
 * trailing stop, DCA, TWAP, and validated conditional triggers ("buy when
 * smart-money > 60 and mcap < $40k", "sell if the dev dumps"). A worker
 * (workers/agent-orders) watches live on-chain state and fires matched orders
 * from the agent's own wallet through the SAME firewall + spend-guard + custody
 * pipeline as every manual trade — so an order can never exceed the daily budget
 * or per-trade cap, the kill switch halts everything, and cancel is instant.
 *
 * The create form previews the live fill condition + the rug/honeypot firewall
 * verdict before you arm. Open orders stream their status live; fills show real
 * signatures linked to the explorer.
 */

import { registerWalletTab } from '../registry.js';
import { formatSol, formatUsd, explorerTxUrl } from '../util.js';
import { consumeCsrfToken } from '../../api.js';

const STYLE_ID = 'awh-orders-style';
const THREE_MINT = 'FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump';

const TYPE_META = {
	limit: { icon: '🎯', label: 'Limit', blurb: 'Fill at a target price/market-cap.' },
	stop: { icon: '🛑', label: 'Stop', blurb: 'Stop-loss on a fall, or breakout on a rise.' },
	trailing: { icon: '📉', label: 'Trailing', blurb: 'Sell after a % drop from the high.' },
	dca: { icon: '🪙', label: 'DCA', blurb: 'Recurring buys/sells on an interval.' },
	twap: { icon: '🧊', label: 'TWAP', blurb: 'Slice one big order to cut price impact.' },
	conditional: { icon: '🧠', label: 'Conditional', blurb: 'Fire on live signals.' },
};
const METRIC_LABEL = { mcap_usd: 'Market cap (USD)', mcap_sol: 'Market cap (SOL)', price_sol: 'Price (SOL/token)' };
const OPEN_STATUSES = ['active', 'partial', 'firing', 'paused'];
const STATUS_TONE = { active: 'ok', partial: 'ok', firing: 'warn', filled: 'ok', cancelled: 'muted', expired: 'muted', error: 'bad', paused: 'warn' };

const STYLE = `
.aord { display:flex; flex-direction:column; gap: var(--space-lg,1.618rem); }
.aord-hero { background: linear-gradient(160deg, var(--wallet-accent-soft,rgba(139,92,246,.1)), var(--surface-1,rgba(255,255,255,.03))); border:1px solid var(--wallet-stroke,rgba(139,92,246,.3)); border-radius: var(--radius-lg,14px); padding: var(--space-lg,18px); position:relative; overflow:hidden; }
.aord-hero-top { display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; }
.aord-title { font-family: var(--font-display,'Space Grotesk',sans-serif); font-size: var(--text-lg,1.18rem); font-weight:600; color: var(--ink-bright,#fff); margin:0; }
.aord-title small { display:block; font-family: var(--font-body,Inter,sans-serif); font-size: var(--text-sm,.764rem); font-weight:400; color: var(--ink-dim,#888); margin-top:3px; }
.aord-stats { display:flex; gap:8px; flex-wrap:wrap; margin-top: var(--space-md,14px); }
.aord-stat { background: var(--surface-1,rgba(255,255,255,.03)); border:1px solid var(--stroke,rgba(255,255,255,.08)); border-radius: var(--radius-md,10px); padding:9px 12px; min-width:92px; }
.aord-stat .l { font-size: var(--text-2xs,.6875rem); color: var(--ink-dim,#888); text-transform:uppercase; letter-spacing:.03em; }
.aord-stat .n { font-family: var(--font-mono,ui-monospace,monospace); font-size: var(--text-md,.8125rem); color: var(--ink-bright,#fff); margin-top:3px; }
.aord-banner { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; margin-top: var(--space-md,14px); padding:10px 13px; border-radius: var(--radius-md,10px); border:1px solid color-mix(in srgb, var(--danger,#f87171) 35%, transparent); background: color-mix(in srgb, var(--danger,#f87171) 8%, transparent); color: var(--danger,#f87171); font-size: var(--text-sm,.764rem); }

.aord-card { background: var(--surface-1,rgba(255,255,255,.03)); border:1px solid var(--stroke,rgba(255,255,255,.08)); border-radius: var(--radius-lg,14px); padding: var(--space-lg,18px); }
.aord-card h3 { margin:0 0 4px; font-size: var(--text-ui,.875rem); color: var(--ink-bright,#fff); font-weight:600; display:flex; align-items:center; gap:8px; }
.aord-card .sub { margin:0 0 var(--space-md,14px); font-size: var(--text-sm,.764rem); color: var(--ink-dim,#888); }

.aord-types { display:grid; grid-template-columns: repeat(auto-fit, minmax(118px,1fr)); gap:8px; margin-bottom: var(--space-md,14px); }
.aord-type { appearance:none; text-align:left; font:inherit; cursor:pointer; padding:10px 11px; border-radius: var(--radius-md,10px); border:1px solid var(--stroke,rgba(255,255,255,.1)); background: var(--surface-1,rgba(255,255,255,.03)); color: var(--ink,#e8e8e8); transition: border-color var(--duration-fast,140ms), background var(--duration-fast,140ms); }
.aord-type:hover { border-color: var(--wallet-stroke,rgba(139,92,246,.3)); }
.aord-type[aria-pressed="true"] { border-color: var(--wallet-stroke-strong,rgba(139,92,246,.5)); background: var(--wallet-accent-soft,rgba(139,92,246,.1)); }
.aord-type .t { font-weight:600; font-size: var(--text-md,.8125rem); display:flex; align-items:center; gap:6px; }
.aord-type .b { font-size: var(--text-2xs,.6875rem); color: var(--ink-dim,#888); margin-top:3px; line-height:1.35; }

.aord-field { margin-bottom:11px; }
.aord-field label { display:block; font-size: var(--text-2xs,.6875rem); text-transform:uppercase; letter-spacing:.04em; color: var(--ink-dim,#888); margin-bottom:5px; }
.aord-input, .aord-select { width:100%; box-sizing:border-box; font:inherit; font-size: var(--text-md,.8125rem); color: var(--ink,#e8e8e8); background: var(--surface-2,rgba(255,255,255,.05)); border:1px solid var(--stroke,rgba(255,255,255,.1)); border-radius: var(--radius-md,10px); padding:9px 12px; transition: border-color var(--duration-fast,140ms); }
.aord-input:focus, .aord-select:focus { outline:none; border-color: var(--wallet-stroke-strong,rgba(139,92,246,.5)); }
.aord-row { display:flex; gap:10px; flex-wrap:wrap; }
.aord-row > .aord-field { flex:1; min-width:120px; }
.aord-seg { display:inline-flex; border:1px solid var(--stroke,rgba(255,255,255,.1)); border-radius: var(--radius-md,10px); overflow:hidden; }
.aord-seg button { appearance:none; font:inherit; font-size: var(--text-sm,.764rem); cursor:pointer; padding:8px 16px; border:none; background:transparent; color: var(--ink-dim,#aaa); transition: background var(--duration-fast,140ms), color var(--duration-fast,140ms); }
.aord-seg button[aria-pressed="true"] { background: var(--wallet-accent,#c4b5fd); color:#160d28; font-weight:600; }

.aord-cond { border:1px dashed var(--stroke,rgba(255,255,255,.14)); border-radius: var(--radius-md,10px); padding:11px; margin-bottom:11px; }
.aord-cond-mode { display:flex; gap:8px; align-items:center; margin-bottom:9px; font-size: var(--text-sm,.764rem); color: var(--ink-dim,#aaa); }
.aord-clause { display:flex; gap:7px; align-items:center; margin-bottom:7px; flex-wrap:wrap; }
.aord-clause .aord-select, .aord-clause .aord-input { width:auto; flex:1; min-width:90px; }
.aord-clause .x { appearance:none; cursor:pointer; border:1px solid var(--stroke,rgba(255,255,255,.12)); background:transparent; color: var(--ink-dim,#888); border-radius: var(--radius-sm,6px); width:30px; height:30px; flex:none; }
.aord-clause .x:hover { color: var(--danger,#f87171); border-color: color-mix(in srgb,var(--danger,#f87171) 40%,transparent); }

.aord-btn { appearance:none; font:inherit; font-size: var(--text-sm,.764rem); font-weight:600; cursor:pointer; border-radius: var(--radius-md,10px); padding:9px 16px; border:1px solid var(--stroke-strong,rgba(255,255,255,.14)); background: var(--surface-2,rgba(255,255,255,.06)); color: var(--ink,#e8e8e8); transition: background var(--duration-fast,140ms), border-color var(--duration-fast,140ms), transform var(--duration-fast,140ms); }
.aord-btn:hover:not(:disabled) { background: var(--surface-3,rgba(255,255,255,.09)); color: var(--ink-bright,#fff); }
.aord-btn:active:not(:disabled) { transform: translateY(1px); }
.aord-btn:disabled { opacity:.5; cursor:not-allowed; }
.aord-btn:focus-visible { outline:2px solid var(--wallet-focus,rgba(139,92,246,.7)); outline-offset:2px; }
.aord-btn.primary { background: var(--wallet-accent,#c4b5fd); border-color: var(--wallet-accent,#c4b5fd); color:#160d28; }
.aord-btn.primary:hover:not(:disabled) { background: var(--wallet-accent-strong,#a78bfa); border-color: var(--wallet-accent-strong,#a78bfa); }
.aord-btn.ghost { background:transparent; }
.aord-btn.danger { color: var(--danger,#f87171); border-color: color-mix(in srgb, var(--danger,#f87171) 40%, transparent); background: color-mix(in srgb, var(--danger,#f87171) 8%, transparent); }
.aord-btn.danger:hover:not(:disabled) { background: color-mix(in srgb, var(--danger,#f87171) 16%, transparent); color:#fff; }
.aord-btn.sm { padding:6px 11px; font-size: var(--text-2xs,.6875rem); }
.aord-actions { display:flex; gap:8px; flex-wrap:wrap; margin-top: var(--space-md,13px); }

.aord-prev { margin-top:12px; padding:11px 13px; border-radius: var(--radius-md,10px); background: var(--surface-1,rgba(255,255,255,.03)); border:1px solid var(--stroke,rgba(255,255,255,.08)); }
.aord-prev .rb { font-size: var(--text-md,.8125rem); color: var(--ink-bright,#fff); line-height:1.5; margin-bottom:8px; }
.aord-prev .ln { font-size: var(--text-sm,.764rem); color: var(--ink-dim,#aaa); margin:3px 0; display:flex; gap:7px; align-items:center; }
.aord-fw { display:inline-block; font-size: var(--text-2xs,.6875rem); padding:2px 9px; border-radius: var(--radius-pill,999px); border:1px solid currentColor; }
.aord-fw.allow { color: var(--success,#4ade80); } .aord-fw.warn { color: var(--warn,#fbbf24); } .aord-fw.block { color: var(--danger,#f87171); }

.aord-list { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:9px; }
.aord-item { border:1px solid var(--stroke,rgba(255,255,255,.08)); border-radius: var(--radius-md,11px); background: var(--surface-1,rgba(255,255,255,.03)); padding:12px 13px; transition: border-color var(--duration-fast,140ms); }
.aord-item:hover { border-color: var(--wallet-stroke,rgba(139,92,246,.28)); }
.aord-item-top { display:flex; gap:11px; align-items:flex-start; }
.aord-item-ic { font-size:18px; line-height:1.2; flex:none; }
.aord-item-body { flex:1; min-width:0; }
.aord-item-ttl { font-size: var(--text-md,.8125rem); color: var(--ink-bright,#fff); font-weight:600; }
.aord-item-desc { font-size: var(--text-sm,.764rem); color: var(--ink-dim,#999); margin-top:3px; line-height:1.45; }
.aord-item-foot { display:flex; flex-wrap:wrap; gap:8px; align-items:center; margin-top:8px; font-size: var(--text-2xs,.6875rem); color: var(--ink-faint,rgba(255,255,255,.5)); }
.aord-item-foot a { color: var(--wallet-accent,#c4b5fd); text-decoration:none; border-bottom:1px dotted currentColor; }
.aord-pill { font-size: var(--text-2xs,.6875rem); padding:2px 9px; border-radius: var(--radius-pill,999px); border:1px solid currentColor; text-transform:capitalize; }
.aord-pill.ok { color: var(--success,#4ade80); } .aord-pill.warn { color: var(--warn,#fbbf24); } .aord-pill.bad { color: var(--danger,#f87171); } .aord-pill.muted { color: var(--ink-dim,#888); }
.aord-prog { height:5px; border-radius:999px; background: var(--surface-3,rgba(255,255,255,.1)); margin-top:8px; overflow:hidden; }
.aord-prog > i { display:block; height:100%; background: var(--wallet-accent,#c4b5fd); transition: width var(--duration-base,220ms); }
.aord-item-ctl { display:flex; gap:6px; flex-wrap:wrap; margin-top:10px; }

.aord-empty { text-align:center; padding: var(--space-lg,18px) var(--space-md,14px); color: var(--ink-dim,#888); font-size: var(--text-sm,.764rem); }
.aord-empty .ic { font-size:30px; margin-bottom:8px; }
.aord-skel { height:14px; border-radius:6px; background: var(--surface-2,rgba(255,255,255,.05)); animation: aord-sk 1.4s ease-in-out infinite; margin:10px 0; }
.aord-spin { display:inline-block; width:13px; height:13px; border:2px solid rgba(0,0,0,.25); border-top-color: currentColor; border-radius:50%; animation: aord-rot .7s linear infinite; vertical-align:-2px; margin-right:6px; }
.aord-err { background: color-mix(in srgb, var(--danger,#f87171) 12%, transparent); border:1px solid color-mix(in srgb, var(--danger,#f87171) 32%, transparent); color: var(--danger,#f87171); border-radius: var(--radius-md,10px); padding:10px 12px; font-size: var(--text-sm,.764rem); }
.aord-live { font-size: var(--text-2xs,.6875rem); color: var(--success,#4ade80); display:inline-flex; align-items:center; gap:5px; }
.aord-live .dot { width:7px; height:7px; border-radius:50%; background: var(--success,#4ade80); animation: aord-pulse 1.8s ease-in-out infinite; }
@keyframes aord-rot { to { transform: rotate(360deg); } }
@keyframes aord-sk { 0%,100%{opacity:.4} 50%{opacity:.8} }
@keyframes aord-pulse { 0%,100%{opacity:1} 50%{opacity:.3} }
@media (prefers-reduced-motion: reduce) { .aord-skel,.aord-spin,.aord-live .dot,.aord-prog > i { animation:none; transition:none; } }
`;

function injectStyle() {
	if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
	const tag = document.createElement('style');
	tag.id = STYLE_ID;
	tag.textContent = STYLE;
	document.head.appendChild(tag);
}

function esc(s) {
	return String(s ?? '').replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function call(url, { method = 'GET', body = null } = {}) {
	try {
		const opts = { method, credentials: 'include', headers: {} };
		if (body != null) { opts.headers['content-type'] = 'application/json'; opts.body = JSON.stringify(body); }
		if (method !== 'GET') { const token = await consumeCsrfToken(); if (token) opts.headers['x-csrf-token'] = token; }
		const r = await fetch(url, opts);
		let j = null; try { j = await r.json(); } catch { /* */ }
		if (!r.ok) return { ok: false, status: r.status, code: j?.error || 'error', message: j?.error_description || `request failed (${r.status})`, data: j?.data ?? null };
		return { ok: true, status: r.status, data: j?.data ?? j };
	} catch (err) {
		return { ok: false, status: 0, code: 'network_error', message: err?.message || 'network error' };
	}
}

function freshForm() {
	return {
		type: 'limit', side: 'buy', mint: '', trigger_metric: 'mcap_usd',
		limit_price: '', stop_price: '', trail_pct: '25',
		size_sol: '0.1', sell_pct: '100', size_tokens: '',
		total_sol: '1', total_pct: '100',
		interval: '3600', slices: '6', slippage_bps: '500', expires_at: '',
		condition_mode: 'all',
		clauses: [{ signal: 'smart_money_score', op: 'gte', value: '60' }],
	};
}

registerWalletTab({
	id: 'orders',
	label: 'Orders',
	order: 46,
	ownerOnly: true,
	mount({ panel, ctx }) {
		injectStyle();
		const base = (sub = '') => `/api/agents/${ctx.agentId}/orders${sub ? '/' + sub : ''}?network=${ctx.getNetwork()}`;

		let destroyed = false;
		let es = null;
		const state = {
			loading: true, error: null,
			orders: [], summary: null, schema: null,
			form: freshForm(), preview: null, previewing: false, creating: false,
			live: false,
		};

		async function load() {
			state.loading = true; render();
			const [res, schemaRes] = await Promise.all([call(base()), state.schema ? Promise.resolve(null) : call(base('schema'))]);
			if (destroyed) return;
			state.loading = false;
			if (schemaRes && schemaRes.ok) state.schema = schemaRes.data;
			if (!res.ok) { state.error = res.message; }
			else { state.error = null; state.orders = res.data.orders || []; state.summary = res.data.summary || null; }
			render();
			subscribeLive();
		}

		// Live order status over SSE; gracefully no-ops if EventSource is missing.
		function subscribeLive() {
			if (destroyed || es || typeof EventSource === 'undefined') return;
			try {
				es = new EventSource(base('stream'), { withCredentials: true });
				es.addEventListener('orders', (e) => {
					try { const d = JSON.parse(e.data); state.orders = d.orders || state.orders; state.summary = d.summary || state.summary; state.live = true; renderListsOnly(); } catch { /* */ }
				});
				es.addEventListener('open', () => { state.live = true; });
				es.onerror = () => { state.live = false; if (es && es.readyState === EventSource.CLOSED) { es = null; } renderLiveBadge(); };
			} catch { es = null; }
		}

		// ── renderers ───────────────────────────────────────────────────────────
		function render() {
			if (destroyed) return;
			if (state.loading) {
				panel.innerHTML = `<div class="aord"><div class="aord-card"><div class="aord-skel" style="width:42%"></div><div class="aord-skel"></div><div class="aord-skel" style="width:70%"></div></div></div>`;
				return;
			}
			if (state.error) {
				panel.innerHTML = `<div class="aord"><div class="aord-err" role="alert">Couldn’t load your orders: ${esc(state.error)}</div><div class="aord-actions"><button type="button" class="aord-btn" id="aord-retry">Retry</button></div></div>`;
				panel.querySelector('#aord-retry')?.addEventListener('click', load);
				return;
			}
			panel.innerHTML = `<div class="aord">${renderHero()}${renderForm()}${renderOpen()}${renderHistory()}</div>`;
			wire();
		}

		// Re-render only the dynamic lists (used by the live stream so the form keeps focus).
		function renderListsOnly() {
			const open = panel.querySelector('#aord-open'); if (open) open.outerHTML = renderOpen();
			const hist = panel.querySelector('#aord-history'); if (hist) hist.outerHTML = renderHistory();
			const stats = panel.querySelector('#aord-stats'); if (stats) stats.outerHTML = renderStats();
			wireLists();
			renderLiveBadge();
		}

		function renderLiveBadge() {
			const b = panel.querySelector('#aord-livebadge');
			if (b) b.innerHTML = state.live ? `<span class="aord-live"><span class="dot"></span>live</span>` : '';
		}

		function renderStats() {
			const s = state.summary || {};
			return `<div class="aord-stats" id="aord-stats">
				<div class="aord-stat"><div class="l">Active</div><div class="n">${s.active ?? 0}</div></div>
				<div class="aord-stat"><div class="l">Filled</div><div class="n">${s.filled ?? 0}</div></div>
				<div class="aord-stat"><div class="l">Fills</div><div class="n">${s.lifetime_fills ?? 0}</div></div>
				<div class="aord-stat"><div class="l">Balance</div><div class="n">${s.balance_sol == null ? '—' : formatSol(s.balance_sol) + ' SOL'}</div></div>
			</div>`;
		}

		function renderHero() {
			const s = state.summary || {};
			const frozen = s.frozen ? `<div class="aord-banner" role="status"><span>🧊 Wallet frozen — orders won’t fire until you unfreeze it under Limits.</span></div>` : '';
			const killed = s.kill_switch ? `<div class="aord-banner" role="status"><span>⛔ Discretionary trading is paused (kill switch) — orders are held until you re-enable it.</span></div>` : '';
			const cancelAll = s.active ? `<button type="button" class="aord-btn danger sm" id="aord-cancel-all">Cancel all (${s.active})</button>` : '';
			return `<div class="aord-hero">
				<div class="aord-hero-top">
					<h2 class="aord-title">Programmable orders <span id="aord-livebadge">${state.live ? '<span class="aord-live"><span class="dot"></span>live</span>' : ''}</span><small>Limit · stop · trailing · DCA · TWAP · conditional — fired automatically, inside your guardrails.</small></h2>
					${cancelAll}
				</div>
				${renderStats()}
				${frozen}${killed}
			</div>`;
		}

		function renderForm() {
			const f = state.form;
			const typeGrid = Object.entries(TYPE_META).map(([k, m]) => `
				<button type="button" class="aord-type" data-type="${k}" aria-pressed="${f.type === k}">
					<div class="t">${m.icon} ${esc(m.label)}</div><div class="b">${esc(m.blurb)}</div>
				</button>`).join('');
			return `<div class="aord-card">
				<h3>＋ New order</h3>
				<p class="sub">Pick a type, set the trigger, preview the live fill condition + firewall verdict, then arm.</p>
				<div class="aord-types">${typeGrid}</div>
				<div class="aord-field">
					<label id="f-side-lbl">Side</label>
					<div class="aord-seg" role="group" aria-labelledby="f-side-lbl">
						<button type="button" data-side="buy" aria-pressed="${f.side === 'buy'}">Buy</button>
						<button type="button" data-side="sell" aria-pressed="${f.side === 'sell'}">Sell</button>
					</div>
				</div>
				<div class="aord-field"><label for="f-mint">Token mint</label><input class="aord-input" id="f-mint" placeholder="${THREE_MINT}" value="${esc(f.mint)}" spellcheck="false" autocomplete="off"/></div>
				${renderTypeFields(f)}
				<div class="aord-row">
					<div class="aord-field"><label for="f-slippage">Max slippage (bps)</label><input class="aord-input" id="f-slippage" type="number" min="1" max="5000" value="${esc(f.slippage_bps)}"/></div>
					<div class="aord-field"><label for="f-expires">Expires (optional)</label><input class="aord-input" id="f-expires" type="datetime-local" value="${esc(f.expires_at)}"/></div>
				</div>
				${state.preview ? renderPreview(state.preview) : ''}
				<div class="aord-actions">
					<button type="button" class="aord-btn" id="aord-preview" ${state.previewing ? 'disabled' : ''} ${state.previewing ? 'aria-busy="true"' : ''}>${state.previewing ? '<span class="aord-spin"></span>Checking…' : 'Preview'}</button>
					<button type="button" class="aord-btn primary" id="aord-create" ${state.creating ? 'disabled' : ''} ${state.creating ? 'aria-busy="true"' : ''}>${state.creating ? '<span class="aord-spin"></span>Arming…' : 'Arm order'}</button>
				</div>
			</div>`;
		}

		function renderTypeFields(f) {
			const metricSel = (id) => `<div class="aord-field"><label for="${id}">Trigger metric</label><select class="aord-select" id="${id}">${Object.entries(METRIC_LABEL).map(([k, l]) => `<option value="${k}" ${f.trigger_metric === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>`;
			const sizeField = f.side === 'buy'
				? `<div class="aord-field"><label for="f-size_sol">Size (SOL per fill)</label><input class="aord-input" id="f-size_sol" type="number" step="0.001" min="0" value="${esc(f.size_sol)}"/></div>`
				: `<div class="aord-field"><label for="f-sell_pct">Sell (% of holding)</label><input class="aord-input" id="f-sell_pct" type="number" step="1" min="1" max="100" value="${esc(f.sell_pct)}"/></div>`;

			if (f.type === 'limit') return `<div class="aord-row">${metricSel('f-metric')}<div class="aord-field"><label for="f-limit_price">Target (${shortMetric(f.trigger_metric)})</label><input class="aord-input" id="f-limit_price" type="number" step="any" min="0" value="${esc(f.limit_price)}" placeholder="${f.side === 'buy' ? 'buy at or below' : 'sell at or above'}"/></div></div><div class="aord-row">${sizeField}</div>`;
			if (f.type === 'stop') return `<div class="aord-row">${metricSel('f-metric')}<div class="aord-field"><label for="f-stop_price">Stop (${shortMetric(f.trigger_metric)})</label><input class="aord-input" id="f-stop_price" type="number" step="any" min="0" value="${esc(f.stop_price)}" placeholder="${f.side === 'sell' ? 'sell if it falls to' : 'buy once it breaks'}"/></div></div><div class="aord-row">${sizeField}</div>`;
			if (f.type === 'trailing') return `<div class="aord-row">${metricSel('f-metric')}<div class="aord-field"><label for="f-trail_pct">Trail (%)</label><input class="aord-input" id="f-trail_pct" type="number" step="0.1" min="0.1" max="99" value="${esc(f.trail_pct)}"/></div></div><div class="aord-row">${sizeField}</div>`;
			if (f.type === 'dca') return `<div class="aord-row"><div class="aord-field"><label for="f-interval">Every</label>${intervalSelect(f)}</div><div class="aord-field"><label for="f-slices">Slices</label><input class="aord-input" id="f-slices" type="number" min="1" max="1000" value="${esc(f.slices)}"/></div></div><div class="aord-row">${sizeField}</div>`;
			if (f.type === 'twap') {
				const total = f.side === 'buy'
					? `<div class="aord-field"><label for="f-total_sol">Total (SOL)</label><input class="aord-input" id="f-total_sol" type="number" step="0.001" min="0" value="${esc(f.total_sol)}"/></div>`
					: `<div class="aord-field"><label for="f-total_pct">Total (% of holding)</label><input class="aord-input" id="f-total_pct" type="number" step="1" min="1" max="100" value="${esc(f.total_pct)}"/></div>`;
				return `<div class="aord-row"><div class="aord-field"><label for="f-interval">Every</label>${intervalSelect(f)}</div><div class="aord-field"><label for="f-slices">Slices</label><input class="aord-input" id="f-slices" type="number" min="2" max="1000" value="${esc(f.slices)}"/></div></div><div class="aord-row">${total}</div>`;
			}
			if (f.type === 'conditional') return `${renderConditionBuilder(f)}<div class="aord-row">${sizeField}</div>`;
			return '';
		}

		function intervalSelect(f) {
			const opts = [['300', '5 min'], ['900', '15 min'], ['1800', '30 min'], ['3600', '1 hour'], ['21600', '6 hours'], ['86400', '1 day']];
			return `<select class="aord-select" id="f-interval">${opts.map(([v, l]) => `<option value="${v}" ${f.interval === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
		}

		function renderConditionBuilder(f) {
			const sig = state.schema?.signals || {};
			const sigOpts = Object.entries(sig).map(([k, v]) => [k, v.label, v.kind]);
			const clauseRow = (c, i) => {
				const def = sig[c.signal];
				const isBool = def?.kind === 'bool';
				const ops = isBool ? (state.schema?.bool_ops || ['is_true', 'is_false']) : (state.schema?.number_ops || ['gt', 'gte', 'lt', 'lte', 'eq', 'ne']);
				const valField = isBool ? '' : `<input class="aord-input" data-ci="${i}" data-cf="value" type="number" step="any" value="${esc(c.value)}" placeholder="value"/>`;
				return `<div class="aord-clause">
					<select class="aord-select" data-ci="${i}" data-cf="signal">${sigOpts.map(([k, l]) => `<option value="${k}" ${c.signal === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
					<select class="aord-select" data-ci="${i}" data-cf="op">${ops.map((o) => `<option value="${o}" ${c.op === o ? 'selected' : ''}>${esc(opLabel(o))}</option>`).join('')}</select>
					${valField}
					<button type="button" class="x" data-rm="${i}" title="Remove" aria-label="Remove clause">✕</button>
				</div>`;
			};
			return `<div class="aord-cond">
				<div class="aord-cond-mode">Fire when
					<div class="aord-seg" role="group">
						<button type="button" data-mode="all" aria-pressed="${f.condition_mode === 'all'}">ALL</button>
						<button type="button" data-mode="any" aria-pressed="${f.condition_mode === 'any'}">ANY</button>
					</div>
					of these are true:</div>
				${f.clauses.map(clauseRow).join('')}
				<button type="button" class="aord-btn ghost sm" id="aord-add-clause">＋ Add condition</button>
			</div>`;
		}

		function renderPreview(p) {
			if (!p.ok) return `<div class="aord-prev" role="alert"><div class="aord-err" style="margin:0">${esc(p.message || 'Invalid order')}</div></div>`;
			const cur = p.preview?.current;
			const fw = p.firewall;
			const lines = [];
			if (cur) {
				const cv = cur.value == null ? '—' : (cur.metric === 'mcap_usd' ? formatUsd(cur.value) : `${formatSol(cur.value)} ${cur.metric === 'price_sol' ? 'SOL/tok' : 'SOL'}`);
				lines.push(`<div class="ln">Now: <strong>${esc(cv)}</strong>${cur.graduated ? ' · graduated (AMM)' : ''}</div>`);
			}
			if (p.preview?.would_fire_now != null) lines.push(`<div class="ln">${p.preview.would_fire_now ? '⚡ Would fire immediately at the current price.' : '⏳ Waiting — the trigger isn’t met yet.'}</div>`);
			if (p.preview?.missing?.length) lines.push(`<div class="ln">⚠️ No live data yet for: ${esc(p.preview.missing.join(', '))} (won’t fire until available).</div>`);
			if (fw) lines.push(`<div class="ln">Firewall: <span class="aord-fw ${esc(fw.verdict)}">${esc(fw.verdict)}</span>${fw.reasons?.length ? ' · ' + esc(fw.reasons.join(', ')) : ''}</div>`);
			return `<div class="aord-prev" role="status"><div class="rb">${esc(p.readback || '')}</div>${lines.join('')}</div>`;
		}

		function renderOpen() {
			const open = state.orders.filter((o) => OPEN_STATUSES.includes(o.status));
			const inner = open.length
				? `<ul class="aord-list">${open.map(renderOrderItem).join('')}</ul>`
				: `<div class="aord-empty"><div class="ic">📋</div>No open orders. Create one above — it’ll fire automatically when its trigger is met.</div>`;
			return `<div class="aord-card" id="aord-open"><h3>Open orders</h3><p class="sub">Each is evaluated against live on-chain data and fires through your firewall + spend guards.</p>${inner}</div>`;
		}

		function renderHistory() {
			const done = state.orders.filter((o) => !OPEN_STATUSES.includes(o.status));
			if (!done.length) return `<div class="aord-card" id="aord-history" style="display:none"></div>`;
			return `<div class="aord-card" id="aord-history"><h3>History</h3><ul class="aord-list">${done.slice(0, 30).map(renderOrderItem).join('')}</ul></div>`;
		}

		function renderOrderItem(o) {
			const m = TYPE_META[o.type] || { icon: '•' };
			const tone = STATUS_TONE[o.status] || 'muted';
			const foot = [];
			foot.push(`<span class="aord-pill ${tone}">${esc(o.status)}</span>`);
			if (o.last_price != null) foot.push(`now ${o.trigger_metric === 'mcap_usd' ? formatUsd(o.last_price) : formatSol(o.last_price)}`);
			if (o.fill_count) foot.push(`${o.fill_count} fill${o.fill_count === 1 ? '' : 's'}`);
			if (o.filled_sol) foot.push(`${formatSol(o.filled_sol)} SOL`);
			if (o.last_error && o.status !== 'filled') foot.push(`<span title="${esc(o.last_error)}">⚠ ${esc(String(o.last_error).slice(0, 48))}</span>`);
			const sched = (o.type === 'dca' || o.type === 'twap') && o.schedule
				? `<div class="aord-prog"><i style="width:${Math.min(100, Math.round((o.schedule.filled_slices || 0) / (o.schedule.slices || 1) * 100))}%"></i></div>` : '';
			const ctl = OPEN_STATUSES.includes(o.status) ? `<div class="aord-item-ctl">
					<button type="button" class="aord-btn ghost sm" data-pause="${esc(o.id)}">${o.status === 'paused' ? 'Resume' : 'Pause'}</button>
					<button type="button" class="aord-btn danger sm" data-cancel="${esc(o.id)}">Cancel</button>
					<button type="button" class="aord-btn ghost sm" data-fills="${esc(o.id)}">Fills</button>
				</div>` : `<div class="aord-item-ctl"><button type="button" class="aord-btn ghost sm" data-fills="${esc(o.id)}">Fills</button></div>`;
			return `<li class="aord-item" data-id="${esc(o.id)}">
				<div class="aord-item-top">
					<span class="aord-item-ic">${m.icon}</span>
					<div class="aord-item-body">
						<div class="aord-item-ttl">${esc((TYPE_META[o.type]?.label || o.type))} ${esc(o.side)} ${o.symbol ? '$' + esc(o.symbol) : esc(String(o.mint).slice(0, 4)) + '…'}</div>
						<div class="aord-item-desc">${esc(o.readback || '')}</div>
						${sched}
						<div class="aord-item-foot">${foot.join('')}</div>
						<div class="aord-fills" data-fills-for="${esc(o.id)}"></div>
					</div>
				</div>
				${ctl}
			</li>`;
		}

		// ── wiring ────────────────────────────────────────────────────────────────
		function wire() {
			panel.querySelectorAll('[data-type]').forEach((b) => b.addEventListener('click', () => { state.form.type = b.dataset.type; state.preview = null; render(); }));
			panel.querySelectorAll('[data-side]').forEach((b) => b.addEventListener('click', () => { state.form.side = b.dataset.side; state.preview = null; render(); }));
			panel.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => { state.form.condition_mode = b.dataset.mode; render(); }));
			bindInput('f-mint', 'mint'); bindInput('f-slippage', 'slippage_bps'); bindInput('f-expires', 'expires_at');
			bindInput('f-metric', 'trigger_metric', true); bindInput('f-limit_price', 'limit_price'); bindInput('f-stop_price', 'stop_price');
			bindInput('f-trail_pct', 'trail_pct'); bindInput('f-size_sol', 'size_sol'); bindInput('f-sell_pct', 'sell_pct');
			bindInput('f-total_sol', 'total_sol'); bindInput('f-total_pct', 'total_pct'); bindInput('f-interval', 'interval', true); bindInput('f-slices', 'slices');
			// re-render on metric change so unit labels update
			panel.querySelector('#f-metric')?.addEventListener('change', () => render());
			panel.querySelector('#aord-add-clause')?.addEventListener('click', () => { state.form.clauses.push({ signal: 'mcap_usd', op: 'lt', value: '40000' }); render(); });
			panel.querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', () => { state.form.clauses.splice(Number(b.dataset.rm), 1); if (!state.form.clauses.length) state.form.clauses.push({ signal: 'smart_money_score', op: 'gte', value: '60' }); render(); }));
			panel.querySelectorAll('[data-ci]').forEach((el) => el.addEventListener('change', () => {
				const i = Number(el.dataset.ci), field = el.dataset.cf;
				state.form.clauses[i][field] = el.value;
				if (field === 'signal') render(); // op set may change (bool vs number)
			}));
			panel.querySelector('#aord-preview')?.addEventListener('click', onPreview);
			panel.querySelector('#aord-create')?.addEventListener('click', onCreate);
			wireLists();
		}

		function wireLists() {
			panel.querySelector('#aord-cancel-all')?.addEventListener('click', onCancelAll);
			panel.querySelectorAll('[data-cancel]').forEach((b) => b.addEventListener('click', () => onCancel(b.dataset.cancel)));
			panel.querySelectorAll('[data-pause]').forEach((b) => b.addEventListener('click', () => onPause(b.dataset.pause)));
			panel.querySelectorAll('[data-fills]').forEach((b) => b.addEventListener('click', () => onFills(b.dataset.fills)));
		}

		function bindInput(elId, field, isSelect) {
			const el = panel.querySelector('#' + elId);
			if (!el) return;
			el.addEventListener(isSelect ? 'change' : 'input', (e) => { state.form[field] = e.target.value; });
		}

		function buildPayload() {
			const f = state.form;
			const o = { type: f.type, side: f.side, mint: f.mint.trim(), slippage_bps: Number(f.slippage_bps) || 500, trigger_metric: f.trigger_metric };
			if (f.expires_at) o.expires_at = new Date(f.expires_at).toISOString();
			if (f.side === 'buy') o.size_sol = Number(f.size_sol);
			else o.sell_pct = Number(f.sell_pct);
			if (f.type === 'limit') o.limit_price = Number(f.limit_price);
			else if (f.type === 'stop') o.stop_price = Number(f.stop_price);
			else if (f.type === 'trailing') o.trail_pct = Number(f.trail_pct);
			else if (f.type === 'dca') o.schedule = { interval_seconds: Number(f.interval), slices: Number(f.slices) };
			else if (f.type === 'twap') {
				o.schedule = { interval_seconds: Number(f.interval), slices: Number(f.slices) };
				if (f.side === 'buy') { o.total_sol = Number(f.total_sol); delete o.size_sol; } else { o.sell_pct = Number(f.total_pct); }
			} else if (f.type === 'conditional') {
				o.condition = { [f.condition_mode]: f.clauses.map((c) => state.schema?.signals?.[c.signal]?.kind === 'bool' ? { signal: c.signal, op: c.op } : { signal: c.signal, op: c.op, value: Number(c.value) }) };
			}
			return o;
		}

		async function onPreview() {
			state.previewing = true; state.preview = null; render();
			const res = await call(base('preview'), { method: 'POST', body: buildPayload() });
			if (destroyed) return;
			state.previewing = false;
			state.preview = res.ok ? res.data : { ok: false, message: res.message };
			render();
		}

		async function onCreate() {
			state.creating = true; render();
			const res = await call(base(), { method: 'POST', body: buildPayload() });
			if (destroyed) return;
			state.creating = false;
			if (!res.ok) { ctx.toast(res.message || 'Could not create order'); render(); return; }
			ctx.toast('Order armed — it’ll fire when its trigger is met.');
			state.form = freshForm(); state.preview = null;
			await load();
		}

		async function onCancel(id) {
			const res = await call(`${base().split('?')[0]}/${id}?network=${ctx.getNetwork()}`, { method: 'DELETE' });
			if (destroyed) return;
			if (!res.ok) { ctx.toast(res.message || 'Cancel failed'); return; }
			ctx.toast('Order cancelled.');
			await load();
		}

		async function onPause(id) {
			const o = state.orders.find((x) => x.id === id);
			const paused = o?.status === 'paused';
			const res = await call(`${base().split('?')[0]}/${id}?network=${ctx.getNetwork()}`, { method: 'PUT', body: { paused: !paused } });
			if (destroyed) return;
			if (!res.ok) { ctx.toast(res.message || 'Update failed'); return; }
			ctx.toast(paused ? 'Resumed.' : 'Paused.');
			await load();
		}

		async function onCancelAll() {
			if (!window.confirm('Cancel every active order? This is instant and can’t be undone.')) return;
			const res = await call(base('cancel-all'), { method: 'POST', body: {} });
			if (destroyed) return;
			if (!res.ok) { ctx.toast(res.message || 'Failed'); return; }
			ctx.toast(`Cancelled ${res.data.cancelled} order${res.data.cancelled === 1 ? '' : 's'}.`);
			await load();
		}

		async function onFills(id) {
			const host = panel.querySelector(`[data-fills-for="${CSS.escape(id)}"]`);
			if (!host) return;
			if (host.dataset.open === 'true') { host.dataset.open = 'false'; host.innerHTML = ''; return; }
			host.dataset.open = 'true';
			host.innerHTML = `<div class="aord-skel" style="width:60%"></div>`;
			const res = await call(`${base().split('?')[0]}/${id}?network=${ctx.getNetwork()}`);
			if (destroyed) return;
			if (!res.ok) { host.innerHTML = `<div class="aord-err" style="margin-top:8px">${esc(res.message)}</div>`; return; }
			const fills = res.data.fills || [];
			if (!fills.length) { host.innerHTML = `<div class="aord-item-foot" style="margin-top:8px"><span>No fills yet.</span></div>`; return; }
			host.innerHTML = `<div style="margin-top:9px;display:flex;flex-direction:column;gap:6px">${fills.map((fl) => {
				const sig = fl.signature ? `<a href="${esc(explorerTxUrl(fl.signature, ctx.getNetwork()))}" target="_blank" rel="noopener">receipt ↗</a>` : '';
				const amt = fl.side === 'buy' ? `${formatSol(fl.sol_amount)} SOL` : `${formatSol(fl.sol_amount)} SOL out`;
				return `<div class="aord-item-foot" style="margin:0"><span class="aord-pill ${STATUS_TONE[fl.status] || 'muted'}">${esc(fl.status)}</span><span>${esc(fl.trigger_reason || '')}</span><span>${esc(amt)}</span>${fl.price_impact_pct != null ? `<span>${Number(fl.price_impact_pct).toFixed(1)}% impact</span>` : ''}${sig}</div>`;
			}).join('')}</div>`;
		}

		function shortMetric(m) { return m === 'mcap_usd' ? 'USD' : m === 'mcap_sol' ? 'SOL' : 'SOL/tok'; }
		function opLabel(o) { return { gt: '>', gte: '≥', lt: '<', lte: '≤', eq: '=', ne: '≠', is_true: 'is true', is_false: 'is false' }[o] || o; }

		load();
		return {
			destroy() { destroyed = true; if (es) { try { es.close(); } catch { /* */ } es = null; } },
			onHide() { if (es) { try { es.close(); } catch { /* */ } es = null; state.live = false; } },
			onShow() { if (!destroyed && !es) { subscribeLive(); } },
		};
	},
});
