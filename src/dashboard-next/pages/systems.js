// dashboard-next — Systems Status page.
//
// Live health view of every running system: x402 payments, club tips,
// pump.fun activity, agent circulation, workers, seeding crons, marketplace.
// Auto-refreshes every 30 seconds. Color-coded ok/warn/down per system.

import { mountShell } from '../shell.js';
import { requireUser, esc } from '../api.js';

const REFRESH_MS = 30_000;

const STATUS_COLOR = { ok: '#22c55e', warn: '#f59e0b', down: '#ef4444' };
const STATUS_LABEL = { ok: 'OK', warn: 'WARN', down: 'DOWN' };

const CATEGORY_ORDER = ['payments', 'club', 'pumpfun', 'agents', 'seeding', 'marketplace'];
const CATEGORY_LABEL = {
	payments:    'Payments & x402',
	club:        'Club',
	pumpfun:     'Pump.fun',
	agents:      'Agents & Workers',
	seeding:     'Content Seeding',
	marketplace: 'Marketplace',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function relTime(iso) {
	if (!iso) return '—';
	const ms = Date.now() - new Date(iso).getTime();
	if (ms < 0) return 'just now';
	const s = Math.floor(ms / 1000);
	if (s < 60) return `${s}s ago`;
	const m = Math.floor(s / 60);
	if (m < 60) return `${m}m ago`;
	const h = Math.floor(m / 60);
	if (h < 24) return `${h}h ago`;
	return `${Math.floor(h / 24)}d ago`;
}

function plural(n, word) { return `${n?.toLocaleString() ?? '—'} ${word}${n === 1 ? '' : 's'}`; }

function metaLine(sys) {
	const parts = [];
	if (sys.count_24h != null)      parts.push(`${sys.count_24h?.toLocaleString()} today`);
	if (sys.count_10m != null)      parts.push(`${sys.count_10m} / 10 min`);
	if (sys.count_5m != null)       parts.push(`${sys.count_5m} / 5 min`);
	if (sys.count_60m != null && sys.count_10m == null && sys.count_5m == null)
		parts.push(`${sys.count_60m} / hr`);
	if (sys.active_agents_24h != null) parts.push(`${sys.active_agents_24h} agents active`);
	if (sys.launches_24h != null)   parts.push(`${sys.launches_24h} launches`);
	if (sys.trades_24h != null)     parts.push(`${sys.trades_24h} trades`);
	if (sys.feed_depth != null)     parts.push(`${sys.feed_depth} in feed`);
	if (sys.mode)                   parts.push(`mode: ${sys.mode}`);
	if (sys.detail)                 parts.push(sys.detail);
	return parts.join(' · ') || null;
}

// ── Render ────────────────────────────────────────────────────────────────────

function renderSystems(data) {
	const byCategory = {};
	for (const s of data.systems) {
		(byCategory[s.category] = byCategory[s.category] || []).push(s);
	}

	const overallColor = data.overall === 'healthy' ? STATUS_COLOR.ok
		: data.overall === 'partial' ? STATUS_COLOR.warn : STATUS_COLOR.down;

	const sections = CATEGORY_ORDER
		.filter((cat) => byCategory[cat]?.length)
		.map((cat) => {
			const cards = byCategory[cat].map((sys) => {
				const color = STATUS_COLOR[sys.status] || '#6b7280';
				const label = STATUS_LABEL[sys.status] || sys.status.toUpperCase();
				const meta = metaLine(sys);
				const lastStr = relTime(sys.last);
				return `
					<div class="sys-card sys-card--${esc(sys.status)}">
						<div class="sys-card-head">
							<span class="sys-card-name">${esc(sys.name)}</span>
							<span class="sys-badge" style="background:${color}22;color:${color};border-color:${color}40">${label}</span>
						</div>
						${meta ? `<div class="sys-card-meta">${esc(meta)}</div>` : ''}
						<div class="sys-card-last">Last: ${esc(lastStr)}</div>
					</div>`;
			}).join('');
			return `
				<div class="sys-section">
					<div class="sys-section-label">${esc(CATEGORY_LABEL[cat] || cat)}</div>
					<div class="sys-grid">${cards}</div>
				</div>`;
		}).join('');

	const { ok, warn, down } = data.summary;
	return `
		<div class="sys-overall" style="border-color:${overallColor}40;background:${overallColor}0a">
			<span class="sys-overall-dot" style="background:${overallColor}"></span>
			<span class="sys-overall-label">${esc(data.overall.toUpperCase())}</span>
			<span class="sys-overall-counts">${ok} ok · ${warn} warn · ${down} down</span>
			<span class="sys-overall-time">checked ${relTime(data.checked_at)}</span>
		</div>
		${sections}`;
}

function renderSkeleton() {
	return Array.from({ length: 12 }, () =>
		'<div class="sys-card sys-card--skeleton"><div class="sys-skel-name"></div><div class="sys-skel-meta"></div></div>',
	).join('');
}

function injectStyles() {
	if (document.getElementById('sys-styles')) return;
	const s = document.createElement('style');
	s.id = 'sys-styles';
	s.textContent = `
		.sys-root { display: flex; flex-direction: column; gap: 2rem; padding-bottom: 3rem; }

		.sys-overall {
			display: flex; align-items: center; gap: .75rem;
			padding: .75rem 1rem; border-radius: 10px; border: 1px solid;
			font-size: .85rem; font-weight: 500; flex-wrap: wrap;
		}
		.sys-overall-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
		.sys-overall-label { font-weight: 700; letter-spacing: .05em; }
		.sys-overall-counts { color: var(--nxt-muted); }
		.sys-overall-time { margin-left: auto; color: var(--nxt-muted); font-size: .8rem; }

		.sys-section { display: flex; flex-direction: column; gap: .75rem; }
		.sys-section-label {
			font-size: .7rem; font-weight: 700; letter-spacing: .1em;
			text-transform: uppercase; color: var(--nxt-muted);
		}
		.sys-grid {
			display: grid;
			grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
			gap: .75rem;
		}

		.sys-card {
			background: var(--nxt-surface);
			border: 1px solid var(--nxt-border);
			border-radius: 10px;
			padding: .9rem 1rem;
			display: flex; flex-direction: column; gap: .3rem;
			transition: border-color .15s;
		}
		.sys-card--ok   { border-left: 3px solid #22c55e; }
		.sys-card--warn { border-left: 3px solid #f59e0b; }
		.sys-card--down { border-left: 3px solid #ef4444; }

		.sys-card-head { display: flex; align-items: center; justify-content: space-between; gap: .5rem; }
		.sys-card-name { font-size: .875rem; font-weight: 600; }
		.sys-badge {
			font-size: .65rem; font-weight: 700; letter-spacing: .06em;
			padding: .15rem .45rem; border-radius: 4px; border: 1px solid;
			flex-shrink: 0;
		}
		.sys-card-meta { font-size: .78rem; color: var(--nxt-muted); }
		.sys-card-last { font-size: .75rem; color: var(--nxt-muted); }

		.sys-card--skeleton { animation: sys-pulse 1.4s ease-in-out infinite; }
		@keyframes sys-pulse { 0%,100%{opacity:1} 50%{opacity:.5} }
		.sys-skel-name { height: 14px; width: 60%; background: var(--nxt-border); border-radius: 4px; }
		.sys-skel-meta { height: 11px; width: 80%; background: var(--nxt-border); border-radius: 4px; margin-top: 6px; }

		.sys-refresh-row {
			display: flex; align-items: center; gap: .75rem;
			font-size: .8rem; color: var(--nxt-muted);
		}
		.sys-refresh-btn {
			background: none; border: 1px solid var(--nxt-border); border-radius: 6px;
			padding: .3rem .7rem; font-size: .78rem; color: var(--nxt-fg); cursor: pointer;
		}
		.sys-refresh-btn:hover { background: var(--nxt-surface-hover); }
		.sys-spinning { animation: sys-spin .7s linear infinite; display: inline-block; }
		@keyframes sys-spin { to { transform: rotate(360deg); } }
	`;
	document.head.appendChild(s);
}

// ── Boot ──────────────────────────────────────────────────────────────────────

(async function boot() {
	const main = await mountShell();
	await requireUser();

	injectStyles();

	main.innerHTML = `
		<div style="display:flex;align-items:baseline;justify-content:space-between;flex-wrap:wrap;gap:.5rem;margin-bottom:1.5rem">
			<div>
				<h1 class="dn-h1" style="margin-bottom:.25rem">Systems</h1>
				<p class="dn-h1-sub">Live health of every running system — payments, agents, seeding, workers.</p>
			</div>
			<div class="sys-refresh-row">
				<span id="sys-next-refresh"></span>
				<button class="sys-refresh-btn" id="sys-refresh-btn">↻ Refresh</button>
			</div>
		</div>
		<div class="sys-root" id="sys-root">
			<div class="sys-grid">${renderSkeleton()}</div>
		</div>
	`;

	const root = document.getElementById('sys-root');
	const nextLabel = document.getElementById('sys-next-refresh');
	const refreshBtn = document.getElementById('sys-refresh-btn');

	let nextRefreshAt = null;
	let countdownTimer = null;

	function updateCountdown() {
		if (!nextRefreshAt) return;
		const s = Math.max(0, Math.ceil((nextRefreshAt - Date.now()) / 1000));
		nextLabel.textContent = s > 0 ? `refresh in ${s}s` : 'refreshing…';
	}

	async function load() {
		refreshBtn.innerHTML = '<span class="sys-spinning">↻</span> Refreshing';
		refreshBtn.disabled = true;
		try {
			const res = await fetch('/api/admin/all-systems');
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const data = await res.json();
			root.innerHTML = renderSystems(data);
		} catch (err) {
			root.innerHTML = `<div class="dn-panel"><div class="dn-panel-title" style="color:var(--nxt-danger)">Failed to load</div><div class="dn-panel-sub">${esc(err?.message || 'unknown error')}</div></div>`;
		} finally {
			refreshBtn.innerHTML = '↻ Refresh';
			refreshBtn.disabled = false;
			nextRefreshAt = Date.now() + REFRESH_MS;
		}
	}

	refreshBtn.addEventListener('click', () => {
		clearTimeout(countdownTimer);
		load().then(scheduleNext);
	});

	function scheduleNext() {
		clearInterval(countdownTimer);
		nextRefreshAt = Date.now() + REFRESH_MS;
		countdownTimer = setInterval(updateCountdown, 1000);
		updateCountdown();
		setTimeout(() => {
			clearInterval(countdownTimer);
			load().then(scheduleNext);
		}, REFRESH_MS);
	}

	await load();
	scheduleNext();
})().catch((err) => {
	const main = document.querySelector('.dn-main-inner') || document.body;
	main.innerHTML = `<h1 class="dn-h1">Systems</h1><div class="dn-panel"><div class="dn-panel-title" style="color:var(--nxt-danger)">Failed to load</div><div class="dn-panel-sub">${(err?.message || 'unknown').replace(/</g, '&lt;')}</div></div>`;
});
