// Bounties list — three.ws/bounties
//
// Mirrors pump.fun GO's public bounty board via our cached proxy
// (/api/pump-bounties). Cursor-paginated; sort is applied client-side over the
// loaded set. Read-only.

const API = '/api/pump-bounties';
const PAGE = 30;

let items = [];
let nextCursor = null;
let loading = false;
let sortKey = 'reward';

const grid = () => document.getElementById('grid');

// ── Boot ──────────────────────────────────────────────────────────────────────

function init() {
	bindControls();
	load(true);
}

function bindControls() {
	document.getElementById('sort-seg').addEventListener('click', (e) => {
		const btn = e.target.closest('button[data-sort]');
		if (!btn) return;
		document.querySelectorAll('#sort-seg button').forEach((b) => b.classList.remove('active'));
		btn.classList.add('active');
		sortKey = btn.dataset.sort;
		renderGrid();
	});
	document.getElementById('refresh-btn').addEventListener('click', () => load(true));
	grid().addEventListener('click', (e) => {
		const card = e.target.closest('.card[data-id]');
		if (card) location.href = `/bounty/${card.dataset.id}`;
	});
}

// ── Data ──────────────────────────────────────────────────────────────────────

async function load(reset = false) {
	if (loading) return;
	loading = true;
	if (reset) {
		items = [];
		nextCursor = null;
		grid().innerHTML = skeletons(8);
	} else {
		setLoadMore('Loading…', true);
	}

	try {
		const url = new URL(API, location.origin);
		url.searchParams.set('limit', String(PAGE));
		if (!reset && nextCursor) url.searchParams.set('cursor', nextCursor);
		const r = await fetch(url);
		const data = await r.json();
		if (!r.ok) throw new Error(data.error_description || data.error || `HTTP ${r.status}`);

		items = reset ? data.items || [] : items.concat(data.items || []);
		nextCursor = data.nextCursor || null;
		renderGrid();
	} catch (err) {
		if (reset) {
			grid().innerHTML = errorState(err.message);
		} else {
			setLoadMore('Retry', false);
		}
	} finally {
		loading = false;
	}
}

// ── Render ────────────────────────────────────────────────────────────────────

function sorted() {
	const by = {
		reward: (a, b) => (b.reward.totalUsd || 0) - (a.reward.totalUsd || 0),
		newest: (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0),
		submissions: (a, b) => (b.counts.submissions || 0) - (a.counts.submissions || 0),
		likes: (a, b) => (b.likeCount || 0) - (a.likeCount || 0),
	}[sortKey];
	return [...items].sort(by);
}

function renderGrid() {
	const el = grid();
	if (!items.length) {
		el.innerHTML = emptyState();
		return;
	}
	el.innerHTML = sorted().map(card).join('');
	if (nextCursor) {
		const btn = document.createElement('button');
		btn.className = 'load-more';
		btn.id = 'load-more';
		btn.textContent = 'Load more';
		btn.addEventListener('click', () => load(false));
		el.appendChild(btn);
	}
}

function card(b) {
	const img = b.attachments.find(
		(a) => a.kind === 'image' || /^image\//.test(a.contentType || ''),
	);
	const thumb = img
		? `<div class="card-thumb" style="background-image:url('${esc(img.url)}')">${statusBadge(b.status, true)}</div>`
		: `<div class="card-thumb empty">🎯${statusBadge(b.status, true)}</div>`;
	const usd = b.reward.totalUsd != null ? `$${fmtNum(b.reward.totalUsd)}` : '—';
	const token = b.reward.sol != null ? `◎ ${fmtNum(b.reward.sol)} SOL` : tokenLabel(b);
	const left = timeLeft(b.expiresAt);

	return `
	<article class="card" data-id="${esc(b.taskId)}">
		${thumb}
		<div class="card-body">
			<div class="card-title">${esc(b.title) || 'Untitled bounty'}</div>
			<div class="card-reward">
				<span class="reward-usd">${usd}</span>
				${token ? `<span class="reward-token">${esc(token)}</span>` : ''}
			</div>
			<div class="card-meta">
				<span class="m">${iconUser()} ${shortAddr(b.creator.address)}${b.creator.xVerified ? ` <span class="verified" title="X verified">✔</span>` : ''}</span>
				<span class="m">${iconSubs()} ${b.counts.submissions} subs</span>
				<span class="m">♥ ${b.likeCount}</span>
				${left ? `<span class="m">⏳ ${esc(left)}</span>` : ''}
			</div>
		</div>
	</article>`;
}

function statusBadge(status, float = false) {
	const s = String(status || '').toUpperCase();
	let cls = 'badge-pending',
		label = s.replace(/_/g, ' ');
	if (s === 'OPEN' || s === 'ACTIVE' || s === 'PUBLISHED') {
		cls = 'badge-open';
		label = 'Open';
	} else if (s.includes('PENDING')) {
		cls = 'badge-pending';
		label = 'Resolving';
	} else if (
		s.includes('CLOSED') ||
		s.includes('AWARD') ||
		s.includes('RESOLVED') ||
		s.includes('REFUND')
	) {
		cls = 'badge-closed';
		label = label.charAt(0) + label.slice(1).toLowerCase();
	}
	if (!label) label = 'Bounty';
	return `<span class="badge ${cls}${float ? ' badge-float' : ''}">${esc(label)}</span>`;
}

function tokenLabel(b) {
	const leg = b.reward.legs && b.reward.legs[0];
	if (!leg || leg.amount == null) return '';
	return `${fmtNum(leg.amount)} tokens`;
}

// ── States ────────────────────────────────────────────────────────────────────

function skeletons(n) {
	return Array.from({ length: n }, () => `<div class="skeleton skel-card"></div>`).join('');
}
function emptyState() {
	return `<div class="empty"><div class="ico">🎯</div><h3>No open bounties right now</h3><p>The pump.fun GO board is quiet at the moment. Check back shortly.</p></div>`;
}
function errorState(msg) {
	return `<div class="errbox"><div class="ico">⚠️</div><h3>Couldn't load bounties</h3><p>${esc(msg)}</p><button class="btn btn-ghost btn-sm" onclick="location.reload()">Try again</button></div>`;
}
function setLoadMore(text, disabled) {
	const b = document.getElementById('load-more');
	if (b) {
		b.textContent = text;
		b.disabled = disabled;
	}
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function esc(str) {
	if (str == null) return '';
	return String(str)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}
function fmtNum(n) {
	const x = Number(n) || 0;
	if (x >= 1000) return x.toLocaleString('en-US', { maximumFractionDigits: 0 });
	if (x >= 1) return x.toLocaleString('en-US', { maximumFractionDigits: 2 });
	return x.toLocaleString('en-US', { maximumFractionDigits: 4 });
}
function timeLeft(iso) {
	if (!iso) return '';
	const ms = new Date(iso) - Date.now();
	if (ms <= 0) return 'expired';
	const d = Math.floor(ms / 86400000);
	const h = Math.floor((ms % 86400000) / 3600000);
	if (d > 0) return `${d}d ${h}h`;
	const m = Math.floor((ms % 3600000) / 60000);
	return `${h}h ${m}m`;
}
function shortAddr(a) {
	if (!a) return 'anon';
	return a.length > 12 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a;
}
function iconUser() {
	return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="3.2"/><path d="M5 20c0-3.3 3.1-5.5 7-5.5s7 2.2 7 5.5"/></svg>`;
}
function iconSubs() {
	return `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M17 9H7m10 0l-4-4m4 4l-4 4M3 4v12"/></svg>`;
}

init();
