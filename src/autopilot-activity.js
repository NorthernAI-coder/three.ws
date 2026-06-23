// /autopilot-activity — the dedicated receipts surface for Memory-grounded
// Autopilot (Living Agents · Task 08).
//
// Lists every autonomous action across the owner's agents (or a single agent via
// ?agent=<id>), newest first, each with its full explanation, the source memories
// that motivated it (linking into the Knowledge tab), a signed-receipt badge, and
// an on-chain tx link / one-tap undo where applicable. Real reads of the
// append-only agent_actions log via /api/autopilot/activity.

import { apiFetch } from './api.js';
import { receiptRow, showReceiptChip } from './autopilot-mind.js';

const params = new URLSearchParams(location.search);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
let agentFilter = (params.get('agent') && UUID_RE.test(params.get('agent'))) ? params.get('agent') : '';
let cursor = null;
let loading = false;

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]);

function url() {
	const u = new URL('/api/autopilot/activity', location.origin);
	u.searchParams.set('limit', '25');
	if (agentFilter) u.searchParams.set('agentId', agentFilter);
	if (cursor) u.searchParams.set('cursor', cursor);
	return u.pathname + u.search;
}

function renderState(html) {
	$('ledger').innerHTML = html;
	$('loadmore').hidden = true;
}

function populateAgentFilter(agents) {
	const sel = $('agent-filter');
	if (sel.dataset.filled || !agents?.length) return;
	sel.dataset.filled = '1';
	for (const a of agents) {
		const opt = document.createElement('option');
		opt.value = a.id;
		opt.textContent = a.name || `Agent ${a.id.slice(0, 6)}`;
		sel.appendChild(opt);
	}
	sel.value = agentFilter;
}

function renderTrust(trust) {
	const slot = $('trust-slot');
	if (!trust) { slot.innerHTML = ''; return; }
	slot.innerHTML = `<span class="apm-badge ${esc(trust.level)}" title="${esc(trust.blurb)}">${esc(trust.label)} · ${esc(String(trust.stats?.executed ?? 0))} actions</span>`;
}

async function load({ append = false } = {}) {
	if (loading) return;
	loading = true;
	const ledger = $('ledger');
	if (!append) ledger.innerHTML = '<div class="skel"></div><div class="skel"></div><div class="skel"></div>';
	$('loadmore').disabled = true;
	try {
		const r = await apiFetch(url(), { credentials: 'include', allowAnonymous: true });
		if (r.status === 401) {
			renderState(`<div class="state"><div class="ico">🔒</div><h2>Sign in to see your agent's activity</h2><p>Every autonomous action lives here once you're signed in.</p><a class="btn" href="/login?next=${encodeURIComponent(location.pathname + location.search)}">Sign in</a></div>`);
			return;
		}
		const j = await r.json().catch(() => ({}));
		if (!r.ok) throw new Error(j.error_description || j.error || `HTTP ${r.status}`);

		populateAgentFilter(j.agents);
		renderTrust(j.trust);

		const receipts = j.receipts || [];
		if (!append && !receipts.length) {
			renderState(`<div class="state"><div class="ico">🧭</div><h2>No actions yet</h2><p>When your agent acts on your behalf — sets an alert, writes a briefing, sends $THREE — every move shows up here with the memory that motivated it.</p><a class="btn" href="/dashboard">Set up autopilot →</a></div>`);
			return;
		}

		const html = receipts.map((rc) => receiptRow(rc, rc.agentId, { undo: true, showAgent: !agentFilter })).join('');
		if (append) ledger.insertAdjacentHTML('beforeend', html);
		else ledger.innerHTML = html;

		cursor = j.next_cursor;
		$('loadmore').hidden = !cursor;
		wireUndo(ledger);
	} catch (err) {
		if (!append) {
			renderState(`<div class="state"><div class="ico">⚠️</div><h2>Couldn't load activity</h2><p>${esc(err.message)}</p><button class="btn" id="retry">Retry</button></div>`);
			$('retry')?.addEventListener('click', () => load());
		}
	} finally {
		loading = false;
		$('loadmore').disabled = false;
	}
}

function wireUndo(scope) {
	scope.querySelectorAll('[data-undo]').forEach((btn) => {
		if (btn.dataset.wired) return;
		btn.dataset.wired = '1';
		btn.addEventListener('click', async () => {
			const card = btn.closest('.apm-receipt');
			const agentId = card?.dataset.agent || agentFilter || resolveAgentForUndo(btn);
			btn.disabled = true;
			btn.textContent = 'Undoing…';
			try {
				const r = await apiFetch('/api/autopilot/proposals', {
					method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
					body: JSON.stringify({ agentId, action: 'undo', proposalId: btn.dataset.undo }),
				});
				const j = await r.json().catch(() => ({}));
				if (!r.ok) throw new Error(j.error_description || j.error || `HTTP ${r.status}`);
				showReceiptChip('Undone — your agent will be more cautious.', { icon: '↩' });
				cursor = null;
				load();
			} catch (err) {
				btn.disabled = false;
				btn.textContent = 'Undo';
				showReceiptChip(err.message, { icon: '⚠' });
			}
		});
	});
}

// When aggregating across agents, the undo needs the receipt's own agent id —
// it's carried on the receipt row's source links; fall back to the filter.
function resolveAgentForUndo(btn) {
	const row = btn.closest('.apm-receipt');
	const link = row?.querySelector('a.apm-source[href*="/agent/"]');
	if (link) {
		const m = link.getAttribute('href').match(/\/agent\/([0-9a-f-]{36})/i);
		if (m) return m[1];
	}
	return agentFilter;
}

$('agent-filter').addEventListener('change', (e) => {
	agentFilter = e.target.value;
	cursor = null;
	const next = new URL(location.href);
	if (agentFilter) next.searchParams.set('agent', agentFilter); else next.searchParams.delete('agent');
	history.replaceState(null, '', next);
	load();
});

$('loadmore').addEventListener('click', () => load({ append: true }));

load();
