// dashboard-next — Systems Status page.
//
// Live health view of every running system: x402 payments, club tips,
// pump.fun activity, agent circulation, workers, seeding crons, marketplace.
// Auto-refreshes every 30 seconds. Status is conveyed by icon + text + colour
// (never colour alone) so it stays legible for colour-blind readers.

import { mountShell } from '../shell.js';
import { requireUser, esc } from '../api.js';
import {
	skeletonHTML,
	emptyStateHTML,
	errorStateHTML,
	ensureStateKitStyles,
	attachRetry,
} from '../../shared/state-kit.js';

const REFRESH_MS = 30_000;

// Status → semantic token (never a raw hex — tokens flip with the theme).
const STATUS_TOKEN = { ok: 'var(--nxt-success)', warn: 'var(--nxt-warn)', down: 'var(--nxt-danger)' };
const STATUS_LABEL = { ok: 'Operational', warn: 'Degraded', down: 'Down' };
const OVERALL_STATUS = { healthy: 'ok', partial: 'warn', degraded: 'down' };
const OVERALL_LABEL = { healthy: 'All systems operational', partial: 'Partial degradation', degraded: 'Service disruption' };

// Inline status glyphs (Feather-style). aria-hidden — the text label carries meaning.
const STATUS_ICON = {
	ok:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
	warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
	down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
};

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
	if (!Number.isFinite(ms)) return '—';
	if (ms < 0) return 'just now';
	const s = Math.floor(ms / 1000);
	if (s < 60) return `${s}s ago`;
	const m = Math.floor(s / 60);
	if (m < 60) return `${m}m ago`;
	const h = Math.floor(m / 60);
	if (h < 24) return `${h}h ago`;
	return `${Math.floor(h / 24)}d ago`;
}

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

function statusKey(status) {
	return STATUS_TOKEN[status] ? status : 'down';
}

// ── Render ────────────────────────────────────────────────────────────────────

function renderSystems(data) {
	const systems = Array.isArray(data.systems) ? data.systems : [];
	if (systems.length === 0) {
		return emptyStateHTML({
			title: 'No systems reporting',
			body: 'Every health probe came back empty. This is unusual — retry, or check that the monitored services are deployed.',
			actions: [{ label: 'Retry', id: 'sys-retry', primary: true }],
		}).replace('data-sk-action="sys-retry"', 'data-sk-retry');
	}

	const byCategory = {};
	for (const s of systems) (byCategory[s.category] = byCategory[s.category] || []).push(s);

	const overallKey = OVERALL_STATUS[data.overall] || 'down';
	const overallLabel = OVERALL_LABEL[data.overall] || String(data.overall || 'unknown').toUpperCase();
	const { ok = 0, warn = 0, down = 0 } = data.summary || {};

	const sections = CATEGORY_ORDER
		.filter((cat) => byCategory[cat]?.length)
		.map((cat) => {
			const cards = byCategory[cat].map((sys) => {
				const key = statusKey(sys.status);
				const label = STATUS_LABEL[key];
				const meta = metaLine(sys);
				const lastStr = relTime(sys.last);
				return `
					<li class="sys-card" data-status="${esc(key)}" aria-label="${esc(sys.name)}: ${esc(label)}">
						<div class="sys-card-head">
							<span class="sys-card-name">${esc(sys.name)}</span>
							<span class="sys-badge">
								<span class="sys-badge-icon">${STATUS_ICON[key]}</span>
								<span>${esc(label)}</span>
							</span>
						</div>
						${meta ? `<div class="sys-card-meta">${esc(meta)}</div>` : ''}
						<div class="sys-card-last">Last activity: ${esc(lastStr)}</div>
					</li>`;
			}).join('');
			return `
				<section class="sys-section" aria-labelledby="sys-cat-${esc(cat)}">
					<h2 class="sys-section-label" id="sys-cat-${esc(cat)}">${esc(CATEGORY_LABEL[cat] || cat)}</h2>
					<ul class="sys-grid" role="list">${cards}</ul>
				</section>`;
		}).join('');

	return `
		<div class="sys-overall" data-status="${esc(overallKey)}" role="status" aria-live="polite">
			<span class="sys-overall-icon">${STATUS_ICON[overallKey]}</span>
			<span class="sys-overall-label">${esc(overallLabel)}</span>
			<span class="sys-overall-counts">
				<span class="sys-count" data-status="ok"><span class="sys-count-dot"></span>${ok} operational</span>
				<span class="sys-count" data-status="warn"><span class="sys-count-dot"></span>${warn} degraded</span>
				<span class="sys-count" data-status="down"><span class="sys-count-dot"></span>${down} down</span>
			</span>
			<span class="sys-overall-time">Checked ${esc(relTime(data.checked_at))}</span>
		</div>
		${sections}`;
}

function renderSkeleton() {
	return `<div class="sys-grid" aria-hidden="true">${skeletonHTML(9, 'row')}</div>`;
}

function injectStyles() {
	if (document.getElementById('sys-styles')) return;
	ensureStateKitStyles();
	const s = document.createElement('style');
	s.id = 'sys-styles';
	s.textContent = `
		.sys-root { display: flex; flex-direction: column; gap: 2rem; padding-bottom: 3rem; }

		.sys-card[data-status="ok"],   .sys-overall[data-status="ok"],   .sys-count[data-status="ok"]   { --s: var(--nxt-success); }
		.sys-card[data-status="warn"], .sys-overall[data-status="warn"], .sys-count[data-status="warn"] { --s: var(--nxt-warn); }
		.sys-card[data-status="down"], .sys-overall[data-status="down"], .sys-count[data-status="down"] { --s: var(--nxt-danger); }

		/* ── Overall banner ── */
		.sys-overall {
			display: flex; align-items: center; gap: .75rem 1rem;
			padding: .85rem 1.1rem; border-radius: var(--nxt-radius-sm);
			border: 1px solid color-mix(in srgb, var(--s) 32%, var(--nxt-stroke));
			background: color-mix(in srgb, var(--s) 8%, transparent);
			font-size: .85rem; flex-wrap: wrap;
		}
		.sys-overall-icon { color: var(--s); display: inline-flex; flex-shrink: 0; }
		.sys-overall-icon svg { width: 18px; height: 18px; }
		.sys-overall-label { font-weight: 600; letter-spacing: -.005em; color: var(--nxt-ink); }
		.sys-overall-counts { display: inline-flex; gap: .9rem; flex-wrap: wrap; }
		.sys-count { display: inline-flex; align-items: center; gap: .35rem; font-size: .8rem; color: var(--nxt-ink-dim); }
		.sys-count-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--s); flex-shrink: 0; }
		.sys-overall-time { margin-left: auto; color: var(--nxt-ink-fade); font-size: .78rem; }

		/* ── Sections ── */
		.sys-section { display: flex; flex-direction: column; gap: .75rem; }
		.sys-section-label {
			margin: 0; font-size: .7rem; font-weight: 700; letter-spacing: .1em;
			text-transform: uppercase; color: var(--nxt-ink-fade);
		}
		.sys-grid {
			list-style: none; margin: 0; padding: 0;
			display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 250px), 1fr));
			gap: .75rem;
		}

		/* ── Cards ── */
		.sys-card {
			background: var(--nxt-glass);
			border: 1px solid var(--nxt-stroke);
			border-left: 3px solid var(--s);
			border-radius: var(--nxt-radius-sm);
			padding: .9rem 1rem;
			display: flex; flex-direction: column; gap: .35rem;
			transition: border-color .18s ease, background .18s ease, transform .12s ease;
		}
		.sys-card:hover {
			border-color: var(--nxt-stroke-strong);
			border-left-color: var(--s);
			background: color-mix(in srgb, var(--s) 5%, var(--nxt-glass));
		}

		.sys-card-head { display: flex; align-items: center; justify-content: space-between; gap: .5rem; }
		.sys-card-name { font-size: .9rem; font-weight: 600; color: var(--nxt-ink); }
		.sys-badge {
			display: inline-flex; align-items: center; gap: .3rem;
			font-size: .68rem; font-weight: 600; letter-spacing: .01em;
			padding: .18rem .5rem .18rem .4rem; border-radius: var(--nxt-radius-pill);
			color: var(--s);
			border: 1px solid color-mix(in srgb, var(--s) 42%, transparent);
			background: color-mix(in srgb, var(--s) 13%, transparent);
			flex-shrink: 0; white-space: nowrap;
		}
		.sys-badge-icon { display: inline-flex; }
		.sys-badge-icon svg { width: 12px; height: 12px; }
		.sys-card-meta { font-size: .78rem; color: var(--nxt-ink-dim); line-height: 1.45; }
		.sys-card-last { font-size: .74rem; color: var(--nxt-ink-fade); }

		/* ── Header refresh control ── */
		.sys-refresh-row {
			display: flex; align-items: center; gap: .75rem;
			font-size: .8rem; color: var(--nxt-ink-fade);
		}
		.sys-refresh-btn {
			display: inline-flex; align-items: center; gap: .4rem;
			background: rgba(255,255,255,0.04); border: 1px solid var(--nxt-stroke);
			border-radius: var(--nxt-radius-sm); padding: .4rem .8rem;
			font-size: .78rem; font-weight: 500; color: var(--nxt-ink); cursor: pointer;
			transition: background .15s ease, border-color .15s ease;
		}
		.sys-refresh-btn:hover:not(:disabled) { background: var(--nxt-accent-soft); border-color: var(--nxt-stroke-strong); }
		.sys-refresh-btn:disabled { opacity: .6; cursor: progress; }
		.sys-refresh-btn:focus-visible, .sys-refresh-btn:focus-visible { outline: 2px solid var(--nxt-accent); outline-offset: 2px; }
		.sys-refresh-icon { display: inline-flex; }
		.sys-refresh-icon svg { width: 13px; height: 13px; }
		.sys-spinning { animation: sys-spin .7s linear infinite; transform-origin: center; }
		@keyframes sys-spin { to { transform: rotate(360deg); } }

		@media (max-width: 520px) {
			.sys-overall-time { margin-left: 0; flex-basis: 100%; }
		}
		@media (prefers-reduced-motion: reduce) {
			.sys-card { transition: none; }
			.sys-spinning { animation: none; }
		}
	`;
	document.head.appendChild(s);
}

const REFRESH_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>';

// ── Boot ──────────────────────────────────────────────────────────────────────

(async function boot() {
	const main = await mountShell();
	await requireUser();

	injectStyles();

	main.innerHTML = `
		<div style="display:flex;align-items:baseline;justify-content:space-between;flex-wrap:wrap;gap:.5rem;margin-bottom:1.5rem">
			<div>
				<h1 class="dn-h1" style="margin-bottom:.25rem">Systems</h1>
				<p class="dn-h1-sub" style="margin:0">Live health of every running system — payments, agents, seeding, workers.</p>
			</div>
			<div class="sys-refresh-row">
				<span id="sys-next-refresh" aria-hidden="true"></span>
				<button class="sys-refresh-btn" id="sys-refresh-btn" type="button" aria-label="Refresh systems status now">
					<span class="sys-refresh-icon">${REFRESH_SVG}</span><span>Refresh</span>
				</button>
			</div>
		</div>
		<div class="sys-root" id="sys-root" aria-busy="true">
			${renderSkeleton()}
		</div>
	`;

	const root = document.getElementById('sys-root');
	const nextLabel = document.getElementById('sys-next-refresh');
	const refreshBtn = document.getElementById('sys-refresh-btn');
	const refreshIcon = refreshBtn.querySelector('.sys-refresh-icon');

	let nextRefreshAt = null;
	let countdownTimer = null;
	let refreshTimer = null;

	function updateCountdown() {
		if (!nextRefreshAt) return;
		const s = Math.max(0, Math.ceil((nextRefreshAt - Date.now()) / 1000));
		nextLabel.textContent = s > 0 ? `Auto-refresh in ${s}s` : 'Refreshing…';
	}

	function renderAccessError(status) {
		if (status === 403) {
			return emptyStateHTML({
				icon: '🔒',
				title: 'Admin access required',
				body: 'The systems health dashboard is limited to workspace admins. If you need visibility, ask an admin to grant you access.',
				actions: [{ label: 'Back to dashboard', href: '/dashboard' }],
			});
		}
		return errorStateHTML({
			title: 'Couldn’t load systems',
			body: `The health endpoint returned ${esc(String(status))}. This is usually transient — retry in a moment.`,
		});
	}

	async function load() {
		refreshBtn.disabled = true;
		refreshIcon.querySelector('svg')?.classList.add('sys-spinning');
		root.setAttribute('aria-busy', 'true');
		try {
			const res = await fetch('/api/admin/all-systems', { credentials: 'include' });
			if (!res.ok) {
				root.innerHTML = renderAccessError(res.status);
				return;
			}
			const data = await res.json();
			root.innerHTML = renderSystems(data);
		} catch (err) {
			root.innerHTML = errorStateHTML({
				title: 'Couldn’t reach the health endpoint',
				body: esc(err?.message || 'Check your connection and try again.'),
			});
		} finally {
			refreshBtn.disabled = false;
			refreshIcon.querySelector('svg')?.classList.remove('sys-spinning');
			root.setAttribute('aria-busy', 'false');
			nextRefreshAt = Date.now() + REFRESH_MS;
		}
	}

	// Retry buttons inside error / empty states re-run the load.
	attachRetry(root, () => {
		clearTimeout(refreshTimer);
		clearInterval(countdownTimer);
		load().then(scheduleNext);
	});

	refreshBtn.addEventListener('click', () => {
		clearTimeout(refreshTimer);
		clearInterval(countdownTimer);
		load().then(scheduleNext);
	});

	function scheduleNext() {
		clearInterval(countdownTimer);
		clearTimeout(refreshTimer);
		nextRefreshAt = Date.now() + REFRESH_MS;
		countdownTimer = setInterval(updateCountdown, 1000);
		updateCountdown();
		refreshTimer = setTimeout(() => {
			clearInterval(countdownTimer);
			load().then(scheduleNext);
		}, REFRESH_MS);
	}

	// Pause the polling loop while the tab is hidden; resume (and refresh) on return.
	document.addEventListener('visibilitychange', () => {
		if (document.hidden) {
			clearInterval(countdownTimer);
			clearTimeout(refreshTimer);
		} else {
			load().then(scheduleNext);
		}
	});

	await load();
	scheduleNext();
})().catch((err) => {
	const main = document.querySelector('.dn-main-inner') || document.body;
	main.innerHTML = `<h1 class="dn-h1">Systems</h1><div class="dn-panel"><div class="dn-panel-title" style="color:var(--nxt-danger)">Failed to load</div><div class="dn-panel-sub">${(err?.message || 'unknown').replace(/</g, '&lt;')}</div></div>`;
});
