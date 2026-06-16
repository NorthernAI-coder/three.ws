/**
 * Copy-setup panel — mounted on a trader profile to start/edit copying them.
 *
 * Non-custodial: the copier supplies their own wallet and sizing/guard rules; we
 * never take keys. On submit it POSTs a copy_subscription; the fan-out cron then
 * turns the leader's future trades into sized, safety-checked intents the copier
 * acts on from `/dashboard/copy`.
 *
 * Self-contained: handles signed-out (CTA), first-time (form), and already-
 * copying (summary + edit) states, plus loading/error. Import and call
 * `mountCopyPanel(el, { leaderAgentId, leaderName, network })`.
 */

import { escapeHtml } from './trader-format.js';

const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const $ = (sel, root) => root.querySelector(sel);

async function api(path, opts = {}) {
	const res = await fetch(path, {
		credentials: 'include',
		headers: { accept: 'application/json', ...(opts.body ? { 'content-type': 'application/json' } : {}) },
		...opts,
	});
	return res;
}

export async function mountCopyPanel(el, { leaderAgentId, leaderName, network = 'mainnet' }) {
	el.classList.add('cp');
	el.innerHTML = `<div class="cp-loading"><span class="tp-sk" style="width:40%;height:18px"></span></div>`;

	let res;
	try {
		res = await api('/api/copy/subscriptions');
	} catch {
		return renderSignedOut(el, leaderName); // network failure → treat as unauthenticated CTA
	}

	if (res.status === 401) return renderSignedOut(el, leaderName);
	if (!res.ok) return renderError(el, () => mountCopyPanel(el, { leaderAgentId, leaderName, network }));

	const { subscriptions = [] } = await res.json().catch(() => ({ subscriptions: [] }));
	const existing = subscriptions.find((s) => s.leader_agent_id === leaderAgentId && s.network === network);

	if (existing && existing.status !== 'stopped') {
		return renderActive(el, { existing, leaderName, leaderAgentId, network });
	}
	return renderForm(el, { leaderAgentId, leaderName, network, prefill: existing || null });
}

// --- States ------------------------------------------------------------------
function renderSignedOut(el, leaderName) {
	const next = encodeURIComponent(location.pathname + location.search);
	el.innerHTML = `
		<h2>Copy ${escapeHtml(leaderName || 'this trader')}</h2>
		<p>Mirror their entries to your own wallet — non-custodially, with your own size and risk caps. Sign in to set it up.</p>
		<div class="cp-actions">
			<a class="lb-btn lb-btn-primary" href="/login?next=${next}">Sign in to copy</a>
			<a class="lb-btn" href="/play/arena">Watch in the Arena →</a>
		</div>`;
}

function renderError(el, retry) {
	el.innerHTML = `
		<h2>Copy setup</h2>
		<p>Couldn't load your copy settings. This is usually transient.</p>
		<div class="cp-actions"><button class="lb-btn lb-btn-primary" id="cp-retry">Retry</button></div>`;
	$('#cp-retry', el)?.addEventListener('click', retry);
}

function renderActive(el, { existing, leaderName, leaderAgentId, network }) {
	const s = existing;
	const sizeLabel = s.sizing_rule === 'fixed' ? `${Number(s.fixed_sol)} SOL fixed`
		: s.sizing_rule === 'multiplier' ? `${Number(s.multiplier)}× their size`
		: `${Number(s.pct_balance)}% of balance`;
	const paused = s.status === 'paused';
	el.innerHTML = `
		<h2>You're copying ${escapeHtml(leaderName || 'this trader')} ${paused ? '<span class="tp-soon" style="color:var(--ink-faint);border-color:var(--stroke)">Paused</span>' : '<span class="cp-on">● Active</span>'}</h2>
		<p>${escapeHtml(sizeLabel)} · cap ${Number(s.per_trade_cap_sol)} SOL/trade · ${Number(s.daily_budget_sol)} SOL/day.
		   New trades arrive as intents in your dashboard.</p>
		<div class="cp-actions">
			<a class="lb-btn lb-btn-primary" href="/dashboard/copy">Manage copies →</a>
			<button class="lb-btn" id="cp-toggle">${paused ? 'Resume' : 'Pause'}</button>
			<button class="lb-btn" id="cp-edit">Edit size</button>
		</div>`;
	$('#cp-toggle', el)?.addEventListener('click', async () => {
		const next = paused ? 'active' : 'paused';
		const r = await api('/api/copy/subscriptions', { method: 'POST', body: JSON.stringify({ id: s.id, status: next }) });
		if (r.ok) mountCopyPanel(el, { leaderAgentId, leaderName, network });
	});
	$('#cp-edit', el)?.addEventListener('click', () => renderForm(el, { leaderAgentId, leaderName, network, prefill: s }));
}

function renderForm(el, { leaderAgentId, leaderName, network, prefill }) {
	const p = prefill || {};
	const rule = p.sizing_rule || 'fixed';
	el.innerHTML = `
		<h2>Copy ${escapeHtml(leaderName || 'this trader')}</h2>
		<p>You sign every trade from your own wallet. We never take custody — these are sized intents, capped by your rules.</p>
		<form class="cp-form" id="cp-form" novalidate>
			<label class="cp-field">
				<span class="cp-label">Your Solana wallet</span>
				<input class="cp-input" id="cp-wallet" inputmode="text" autocomplete="off" spellcheck="false"
				       placeholder="Your wallet address" value="${escapeHtml(p.copier_wallet || '')}" required />
			</label>

			<div class="cp-field">
				<span class="cp-label">How to size each copy</span>
				<div class="cp-seg" id="cp-rule">
					<button type="button" class="cp-seg-btn ${rule === 'fixed' ? 'is-active' : ''}" data-rule="fixed">Fixed SOL</button>
					<button type="button" class="cp-seg-btn ${rule === 'multiplier' ? 'is-active' : ''}" data-rule="multiplier">× their size</button>
					<button type="button" class="cp-seg-btn ${rule === 'pct_balance' ? 'is-active' : ''}" data-rule="pct_balance">% of wallet</button>
				</div>
			</div>

			<div class="cp-row">
				<label class="cp-field" data-for="fixed" ${rule !== 'fixed' ? 'hidden' : ''}>
					<span class="cp-label">SOL per copy</span>
					<input class="cp-input" id="cp-fixed" type="number" step="0.01" min="0" value="${Number(p.fixed_sol) || 0.2}" />
				</label>
				<label class="cp-field" data-for="multiplier" ${rule !== 'multiplier' ? 'hidden' : ''}>
					<span class="cp-label">Multiplier (× leader)</span>
					<input class="cp-input" id="cp-mult" type="number" step="0.05" min="0" value="${Number(p.multiplier) || 0.1}" />
				</label>
				<label class="cp-field" data-for="pct_balance" ${rule !== 'pct_balance' ? 'hidden' : ''}>
					<span class="cp-label">% of your wallet</span>
					<input class="cp-input" id="cp-pct" type="number" step="1" min="0" max="100" value="${Number(p.pct_balance) || 5}" />
				</label>
			</div>

			<div class="cp-row">
				<label class="cp-field">
					<span class="cp-label">Max per trade (SOL)</span>
					<input class="cp-input" id="cp-cap" type="number" step="0.05" min="0.01" value="${Number(p.per_trade_cap_sol) || 0.5}" required />
				</label>
				<label class="cp-field">
					<span class="cp-label">Daily budget (SOL)</span>
					<input class="cp-input" id="cp-daily" type="number" step="0.1" min="0.01" value="${Number(p.daily_budget_sol) || 1}" required />
				</label>
			</div>

			<details class="cp-advanced">
				<summary>Advanced filters</summary>
				<div class="cp-row">
					<label class="cp-field">
						<span class="cp-label">Min market cap (USD)</span>
						<input class="cp-input" id="cp-mcf" type="number" step="1000" min="0" placeholder="any" value="${p.mcap_floor_usd ?? ''}" />
					</label>
					<label class="cp-field">
						<span class="cp-label">Max market cap (USD)</span>
						<input class="cp-input" id="cp-mcc" type="number" step="1000" min="0" placeholder="any" value="${p.mcap_ceiling_usd ?? ''}" />
					</label>
				</div>
				<label class="cp-check"><input type="checkbox" id="cp-sells" ${p.copy_sells === false ? '' : 'checked'} /> <span>Mirror their exits too</span></label>
				<label class="cp-check"><input type="checkbox" id="cp-safe" ${p.require_safety_pass ? 'checked' : ''} /> <span>Only copy when coin safety is confirmed</span></label>
			</details>

			<p class="cp-err" id="cp-err" hidden></p>
			<div class="cp-actions">
				<button class="lb-btn lb-btn-primary" type="submit" id="cp-submit">${prefill ? 'Save copy settings' : 'Start copying'}</button>
			</div>
			<p class="cp-fine">Copy trading is risky. You execute every trade yourself; past performance is not a guarantee.</p>
		</form>`;

	const ruleSeg = $('#cp-rule', el);
	ruleSeg.addEventListener('click', (e) => {
		const btn = e.target.closest('.cp-seg-btn');
		if (!btn) return;
		ruleSeg.querySelectorAll('.cp-seg-btn').forEach((b) => b.classList.toggle('is-active', b === btn));
		el.querySelectorAll('[data-for]').forEach((f) => { f.hidden = f.dataset.for !== btn.dataset.rule; });
	});

	$('#cp-form', el).addEventListener('submit', async (e) => {
		e.preventDefault();
		const errEl = $('#cp-err', el);
		errEl.hidden = true;
		const sizing = ruleSeg.querySelector('.cp-seg-btn.is-active')?.dataset.rule || 'fixed';
		const wallet = $('#cp-wallet', el).value.trim();
		if (!BASE58_RE.test(wallet)) return showErr(errEl, 'Enter a valid Solana wallet address.');

		const num = (id) => Number($(`#${id}`, el).value);
		const body = {
			leader_agent_id: leaderAgentId,
			network,
			copier_wallet: wallet,
			sizing_rule: sizing,
			fixed_sol: num('cp-fixed'),
			multiplier: num('cp-mult'),
			pct_balance: num('cp-pct'),
			per_trade_cap_sol: num('cp-cap'),
			daily_budget_sol: num('cp-daily'),
			mcap_floor_usd: $('#cp-mcf', el).value === '' ? null : num('cp-mcf'),
			mcap_ceiling_usd: $('#cp-mcc', el).value === '' ? null : num('cp-mcc'),
			copy_sells: $('#cp-sells', el).checked,
			require_safety_pass: $('#cp-safe', el).checked,
		};

		const btn = $('#cp-submit', el);
		btn.disabled = true; btn.textContent = 'Saving…';
		try {
			const r = await api('/api/copy/subscriptions', { method: 'POST', body: JSON.stringify(body) });
			const data = await r.json().catch(() => ({}));
			if (!r.ok) { btn.disabled = false; btn.textContent = prefill ? 'Save copy settings' : 'Start copying'; return showErr(errEl, data.message || 'Could not save.'); }
			mountCopyPanel(el, { leaderAgentId, leaderName, network });
		} catch {
			btn.disabled = false; btn.textContent = prefill ? 'Save copy settings' : 'Start copying';
			showErr(errEl, 'Network error — try again.');
		}
	});
}

function showErr(el, msg) { el.textContent = msg; el.hidden = false; }
