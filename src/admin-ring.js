// /admin/ring — x402 ring economy operator dashboard controller.
//
// Polls one aggregate endpoint (/api/admin/ring-dashboard) every 15s and paints
// six panels: settlement pulse, loop diagram, activity feed, fees, integrity,
// and endpoint coverage. Admin session OR Bearer secret — the secret lives in
// sessionStorage + memory, sent as Authorization: Bearer, never in a URL,
// cleared on any 401. Every API-sourced string is escaped before it hits the
// DOM. Polling aborts on a hidden tab and can be paused with `p`; `r` refreshes.

const API = '/api/admin/ring-dashboard';
const SECRET_KEY = 'admin_secret';
const POLL_MS = 15_000;

let secret = sessionStorage.getItem(SECRET_KEY) || '';
let period = '24h';
let pollTimer = null;
let clockTimer = null;
let paused = false;
let inFlight = null; // AbortController for the current fetch
let lastData = null;
let seenActivityIds = new Set();

const $ = (id) => document.getElementById(id);
const esc = (s) =>
	String(s == null ? '' : s).replace(
		/[&<>"']/g,
		(c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
	);

// ── Formatting ───────────────────────────────────────────────────────────────
function fmtAgo(iso) {
	if (!iso) return '—';
	const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
	if (s < 5) return 'just now';
	if (s < 60) return `${s}s ago`;
	if (s < 3600) return `${Math.floor(s / 60)}m ago`;
	if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
	return `${Math.floor(s / 86400)}d ago`;
}
function fmtUsd(n, dp = 2) {
	if (n == null) return '—';
	return `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
}
function fmtSol(n) {
	if (n == null) return '—';
	const v = Number(n);
	return `${v.toLocaleString(undefined, { maximumFractionDigits: v < 1 ? 5 : 3 })} SOL`;
}
function shortAddr(a) {
	if (!a) return '—';
	return a.length > 12 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a;
}
function solscanTx(sig) {
	return `https://solscan.io/tx/${encodeURIComponent(sig)}`;
}

// ── API ──────────────────────────────────────────────────────────────────────
async function api(url, signal) {
	const r = await fetch(url, {
		headers: { accept: 'application/json', authorization: `Bearer ${secret}` },
		credentials: 'same-origin',
		signal,
	});
	if (r.status === 401 || r.status === 403) {
		secret = '';
		sessionStorage.removeItem(SECRET_KEY);
		stopPolling();
		showGate('Secret rejected. Try again.');
		throw new Error('unauthorized');
	}
	const j = await r.json().catch(() => null);
	if (!r.ok) throw new Error(j?.error_description || j?.error || `HTTP ${r.status}`);
	return j;
}

// ── Gate ─────────────────────────────────────────────────────────────────────
function showGate(err = '') {
	$('rg-root').setAttribute('aria-busy', 'false');
	$('rg-panel').hidden = true;
	$('rg-hint').hidden = true;
	$('rg-gate').hidden = false;
	$('rg-gate-err').textContent = err;
	setTimeout(() => $('rg-secret').focus(), 40);
}
function showPanel() {
	$('rg-gate').hidden = true;
	$('rg-panel').hidden = false;
	$('rg-hint').hidden = false;
	$('rg-root').setAttribute('aria-busy', 'false');
}

$('rg-gate-form').addEventListener('submit', async (e) => {
	e.preventDefault();
	const val = $('rg-secret').value.trim();
	if (!val) return;
	secret = val;
	try {
		await refresh();
		sessionStorage.setItem(SECRET_KEY, secret);
		$('rg-secret').value = '';
		showPanel();
		startPolling();
	} catch {
		/* api() already surfaced the gate error */
	}
});

// ── Fetch + orchestrate ──────────────────────────────────────────────────────
async function refresh() {
	if (inFlight) inFlight.abort();
	inFlight = new AbortController();
	try {
		const d = await api(`${API}?period=${encodeURIComponent(period)}`, inFlight.signal);
		lastData = d;
		clearError();
		render(d);
	} catch (err) {
		if (err?.name === 'AbortError') return;
		if (err?.message === 'unauthorized') return;
		showError(err?.message || 'unreachable');
		throw err;
	} finally {
		inFlight = null;
	}
}

// ── Error banner (API unreachable) ───────────────────────────────────────────
function showError(msg) {
	const box = $('rg-error');
	box.hidden = false;
	box.innerHTML = `<div class="rg-errbox" role="alert">
		<strong>Dashboard API unreachable</strong>
		${esc(msg)} — the ring may still be settling; this is the read model, not the loop.
		<code>curl -s -H "Authorization: Bearer $CRON_SECRET" \\
  "$APP_ORIGIN/api/admin/ring-dashboard?period=${esc(period)}" | jq .pulse</code>
	</div>`;
}
function clearError() {
	$('rg-error').hidden = true;
	$('rg-error').innerHTML = '';
}

// ── Render ───────────────────────────────────────────────────────────────────
function render(d) {
	renderPulse(d.pulse);
	renderLoop(d.report);
	renderActivity(d.activity || []);
	renderFees(d.fees, d.report);
	renderIntegrity(d.reconciliation, d.config);
	renderCoverage(d.endpoints || []);
}

function renderPulse(pulse) {
	if (!pulse) return;
	const status = pulse.status || 'red';
	const big = $('rg-pulse-big');
	const mins = pulse.minutes_since_last_settle;
	big.textContent = mins == null ? '∞' : mins;
	big.className = `rg-pulse-big ${status}`;
	$('rg-pulse-lbl').textContent =
		mins == null ? 'no settle on record' : mins === 1 ? 'min since settle' : 'min since settle';

	const dot = $('rg-hero-dot');
	dot.className = `rg-pulse-dot ${status}`;
	$('rg-hero-word').textContent =
		status === 'green' ? 'Live' : status === 'amber' ? 'Slowing' : 'Stalled';
	$('rg-pulse-meta').textContent = `${pulse.settles_last_60m || 0} settled · last 60 min`;

	const strip = pulse.minutes || [];
	const max = Math.max(1, ...strip.map((m) => m.count));
	$('rg-spark').innerHTML = strip
		.map((m) => {
			const h = m.count ? Math.max(6, Math.round((m.count / max) * 100)) : 0;
			const cls = m.count ? 'rg-spark-bar' : 'rg-spark-bar empty';
			const t = new Date(m.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
			return `<div class="${cls}" style="height:${h}%" title="${esc(t)}: ${m.count} settle${m.count === 1 ? '' : 's'}"></div>`;
		})
		.join('');
	if (strip.length) {
		const midIdx = Math.floor(strip.length / 2);
		$('rg-spark-mid').textContent = new Date(strip[midIdx].ts).toLocaleTimeString([], {
			hour: '2-digit',
			minute: '2-digit',
		});
	}
}

function renderLoop(report) {
	const wrap = $('rg-loop');
	if (!report?.wallets) {
		wrap.innerHTML = emptyBlock('◎', 'Loop wallets unavailable', 'Balances load from live RPC.');
		return;
	}
	const w = report.wallets;
	const node = (role, balHtml, addr, floorHtml = '', below = false) =>
		`<div class="rg-node${below ? ' below' : ''}">
			<div class="rg-node-role">${esc(role)}</div>
			<div class="rg-node-bal">${balHtml}</div>
			<div class="rg-node-addr" title="${esc(addr || '')}">${esc(shortAddr(addr))}</div>
			${floorHtml}
		</div>`;
	const arrow = (label) => `<div class="rg-arrow" title="${esc(label)}" aria-label="${esc(label)}">→</div>`;

	const below = w.sponsor?.below_floor === true;
	const floorHtml = w.sponsor?.floor_sol != null
		? `<div class="rg-node-floor${below ? ' below' : ''}">floor ${fmtSol(w.sponsor.floor_sol)}${below ? ' · BELOW' : ''}</div>`
		: '';

	const parts = [
		node('Payer', fmtUsd(w.payer?.usdc), w.payer?.address, '<div class="rg-node-floor">pays the ring</div>'),
		arrow('pays USDC'),
		node('Endpoint', '◎', null, '<div class="rg-node-floor">x402 settle</div>'),
		arrow('→ treasury'),
		node('Treasury', fmtUsd(w.treasury?.usdc), w.treasury?.address, '<div class="rg-node-floor">receives</div>'),
		arrow('sweep back'),
	];
	// Sponsor is optional in self-pay; only show as a node if it has a balance/floor.
	if (w.sponsor?.address) {
		parts.push(
			node('Sponsor (SOL)', fmtSol(w.sponsor?.sol), w.sponsor?.address, floorHtml, below),
		);
	}
	wrap.innerHTML = parts.join('');
	$('rg-loop-meta').textContent = `float ${fmtUsd(report.net?.ring_float_usdc)}`;
}

function renderActivity(rows) {
	const wrap = $('rg-feed-wrap');
	$('rg-feed-meta').textContent = rows.length ? `${rows.length} recent calls` : '';
	if (!rows.length) {
		wrap.innerHTML = emptyBlock(
			'◎',
			'Ring idle — no paid calls yet',
			'Run the activation runbook to start the per-minute tick.',
		);
		return;
	}
	const rowsHtml = rows
		.map((r) => {
			const isNew = !seenActivityIds.has(r.id);
			const price = r.usdc != null ? fmtUsd(r.usdc, r.usdc < 0.01 ? 4 : 2) : '—';
			const sig = r.tx_sig
				? `<a class="rg-sig" href="${esc(solscanTx(r.tx_sig))}" target="_blank" rel="noopener" title="View on Solscan">${esc(r.tx_sig.slice(0, 8))}↗</a>`
				: '—';
			const agent = r.agent ? esc(r.agent) : esc(r.service || '—');
			const statusCell =
				r.status === 'skipped' || r.status === 'failed'
					? `<span class="rg-status ${r.status}">${r.status}</span>${r.error ? ` <span class="rg-reason ${r.status}">${esc(r.error)}</span>` : ''}`
					: `<span class="rg-status ${r.status}">${r.status}</span>`;
			return `<tr class="${isNew ? 'new' : ''}">
				<td>${fmtAgo(r.ts)}</td>
				<td class="rg-agent">${agent}</td>
				<td><span class="rg-slug">${esc(r.slug)}</span></td>
				<td><span class="rg-kind ${esc(r.kind)}">${esc(r.kind)}</span></td>
				<td class="num">${price}</td>
				<td>${statusCell}</td>
				<td>${sig}</td>
			</tr>`;
		})
		.join('');
	wrap.innerHTML = `<table class="rg-feed">
		<thead><tr>
			<th>Time</th><th>Agent</th><th>Endpoint</th><th>Kind</th>
			<th style="text-align:right">Price</th><th>Status</th><th>Tx</th>
		</tr></thead>
		<tbody>${rowsHtml}</tbody>
	</table>`;
	seenActivityIds = new Set(rows.map((r) => r.id));
}

function renderFees(fees, report) {
	if (!fees) return;
	const el = $('rg-fees');
	const ratio = fees.floor_ratio;
	const ratioCls = ratio == null ? '' : ratio <= 1.05 ? 'good' : ratio <= 1.5 ? 'warn' : 'bad';
	const cards = [
		{
			dt: 'Per settle',
			dd: fees.avg_lamports_per_settle != null ? `${fees.avg_lamports_per_settle.toLocaleString()}` : '—',
			small: `lamports · floor ${fees.floor_lamports.toLocaleString()}`,
			cls: ratioCls,
		},
		{
			dt: 'Floor ratio',
			dd: ratio != null ? `${ratio}×` : '—',
			small: '1.0× = 1-sig minimum',
			cls: ratioCls,
		},
		{
			dt: 'SOL / $100',
			dd: fees.sol_per_100_usd != null ? fees.sol_per_100_usd.toFixed(5) : '—',
			small: 'burn per $100 volume',
		},
		{
			dt: 'Burned today',
			dd: fmtSol((fees.burned_today_lamports || 0) / 1e9),
			small:
				report?.fees?.burned_usd != null ? `≈ ${fmtUsd(report.fees.burned_usd, 4)}` : 'since 00:00 UTC',
		},
	];
	let html = cards
		.map(
			(c) => `<div class="rg-metric">
			<dt>${esc(c.dt)}</dt>
			<dd class="${c.cls || ''}">${c.dd}</dd>
			<small>${esc(c.small)}</small>
		</div>`,
		)
		.join('');
	if (fees.daily_budget_lamports) {
		const pct = Math.min(100, fees.budget_used_pct || 0);
		const barCls = fees.over_budget ? 'bad' : pct >= 80 ? 'warn' : '';
		html += `<div class="rg-budget-bar">
			<small style="color:var(--rg-dim)">Daily fee budget — ${fees.budget_used_pct ?? 0}% used
			(${((fees.burned_today_lamports || 0) / 1e9).toFixed(5)} / ${(fees.daily_budget_lamports / 1e9).toFixed(5)} SOL)</small>
			<div class="rg-budget-track"><div class="rg-budget-fill ${barCls}" style="width:${pct}%"></div></div>
		</div>`;
	}
	el.innerHTML = html;
	$('rg-fees-meta').textContent = fees.sol_usd != null ? `SOL ${fmtUsd(fees.sol_usd)}` : '';
}

function renderIntegrity(recon, config) {
	const el = $('rg-integrity');
	const warnings = (config?.warnings || []).filter(Boolean);
	const leak = recon?.leak_scan || { open: 0, total: 0, last_checked_at: null };
	const rec = recon?.reconcile || { open: 0, total: 0, last_checked_at: null };
	const openTotal = (leak.open || 0) + (rec.open || 0);
	const errWarnings = warnings.filter((w) => w.level === 'error');
	const allClear = openTotal === 0 && errWarnings.length === 0;

	$('rg-int-meta').textContent = config?.validator ? esc(config.validator) : '';

	if (!recon?.available && !warnings.length) {
		el.innerHTML = emptyBlock('✓', 'No integrity data yet', 'Reconciliation runs on its own cadence.');
		return;
	}

	if (allClear) {
		el.innerHTML = `<div class="rg-calm"><span aria-hidden="true">✓</span>
			All clear — leak scan ${leak.last_checked_at ? fmtAgo(leak.last_checked_at) : 'pending'},
			reconcile ${rec.last_checked_at ? fmtAgo(rec.last_checked_at) : 'pending'}, config valid.</div>`;
		return;
	}

	const alerts = [];
	if (leak.open > 0)
		alerts.push({
			level: 'error',
			code: 'leak_scan',
			msg: `${leak.open} open leak-scan finding${leak.open === 1 ? '' : 's'} — a settlement the chain does not corroborate. Last run ${fmtAgo(leak.last_checked_at)}.`,
		});
	if (rec.open > 0)
		alerts.push({
			level: 'error',
			code: 'reconcile',
			msg: `${rec.open} open reconciliation verdict${rec.open === 1 ? '' : 's'} unresolved. Last run ${fmtAgo(rec.last_checked_at)}.`,
		});
	for (const w of warnings) alerts.push({ level: w.level || 'warn', code: w.code, msg: w.message });

	const byStatus = recon?.open_by_status || {};
	const chips = Object.entries(byStatus)
		.map(([k, v]) => `<span class="rg-chip">${esc(k)}: ${v}</span>`)
		.join('');

	el.innerHTML = `<div class="rg-alert">${alerts
		.map(
			(a) => `<div class="rg-alert-row ${a.level === 'error' ? '' : a.level}">
			<span aria-hidden="true">${a.level === 'error' ? '⚠' : a.level === 'info' ? 'ℹ' : '△'}</span>
			<div>${esc(a.msg)}${a.code ? ` <code>${esc(a.code)}</code>` : ''}</div>
		</div>`,
		)
		.join('')}</div>${chips ? `<div class="rg-chips">${chips}</div>` : ''}`;
}

function renderCoverage(endpoints) {
	const el = $('rg-coverage');
	$('rg-cov-meta').textContent = endpoints.length ? `${endpoints.length} endpoints` : '';
	if (!endpoints.length) {
		el.innerHTML = emptyBlock(
			'◎',
			'No endpoint metrics yet',
			'The volume loop records per-endpoint coverage as it pays each one.',
		);
		return;
	}
	el.innerHTML = endpoints
		.map((e) => {
			const stale = e.stale;
			const age = e.age_minutes == null ? 'never' : fmtAgo(e.last_called_at);
			return `<div class="rg-cov-row${stale ? ' stale' : ''}">
				<div class="rg-cov-name">${esc(e.name || e.key)}<small>${esc(e.path || e.key)}</small></div>
				<div class="rg-cov-age${stale ? ' stale' : ''}" title="${e.calls} calls · ${e.success_pct ?? 0}% ok">${esc(age)}</div>
				<div class="rg-cov-vol">${fmtUsd(e.total_usdc, e.total_usdc < 1 ? 4 : 2)}</div>
			</div>`;
		})
		.join('');
}

function emptyBlock(mark, title, sub) {
	return `<div class="rg-empty"><div class="rg-empty-mark" aria-hidden="true">${mark}</div>
		<strong>${esc(title)}</strong>${esc(sub)}</div>`;
}

// ── Skeleton (first paint) ───────────────────────────────────────────────────
function paintSkeleton() {
	$('rg-spark').innerHTML = Array.from({ length: 60 })
		.map(() => '<div class="rg-spark-bar empty" style="height:20%"></div>')
		.join('');
	$('rg-loop').innerHTML = '<div class="rg-skel" style="height:88px;flex:1"></div>';
	$('rg-feed-wrap').innerHTML = '<div class="rg-skel" style="height:180px"></div>';
	$('rg-fees').innerHTML = Array.from({ length: 4 })
		.map(() => '<div class="rg-skel" style="height:66px"></div>')
		.join('');
	$('rg-integrity').innerHTML = '<div class="rg-skel" style="height:46px"></div>';
	$('rg-coverage').innerHTML = '<div class="rg-skel" style="height:120px"></div>';
}

// ── Period switch ────────────────────────────────────────────────────────────
$('rg-periods').addEventListener('click', (e) => {
	const btn = e.target.closest('button[data-period]');
	if (!btn || btn.dataset.period === period) return;
	period = btn.dataset.period;
	$('rg-periods')
		.querySelectorAll('button')
		.forEach((b) => b.classList.toggle('on', b === btn));
	refresh().catch(() => {});
});

// ── Controls ─────────────────────────────────────────────────────────────────
$('rg-refresh').addEventListener('click', () => refresh().catch(() => {}));
$('rg-pause').addEventListener('click', togglePause);

function togglePause() {
	paused = !paused;
	const btn = $('rg-pause');
	btn.classList.toggle('on', paused);
	btn.innerHTML = paused ? '▶ Resume' : '⏸ Pause';
	if (paused) stopPolling(true);
	else if (secret && !$('rg-panel').hidden) {
		refresh().catch(() => {});
		startPolling();
	}
}

document.addEventListener('keydown', (e) => {
	if (e.target.tagName === 'INPUT' || $('rg-panel').hidden) return;
	if (e.key === 'r') {
		e.preventDefault();
		refresh().catch(() => {});
	} else if (e.key === 'p') {
		e.preventDefault();
		togglePause();
	}
});

// ── Poll loop ────────────────────────────────────────────────────────────────
function startPolling() {
	stopPolling(true);
	if (paused) return;
	pollTimer = setInterval(() => refresh().catch(() => {}), POLL_MS);
	// Keep relative timestamps fresh without a network round-trip.
	clockTimer = setInterval(() => {
		if (lastData) {
			renderPulse(lastData.pulse);
			renderActivity(lastData.activity || []);
		}
	}, 1000);
}
function stopPolling(keepPausedFlag = false) {
	clearInterval(pollTimer);
	clearInterval(clockTimer);
	pollTimer = clockTimer = null;
	if (!keepPausedFlag) paused = false;
}
document.addEventListener('visibilitychange', () => {
	if (document.hidden) {
		clearInterval(pollTimer);
		clearInterval(clockTimer);
		pollTimer = clockTimer = null;
	} else if (secret && !$('rg-panel').hidden && !paused) {
		refresh().catch(() => {});
		startPolling();
	}
});

// ── Boot ─────────────────────────────────────────────────────────────────────
(async function boot() {
	paintSkeleton();
	if (!secret) return showGate();
	try {
		await refresh();
		showPanel();
		startPolling();
	} catch {
		/* 401 → gate already shown; other errors → error banner is visible */
		if (secret) showPanel();
	}
})();
