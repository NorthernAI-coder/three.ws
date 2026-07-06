// dashboard-next — GCP Spend page.
//
// Internal burn observability for the $100k GCP credit program. Cross-references
// two sources from /api/admin/gcp-burn:
//   • App-side telemetry (always present) — per-lane LLM cost/tokens, Vertex
//     Claude spend estimate, forge generations per backend.
//   • BigQuery billing ground truth (when wired) — credit consumed, daily burn,
//     runway, projected exhaustion vs expiry, and the under-utilization guard.
//
// Admin-gated (the endpoint enforces it; a 403 renders a designed lock state).
// Auto-refreshes every 60s. Status is conveyed by icon + text + colour.

import { mountShell } from '../shell.js';
import { requireUser, esc } from '../api.js';
import {
	skeletonHTML,
	emptyStateHTML,
	errorStateHTML,
	ensureStateKitStyles,
	attachRetry,
} from '../../shared/state-kit.js';

const REFRESH_MS = 60_000;

const STATUS = {
	'on-track':     { token: 'var(--nxt-success)', label: 'On track',        icon: '🟢' },
	runaway:        { token: 'var(--nxt-danger)',  label: 'Runaway burn',    icon: '🔴' },
	underutilized:  { token: 'var(--nxt-warn)',    label: 'Under-utilized',  icon: '🟡' },
	idle:           { token: 'var(--nxt-ink-fade)', label: 'Idle',           icon: '⚪' },
	unknown:        { token: 'var(--nxt-ink-fade)', label: 'Unknown',        icon: '⚪' },
};

const LANE_LABEL = {
	'vertex-claude': 'Vertex Claude',
	'forge-gpu': 'Forge GPU fleet',
	imagen: 'Imagen',
	other: 'Other (free / BYOK)',
};

function usd(n) {
	if (n == null || Number.isNaN(Number(n))) return '—';
	return `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function compact(n) {
	const v = Number(n || 0);
	if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
	if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
	if (v >= 1e3) return `${(v / 1e3).toFixed(1)}k`;
	return String(v);
}
function day(d) { return String(d).slice(5); } // MM-DD

// ── Render ──────────────────────────────────────────────────────────────────

function renderBilling(billing) {
	if (!billing || !billing.available) {
		return `
			<section class="sp-panel sp-panel-muted">
				<div class="sp-panel-head"><h2>Billing ground truth</h2><span class="sp-tag">not wired</span></div>
				<p class="sp-note">${esc(billing?.reason || 'BigQuery billing export not configured.')}</p>
				<p class="sp-note-dim">Enable the export + set the billing env vars (see <code>docs/gcp-credits.md</code>), then run <code>node scripts/gcp/burn-report.mjs</code> to verify. The app-side telemetry below is live regardless.</p>
			</section>`;
	}
	const r = billing.report;
	const p = r.projection;
	const s = STATUS[p.status] || STATUS.unknown;
	const usedPct = p.creditTotalUsd ? Math.min(100, (r.totals.creditUsed / p.creditTotalUsd) * 100) : null;

	const stat = (label, value, sub) => `
		<div class="sp-stat">
			<div class="sp-stat-label">${esc(label)}</div>
			<div class="sp-stat-value">${value}</div>
			${sub ? `<div class="sp-stat-sub">${sub}</div>` : ''}
		</div>`;

	const byLane = (r.byLane || []).filter((l) => l.creditUsed > 0.005);
	const laneRows = byLane.length
		? byLane.slice(0, 8).map((l) => `
			<tr><td>${esc(LANE_LABEL[l.lane] || l.lane)}</td><td class="sp-num">${usd(l.creditUsed)}</td><td class="sp-dim">${esc(l.program)}</td></tr>`).join('')
		: `<tr><td colspan="3" class="sp-dim">No labeled spend yet — run <code>scripts/gcp/label-resources.sh</code>.</td></tr>`;

	return `
		<section class="sp-panel" data-status="${esc(p.status)}" style="--s:${s.token}">
			<div class="sp-panel-head">
				<h2>Billing ground truth</h2>
				<span class="sp-badge">${s.icon} ${esc(s.label)}</span>
			</div>
			<p class="sp-headline">${esc(p.headline || '')}</p>
			${usedPct != null ? `<div class="sp-bar" role="img" aria-label="${usedPct.toFixed(1)}% of grant consumed"><div class="sp-bar-fill" style="width:${usedPct}%"></div></div>` : ''}
			<div class="sp-stats">
				${stat('Credit consumed', usd(r.totals.creditUsed), p.creditTotalUsd ? `of ${usd(p.creditTotalUsd)}` : '')}
				${stat('Remaining', usd(p.remainingUsd), '')}
				${stat('Burn / day (7d)', usd(r.burn.avg7dPerDay), `${usd(r.burn.avg30dPerDay)} (30d)`)}
				${stat('Runway', p.daysRunway == null ? '—' : p.daysRunway === Infinity ? '∞' : `${Math.round(p.daysRunway)}d`, p.exhaustionDate ? `exhausts ${String(p.exhaustionDate).slice(0, 10)}` : '')}
				${stat('Expiry', p.expiry ? String(p.expiry).slice(0, 10) : '—', p.daysToExpiry != null ? `${Math.round(p.daysToExpiry)}d away` : '')}
				${stat('Projected unused', p.projectedUnusedPct != null ? `${Math.round(p.projectedUnusedPct * 100)}%` : '—', p.projectedUnusedUsd != null ? usd(p.projectedUnusedUsd) : '')}
			</div>
			<table class="sp-table">
				<caption>Credit spend by lane (attribution)</caption>
				<thead><tr><th>Lane</th><th class="sp-num">Credit used</th><th>Program</th></tr></thead>
				<tbody>${laneRows}</tbody>
			</table>
		</section>`;
}

function renderDailyChart(series) {
	if (!series || series.length === 0) return '';
	const lanes = ['vertex-claude', 'forge-gpu', 'imagen', 'other'];
	const totals = series.map((d) => lanes.reduce((a, l) => a + (d[l] || 0), 0));
	const max = Math.max(...totals, 0.0001);
	const bars = series.map((d, i) => {
		const h = Math.round((totals[i] / max) * 100);
		const segs = lanes.map((l) => {
			const v = d[l] || 0;
			if (v <= 0) return '';
			const pct = (v / (totals[i] || 1)) * 100;
			return `<span class="sp-seg" data-lane="${l}" style="height:${pct}%" title="${esc(LANE_LABEL[l])}: ${usd(v)}"></span>`;
		}).join('');
		return `<div class="sp-bar-col" title="${esc(day(d.day))} · ${usd(totals[i])}"><div class="sp-bar-stack" style="height:${h}%">${segs}</div><span class="sp-bar-x">${esc(day(d.day))}</span></div>`;
	}).join('');
	return `
		<section class="sp-panel">
			<div class="sp-panel-head"><h2>App-side LLM cost / day (14d)</h2></div>
			<div class="sp-chart" role="img" aria-label="Daily LLM cost by lane, last 14 days">${bars}</div>
			<div class="sp-legend">
				<span data-lane="vertex-claude">Vertex Claude</span>
				<span data-lane="forge-gpu">Forge GPU</span>
				<span data-lane="imagen">Imagen</span>
				<span data-lane="other">Other</span>
			</div>
		</section>`;
}

function renderLanes(app) {
	const lanes = app.lane_totals_14d || [];
	const vc = app.vertex_claude || {};
	const forge = app.forge_by_backend || [];

	const laneCards = lanes.length
		? lanes.map((l) => `
			<li class="sp-lane" data-lane="${esc(l.lane)}">
				<div class="sp-lane-name">${esc(LANE_LABEL[l.lane] || l.lane)}</div>
				<div class="sp-lane-cost">${usd(l.costUsd)}</div>
				<div class="sp-lane-meta">${l.requests.toLocaleString()} req · ${compact(l.inputTokens + l.outputTokens)} tok</div>
			</li>`).join('')
		: `<li class="sp-empty-inline">No LLM lane usage in the last 14 days.</li>`;

	const forgeRows = forge.length
		? forge.map((f) => `
			<tr>
				<td>${esc(f.backend)}${f.selfHost ? ' <span class="sp-chip">self-host</span>' : ''}</td>
				<td class="sp-num">${f.generations30d.toLocaleString()}</td>
				<td class="sp-num sp-dim">${f.generations24h.toLocaleString()}</td>
			</tr>`).join('')
		: `<tr><td colspan="3" class="sp-dim">No forge generations in the last 30 days.</td></tr>`;

	return `
		<section class="sp-panel">
			<div class="sp-panel-head"><h2>Lane cost — app-side estimate (14d)</h2></div>
			<ul class="sp-lanes">${laneCards}</ul>
		</section>

		<div class="sp-two">
			<section class="sp-panel">
				<div class="sp-panel-head"><h2>Vertex Claude</h2></div>
				<div class="sp-stats sp-stats-sm">
					<div class="sp-stat"><div class="sp-stat-label">Cost 30d</div><div class="sp-stat-value">${usd(vc.costUsd30d)}</div></div>
					<div class="sp-stat"><div class="sp-stat-label">Cost 24h</div><div class="sp-stat-value">${usd(vc.costUsd24h)}</div></div>
					<div class="sp-stat"><div class="sp-stat-label">Requests 30d</div><div class="sp-stat-value">${Number(vc.requests30d || 0).toLocaleString()}</div></div>
					<div class="sp-stat"><div class="sp-stat-label">Tokens 30d</div><div class="sp-stat-value">${compact((vc.inputTokens30d || 0) + (vc.outputTokens30d || 0))}</div></div>
				</div>
				${(vc.byModel || []).length ? `<table class="sp-table"><thead><tr><th>Model</th><th class="sp-num">Cost</th><th class="sp-num">Req</th></tr></thead><tbody>${vc.byModel.slice(0, 6).map((m) => `<tr><td>${esc(m.model || '—')}</td><td class="sp-num">${usd(m.costUsd)}</td><td class="sp-num sp-dim">${m.requests.toLocaleString()}</td></tr>`).join('')}</tbody></table>` : `<p class="sp-note-dim">No Vertex Claude traffic yet — set <code>VERTEX_CLAUDE_PRIMARY</code> to route production chat through it.</p>`}
			</section>

			<section class="sp-panel">
				<div class="sp-panel-head"><h2>Forge generations by backend (30d)</h2></div>
				<table class="sp-table">
					<thead><tr><th>Backend</th><th class="sp-num">30d</th><th class="sp-num">24h</th></tr></thead>
					<tbody>${forgeRows}</tbody>
				</table>
			</section>
		</div>`;
}

function renderAll(data) {
	const app = data.app_side || {};
	const hasAnything = (app.lane_totals_14d || []).length || (app.forge_by_backend || []).length || data.billing?.available;
	if (!hasAnything) {
		return emptyStateHTML({
			icon: '📊',
			title: 'No spend telemetry yet',
			body: 'No GCP-lane usage recorded and the billing export isn’t wired. Once Vertex/forge lanes serve traffic (or the BigQuery export lands), this fills in.',
			actions: [{ label: 'Retry', id: 'sp-retry', primary: true }],
		}).replace('data-sk-action="sp-retry"', 'data-sk-retry');
	}
	return `
		${renderBilling(data.billing)}
		${renderDailyChart(app.daily_llm_cost_usd)}
		${renderLanes(app)}
		<p class="sp-foot">Generated ${esc(String(data.generated_at || '').slice(0, 19))}Z · kill-switch: <code>scripts/gcp/emergency-stop.sh</code> · report: <code>node scripts/gcp/burn-report.mjs</code></p>`;
}

function injectStyles() {
	if (document.getElementById('sp-styles')) return;
	ensureStateKitStyles();
	const s = document.createElement('style');
	s.id = 'sp-styles';
	s.textContent = `
		.sp-root { display: flex; flex-direction: column; gap: 1.25rem; padding-bottom: 3rem; }
		.sp-panel { background: var(--nxt-glass); border: 1px solid var(--nxt-stroke); border-radius: var(--nxt-radius-sm); padding: 1.1rem 1.2rem; --s: var(--nxt-accent); }
		.sp-panel[data-status] { border-left: 3px solid var(--s); }
		.sp-panel-muted { opacity: .92; }
		.sp-panel-head { display: flex; align-items: center; justify-content: space-between; gap: .5rem; margin-bottom: .8rem; }
		.sp-panel-head h2 { margin: 0; font-size: .95rem; font-weight: 650; color: var(--nxt-ink); }
		.sp-badge { font-size: .75rem; font-weight: 600; color: var(--s); border: 1px solid color-mix(in srgb, var(--s) 40%, transparent); background: color-mix(in srgb, var(--s) 12%, transparent); padding: .2rem .55rem; border-radius: var(--nxt-radius-pill); white-space: nowrap; }
		.sp-tag { font-size: .68rem; text-transform: uppercase; letter-spacing: .08em; color: var(--nxt-ink-fade); border: 1px solid var(--nxt-stroke); padding: .15rem .5rem; border-radius: var(--nxt-radius-pill); }
		.sp-headline { margin: 0 0 .8rem; font-size: .9rem; color: var(--nxt-ink); line-height: 1.5; }
		.sp-note { margin: 0 0 .5rem; font-size: .85rem; color: var(--nxt-ink-dim); line-height: 1.5; }
		.sp-note-dim { margin: 0; font-size: .8rem; color: var(--nxt-ink-fade); line-height: 1.5; }
		.sp-note code, .sp-note-dim code, .sp-foot code, .sp-table code { font-family: var(--nxt-mono, ui-monospace, monospace); font-size: .82em; background: color-mix(in srgb, var(--nxt-ink) 8%, transparent); padding: .05em .35em; border-radius: 4px; }

		.sp-bar { height: 8px; border-radius: 5px; background: color-mix(in srgb, var(--nxt-ink) 10%, transparent); overflow: hidden; margin-bottom: 1rem; }
		.sp-bar-fill { height: 100%; background: var(--s); border-radius: 5px; transition: width .4s ease; }

		.sp-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: .75rem; margin-bottom: 1rem; }
		.sp-stats-sm { grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); margin-bottom: .6rem; }
		.sp-stat { background: color-mix(in srgb, var(--nxt-ink) 4%, transparent); border-radius: var(--nxt-radius-sm); padding: .65rem .75rem; }
		.sp-stat-label { font-size: .7rem; text-transform: uppercase; letter-spacing: .06em; color: var(--nxt-ink-fade); }
		.sp-stat-value { font-size: 1.15rem; font-weight: 650; color: var(--nxt-ink); margin-top: .15rem; letter-spacing: -.01em; }
		.sp-stat-sub { font-size: .72rem; color: var(--nxt-ink-fade); margin-top: .1rem; }

		.sp-table { width: 100%; border-collapse: collapse; margin-top: .5rem; font-size: .82rem; }
		.sp-table caption { text-align: left; font-size: .7rem; text-transform: uppercase; letter-spacing: .06em; color: var(--nxt-ink-fade); padding-bottom: .4rem; }
		.sp-table th { text-align: left; font-weight: 600; color: var(--nxt-ink-fade); font-size: .72rem; text-transform: uppercase; letter-spacing: .04em; padding: .35rem .5rem; border-bottom: 1px solid var(--nxt-stroke); }
		.sp-table td { padding: .4rem .5rem; border-bottom: 1px solid color-mix(in srgb, var(--nxt-stroke) 55%, transparent); color: var(--nxt-ink); }
		.sp-num { text-align: right; font-variant-numeric: tabular-nums; }
		.sp-dim { color: var(--nxt-ink-fade); }
		.sp-chip { font-size: .62rem; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; color: var(--nxt-success); border: 1px solid color-mix(in srgb, var(--nxt-success) 40%, transparent); padding: .05rem .35rem; border-radius: var(--nxt-radius-pill); margin-left: .35rem; }

		.sp-lanes { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 200px), 1fr)); gap: .6rem; }
		.sp-lane { border: 1px solid var(--nxt-stroke); border-radius: var(--nxt-radius-sm); padding: .7rem .8rem; border-left: 3px solid var(--l, var(--nxt-accent)); }
		.sp-lane[data-lane="vertex-claude"] { --l: #a78bfa; }
		.sp-lane[data-lane="forge-gpu"] { --l: #34d399; }
		.sp-lane[data-lane="imagen"] { --l: #f59e0b; }
		.sp-lane[data-lane="other"] { --l: var(--nxt-ink-fade); }
		.sp-lane-name { font-size: .78rem; color: var(--nxt-ink-dim); }
		.sp-lane-cost { font-size: 1.2rem; font-weight: 680; color: var(--nxt-ink); letter-spacing: -.01em; }
		.sp-lane-meta { font-size: .72rem; color: var(--nxt-ink-fade); margin-top: .1rem; }
		.sp-empty-inline { list-style: none; color: var(--nxt-ink-fade); font-size: .82rem; }

		.sp-two { display: grid; grid-template-columns: 1fr 1fr; gap: 1.25rem; }
		@media (max-width: 720px) { .sp-two { grid-template-columns: 1fr; } }

		.sp-chart { display: flex; align-items: flex-end; gap: 4px; height: 120px; padding-top: .5rem; }
		.sp-bar-col { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; gap: 3px; }
		.sp-bar-stack { width: 70%; min-height: 2px; display: flex; flex-direction: column-reverse; border-radius: 3px 3px 0 0; overflow: hidden; background: color-mix(in srgb, var(--nxt-ink) 6%, transparent); }
		.sp-seg[data-lane="vertex-claude"] { background: #a78bfa; }
		.sp-seg[data-lane="forge-gpu"] { background: #34d399; }
		.sp-seg[data-lane="imagen"] { background: #f59e0b; }
		.sp-seg[data-lane="other"] { background: var(--nxt-ink-fade); }
		.sp-bar-x { font-size: .6rem; color: var(--nxt-ink-fade); }
		.sp-legend { display: flex; gap: 1rem; margin-top: .6rem; font-size: .72rem; color: var(--nxt-ink-dim); flex-wrap: wrap; }
		.sp-legend span { display: inline-flex; align-items: center; gap: .35rem; }
		.sp-legend span::before { content: ''; width: 9px; height: 9px; border-radius: 2px; }
		.sp-legend span[data-lane="vertex-claude"]::before { background: #a78bfa; }
		.sp-legend span[data-lane="forge-gpu"]::before { background: #34d399; }
		.sp-legend span[data-lane="imagen"]::before { background: #f59e0b; }
		.sp-legend span[data-lane="other"]::before { background: var(--nxt-ink-fade); }

		.sp-foot { font-size: .74rem; color: var(--nxt-ink-fade); text-align: center; margin: .5rem 0 0; }
		@media (prefers-reduced-motion: reduce) { .sp-bar-fill { transition: none; } }
	`;
	document.head.appendChild(s);
}

const REFRESH_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>';

(async function boot() {
	const main = await mountShell();
	await requireUser();
	injectStyles();

	main.innerHTML = `
		<div style="display:flex;align-items:baseline;justify-content:space-between;flex-wrap:wrap;gap:.5rem;margin-bottom:1.5rem">
			<div>
				<h1 class="dn-h1" style="margin-bottom:.25rem">GCP Spend</h1>
				<p class="dn-h1-sub" style="margin:0">Credit burn observability — per-lane cost, runway, and projection vs expiry for the $100k program.</p>
			</div>
			<button class="dn-btn" id="sp-refresh" type="button" aria-label="Refresh spend data now" style="display:inline-flex;align-items:center;gap:.4rem;background:rgba(255,255,255,.04);border:1px solid var(--nxt-stroke);border-radius:var(--nxt-radius-sm);padding:.4rem .8rem;font-size:.78rem;color:var(--nxt-ink);cursor:pointer">
				<span class="sp-refresh-icon" style="display:inline-flex;width:13px;height:13px">${REFRESH_SVG}</span><span>Refresh</span>
			</button>
		</div>
		<div class="sp-root" id="sp-root" aria-busy="true">
			<div class="sp-panel" aria-hidden="true">${skeletonHTML(4, 'row')}</div>
		</div>`;

	const root = document.getElementById('sp-root');
	const refreshBtn = document.getElementById('sp-refresh');
	let refreshTimer = null;

	function renderAccessError(status) {
		if (status === 403) {
			return emptyStateHTML({
				icon: '🔒',
				title: 'Admin access required',
				body: 'The GCP spend dashboard is limited to workspace admins. Ask an admin to grant access if you need burn visibility.',
				actions: [{ label: 'Back to dashboard', href: '/dashboard' }],
			});
		}
		if (status === 401) {
			return emptyStateHTML({ icon: '🔑', title: 'Sign in required', body: 'Your session expired. Sign in again to view spend.', actions: [{ label: 'Sign in', href: '/login' }] });
		}
		return errorStateHTML({ title: 'Couldn’t load spend', body: `The endpoint returned ${esc(String(status))}. Usually transient — retry.` });
	}

	async function load() {
		refreshBtn.disabled = true;
		root.setAttribute('aria-busy', 'true');
		try {
			const res = await fetch('/api/admin/gcp-burn', { credentials: 'include' });
			if (!res.ok) { root.innerHTML = renderAccessError(res.status); return; }
			const data = await res.json();
			root.innerHTML = renderAll(data);
		} catch (err) {
			root.innerHTML = errorStateHTML({ title: 'Couldn’t reach the spend endpoint', body: esc(err?.message || 'Check your connection and try again.') });
		} finally {
			refreshBtn.disabled = false;
			root.setAttribute('aria-busy', 'false');
		}
	}

	function schedule() {
		clearTimeout(refreshTimer);
		refreshTimer = setTimeout(() => load().then(schedule), REFRESH_MS);
	}

	attachRetry(root, () => { clearTimeout(refreshTimer); load().then(schedule); });
	refreshBtn.addEventListener('click', () => { clearTimeout(refreshTimer); load().then(schedule); });
	document.addEventListener('visibilitychange', () => {
		if (document.hidden) clearTimeout(refreshTimer);
		else load().then(schedule);
	});

	await load();
	schedule();
})().catch((err) => {
	const main = document.querySelector('.dn-main-inner') || document.body;
	main.innerHTML = `<h1 class="dn-h1">GCP Spend</h1><div class="dn-panel"><div class="dn-panel-title" style="color:var(--nxt-danger)">Failed to load</div><div class="dn-panel-sub">${(err?.message || 'unknown').replace(/</g, '&lt;')}</div></div>`;
});
