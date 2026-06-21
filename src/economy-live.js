/**
 * The Agent Economy — live across the network (Pillar 3).
 *
 * The /agent-economy page is a curated two-agent on-chain demo. This is the
 * wide-angle counterpart: the real population of agents earning on three.ws and
 * the paid services they expose over x402. Reads real, keyless endpoints
 * (no mocks):
 *   - GET /api/marketplace/agents  — published agents with ratings, buyer counts
 *     and on-chain pricing.
 *   - GET /api/agenc/x402-services — the live x402 bazaar: agent/tool endpoints
 *     charging USDC per call, with price, network and capabilities.
 *
 * Every section owns its loading / empty / error state independently so a slow
 * or failing feed never blanks the page.
 */

const $ = (sel) => /** @type {HTMLElement} */ (document.querySelector(sel));

// ── Formatting helpers ────────────────────────────────────────────────────────

function fmtUsd(amountAtomics, decimals) {
	const d = Number.isFinite(decimals) ? decimals : 6;
	const n = Number(amountAtomics) / 10 ** d;
	if (!Number.isFinite(n)) return null;
	if (n === 0) return 'Free';
	if (n < 0.01) return `$${n.toFixed(4)}`;
	return `$${n.toFixed(2)}`;
}

function esc(s) {
	return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function chainLabel(chain) {
	const c = String(chain || '').toLowerCase();
	if (c.includes('sol')) return 'Solana';
	if (c.includes('base')) return 'Base';
	if (c.includes('eth')) return 'Ethereum';
	return chain || '';
}

function stars(avg, count) {
	if (!count) return '<span class="ae-muted">No ratings yet</span>';
	const a = Math.round((Number(avg) || 0) * 10) / 10;
	return `<span class="ae-stars" aria-label="${a} out of 5">★ ${a.toFixed(1)}</span> <span class="ae-muted">(${count})</span>`;
}

// ── State rendering ───────────────────────────────────────────────────────────

function skeleton(host, n, kind) {
	host.innerHTML = '';
	for (let i = 0; i < n; i++) {
		const s = document.createElement('div');
		s.className = `ae-skel ae-skel-${kind}`;
		host.appendChild(s);
	}
}

function emptyState(host, title, hint) {
	host.innerHTML = `<div class="ae-empty"><p class="ae-empty-title">${esc(title)}</p><p class="ae-muted">${esc(hint)}</p></div>`;
}

function errorState(host, retryFn) {
	host.innerHTML = '';
	const box = document.createElement('div');
	box.className = 'ae-error';
	box.innerHTML = `<p>Couldn't load this feed.</p>`;
	const btn = document.createElement('button');
	btn.className = 'ae-retry';
	btn.type = 'button';
	btn.textContent = 'Retry';
	btn.addEventListener('click', retryFn);
	box.appendChild(btn);
	host.appendChild(box);
}

// ── Section: earning agents ───────────────────────────────────────────────────

function agentCard(a) {
	const thumb = a.thumbnail_url || '';
	const price = a.price ? fmtUsd(a.price.amount, a.price.mint_decimals) : null;
	const priceChip = price
		? `<span class="ae-chip ae-chip-price">${esc(price)}${a.price?.chain ? ` · ${esc(chainLabel(a.price.chain))}` : ''}</span>`
		: a.has_paid_skills ? '<span class="ae-chip">Paid skills</span>' : '<span class="ae-chip ae-chip-free">Free</span>';
	const buyers = Number(a.buyers_total) || 0;
	const buyers24 = Number(a.buyers_24h) || 0;
	return `
		<a class="ae-card" href="/marketplace/agents/${encodeURIComponent(a.id)}">
			<div class="ae-card-top">
				<div class="ae-avatar">${thumb ? `<img src="${esc(thumb)}" alt="" loading="lazy" />` : `<span class="ae-avatar-fallback">${esc((a.name || '?').slice(0, 1).toUpperCase())}</span>`}</div>
				<div class="ae-card-head">
					<span class="ae-card-name">${esc(a.name || 'Untitled agent')}</span>
					<span class="ae-muted ae-card-cat">${esc(a.category || 'general')}</span>
				</div>
			</div>
			<p class="ae-card-desc">${esc((a.description || '').slice(0, 110))}</p>
			<div class="ae-card-foot">
				<span class="ae-rating">${stars(a.rating_avg, a.rating_count)}</span>
				${priceChip}
			</div>
			<div class="ae-card-metrics">
				<span title="Total buyers"><strong>${buyers.toLocaleString()}</strong> buyers</span>
				${buyers24 > 0 ? `<span class="ae-up" title="Buyers in the last 24h">▲ ${buyers24.toLocaleString()} / 24h</span>` : ''}
			</div>
		</a>`;
}

async function loadAgents({ quiet = false } = {}) {
	const host = $('#ae-agents');
	if (!host) return;
	if (!quiet) skeleton(host, 6, 'card');
	try {
		const sort = $('#ae-sort')?.value || 'top_rated';
		const params = new URLSearchParams({ sort, limit: '24' });
		const r = await fetch(`/api/marketplace/agents?${params}`, { credentials: 'include' });
		if (!r.ok) throw new Error(`status ${r.status}`);
		const j = await r.json();
		const items = j?.data?.items || j?.items || [];
		if (!items.length) {
			emptyState(host, 'No published agents yet', 'Be the first — build an agent and price a skill.');
			setStat('#ae-stat-agents', '0');
			return;
		}
		host.innerHTML = items.map(agentCard).join('');
		setStat('#ae-stat-agents', items.length >= 24 ? '24+' : String(items.length));
		const earners = items.filter((a) => (Number(a.buyers_total) || 0) > 0).length;
		setStat('#ae-stat-earning', String(earners));
	} catch (err) {
		errorState(host, loadAgents);
		// eslint-disable-next-line no-console
		console.error('[economy-live] agents', err);
	}
}

// ── Section: live x402 services ───────────────────────────────────────────────

function serviceRow(t) {
	const price = t.price?.amountLabel
		? `${esc(t.price.amountLabel)}${t.price.currency ? ` ${esc(t.price.currency)}` : ''}`
		: 'Free';
	const net = t.price?.network ? chainLabel(t.price.network) : '';
	const method = t.method ? `<span class="ae-svc-method">${esc(t.method)}</span>` : '';
	const tags = (t.tags || []).slice(0, 3).map((x) => `<span class="ae-tag">${esc(x)}</span>`).join('');
	return `
		<a class="ae-svc" href="${esc(t.resource || '#')}" rel="noopener" target="_blank">
			<div class="ae-svc-main">
				<span class="ae-svc-name">${method}${esc(t.serviceName || t.toolName || 'Service')}</span>
				<span class="ae-svc-desc ae-muted">${esc((t.description || '').slice(0, 120))}</span>
				<span class="ae-svc-tags">${tags}</span>
			</div>
			<div class="ae-svc-price">
				<span class="ae-chip ae-chip-price">${price}</span>
				${net ? `<span class="ae-muted ae-svc-net">${esc(net)}</span>` : ''}
			</div>
		</a>`;
}

async function loadServices({ quiet = false } = {}) {
	const host = $('#ae-services');
	if (!host) return;
	if (!quiet) skeleton(host, 5, 'row');
	try {
		const params = new URLSearchParams({ type: 'http', maxItems: '40' });
		const r = await fetch(`/api/agenc/x402-services?${params}`);
		if (!r.ok) throw new Error(`status ${r.status}`);
		const j = await r.json();
		const tasks = j?.tasks || [];
		if (!tasks.length) {
			emptyState(host, 'No live x402 services right now', 'Agents publish pay-per-call endpoints here as they come online.');
			setStat('#ae-stat-services', '0');
			return;
		}
		host.innerHTML = tasks.map(serviceRow).join('');
		setStat('#ae-stat-services', tasks.length >= 40 ? '40+' : String(tasks.length));
	} catch (err) {
		errorState(host, loadServices);
		// eslint-disable-next-line no-console
		console.error('[economy-live] services', err);
	}
}

function setStat(sel, value) {
	const el = $(sel);
	if (el) el.textContent = value;
}

const REFRESH_MS = 45000;
let _refreshTimer = 0;

function scheduleRefresh() {
	clearInterval(_refreshTimer);
	_refreshTimer = window.setInterval(() => {
		if (document.hidden) return; // don't poll a backgrounded tab
		loadAgents({ quiet: true });
		loadServices({ quiet: true });
		pulseLive();
	}, REFRESH_MS);
}

function pulseLive() {
	const live = $('#ae-live');
	if (!live) return;
	live.hidden = false;
	const label = $('#ae-live-label');
	if (label) {
		label.textContent = 'Updated just now';
		setTimeout(() => { label.textContent = 'Live'; }, 2500);
	}
}

export function initEconomyLive() {
	loadAgents().then(() => pulseLive());
	loadServices();
	const sortEl = $('#ae-sort');
	if (sortEl) sortEl.addEventListener('change', () => loadAgents());
	scheduleRefresh();
}

if (typeof document !== 'undefined') {
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', initEconomyLive, { once: true });
	} else {
		initEconomyLive();
	}
}
