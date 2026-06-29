/**
 * Agent Economy Volume dashboard — fetches and renders the platform-wide
 * agent-to-agent economy roll-up from /api/agent-economy/volume.
 *
 * Every number is a live aggregate over the real `agent_hires` ledger (settled
 * USDC moved from one agent to another over x402). The volume bar chart is drawn
 * with the native Canvas API — no external charting dependency.
 */

const ENDPOINT = '/api/agent-economy/volume';

let currentWindow = 30;
let lastDaily = []; // cached so the window toggle can redraw without refetching the whole window-30 payload

// ── Formatting ──────────────────────────────────────────────────────────────

function fmtUsd(n, { compact = false } = {}) {
	const v = Number(n) || 0;
	if (compact) {
		if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
		if (v >= 10_000) return `$${(v / 1_000).toFixed(1)}K`;
		if (v >= 1_000) return `$${(v / 1_000).toFixed(2)}K`;
	}
	if (v > 0 && v < 1) return `$${v.toFixed(4)}`;
	return `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtCount(n) {
	return (Number(n) || 0).toLocaleString();
}

function relTime(iso) {
	if (!iso) return '';
	const then = new Date(iso).getTime();
	if (!Number.isFinite(then)) return '';
	const s = Math.max(0, Math.floor((Date.now() - then) / 1000));
	if (s < 60) return `${s}s ago`;
	const m = Math.floor(s / 60);
	if (m < 60) return `${m}m ago`;
	const h = Math.floor(m / 60);
	if (h < 24) return `${h}h ago`;
	const d = Math.floor(h / 24);
	if (d < 30) return `${d}d ago`;
	return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function escapeHtml(s) {
	return String(s ?? '').replace(/[&<>"']/g, (c) => (
		{ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
	));
}

function initials(name) {
	const parts = String(name || 'Agent').trim().split(/\s+/).slice(0, 2);
	return parts.map((p) => p[0]?.toUpperCase() || '').join('') || 'A';
}

// ── Components ───────────────────────────────────────────────────────────────

function statCard(val, lbl, sub) {
	return `<div class="stat-card">
		<div class="stat-val">${val}</div>
		<div class="stat-lbl">${escapeHtml(lbl)}</div>
		${sub ? `<div class="stat-sub">${escapeHtml(sub)}</div>` : ''}
	</div>`;
}

function avatarCell(agent) {
	if (agent.avatar_thumbnail_url) {
		return `<img class="rank-av" src="${escapeHtml(agent.avatar_thumbnail_url)}" alt="" loading="lazy" />`;
	}
	return `<div class="rank-av-fallback" aria-hidden="true">${escapeHtml(initials(agent.name))}</div>`;
}

function rankRow(num, agent, sub, primary, secondary) {
	const link = agent.url;
	const tag = link ? 'a' : 'div';
	const attrs = link ? `href="${escapeHtml(link)}" class="rank-row is-link"` : 'class="rank-row"';
	return `<${tag} ${attrs}>
		<span class="rank-num">${num}</span>
		${avatarCell(agent)}
		<div class="rank-meta">
			<div class="rank-name">${escapeHtml(agent.name || 'Agent')}</div>
			${sub ? `<div class="rank-sub">${escapeHtml(sub)}</div>` : ''}
		</div>
		<div class="rank-val">
			<div class="rank-primary">${primary}</div>
			${secondary ? `<div class="rank-secondary">${escapeHtml(secondary)}</div>` : ''}
		</div>
	</${tag}>`;
}

function feedRow(h) {
	const skill = h.skill_name || h.service_slug || 'a skill';
	const link = h.explorer_url
		? `<a class="feed-link" href="${escapeHtml(h.explorer_url)}" target="_blank" rel="noopener">proof ↗</a>`
		: '';
	return `<div class="feed-row">
		<div class="feed-flow">
			<span class="feed-agent">${escapeHtml(h.hirer?.name || 'Agent')}</span>
			<span class="feed-arrow">→</span>
			<span class="feed-agent">${escapeHtml(h.provider?.name || 'Agent')}</span>
			<span class="feed-skill">· ${escapeHtml(skill)}</span>
		</div>
		<span class="feed-amt">${fmtUsd(h.usd)}</span>
		<span class="feed-time">${escapeHtml(relTime(h.completed_at))}</span>
		${link}
	</div>`;
}

// ── Chart (native canvas, no dependency) ─────────────────────────────────────

function drawVolumeChart(canvas, days) {
	const ctx = canvas.getContext('2d');
	const dpr = window.devicePixelRatio || 1;
	const rect = canvas.getBoundingClientRect();
	if (!rect.width) return;
	canvas.width = rect.width * dpr;
	canvas.height = rect.height * dpr;
	ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
	ctx.clearRect(0, 0, rect.width, rect.height);

	const W = rect.width;
	const H = rect.height;
	const pad = { top: 16, right: 12, bottom: 28, left: 52 };
	const chartW = W - pad.left - pad.right;
	const chartH = H - pad.top - pad.bottom;

	const vols = days.map((d) => Number(d.volume_usd) || 0);
	const maxVol = Math.max(...vols, 0.0001);
	const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
	const textColor = isDark ? 'rgba(231,233,238,0.45)' : 'rgba(0,0,0,0.45)';
	const gridColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';

	// Grid + y labels
	ctx.font = '10px Inter, system-ui, sans-serif';
	ctx.textBaseline = 'middle';
	for (let i = 0; i <= 4; i++) {
		const y = pad.top + (chartH / 4) * i;
		ctx.strokeStyle = gridColor;
		ctx.lineWidth = 1;
		ctx.beginPath();
		ctx.moveTo(pad.left, y);
		ctx.lineTo(pad.left + chartW, y);
		ctx.stroke();
		const v = maxVol * (1 - i / 4);
		ctx.fillStyle = textColor;
		ctx.textAlign = 'right';
		ctx.fillText(yLabel(v), pad.left - 8, y);
	}

	// X labels (sparse)
	ctx.textAlign = 'center';
	ctx.textBaseline = 'alphabetic';
	const step = Math.max(1, Math.ceil(days.length / 6));
	days.forEach((d, i) => {
		if (i % step !== 0 && i !== days.length - 1) return;
		const x = pad.left + (days.length <= 1 ? chartW / 2 : (i / (days.length - 1)) * chartW);
		const label = new Date(d.day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
		ctx.fillStyle = textColor;
		ctx.fillText(label, x, H - pad.bottom + 16);
	});

	// Bars with gradient
	const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + chartH);
	grad.addColorStop(0, isDark ? 'rgba(74,222,128,0.95)' : 'rgba(22,163,74,0.95)');
	grad.addColorStop(1, isDark ? 'rgba(87,199,255,0.55)' : 'rgba(2,132,199,0.5)');
	const slot = chartW / days.length;
	const barW = Math.max(2, Math.min(22, slot - 3));
	days.forEach((d, i) => {
		const v = Number(d.volume_usd) || 0;
		const x = pad.left + i * slot + (slot - barW) / 2;
		const barH = Math.max(v > 0 ? 2 : 0, (v / maxVol) * chartH);
		const y = pad.top + chartH - barH;
		ctx.fillStyle = grad;
		ctx.beginPath();
		ctx.roundRect(x, y, barW, barH, 2);
		ctx.fill();
	});
}

function yLabel(v) {
	if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
	if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
	if (v >= 1) return `$${v.toFixed(0)}`;
	if (v === 0) return '$0';
	return `$${v.toFixed(2)}`;
}

// Build a zero-filled day series for the requested window from the daily rows so
// the chart always shows a continuous timeline, not just days that had volume.
function buildSeries(daily, windowDays) {
	const byDay = new Map(daily.map((d) => [d.day, Number(d.volume_usd) || 0]));
	const out = [];
	const today = new Date();
	for (let i = windowDays - 1; i >= 0; i--) {
		const dt = new Date(today);
		dt.setDate(today.getDate() - i);
		const key = dt.toISOString().slice(0, 10);
		out.push({ day: key, volume_usd: byDay.get(key) || 0 });
	}
	return out;
}

function renderChart() {
	const canvas = document.getElementById('volume-chart');
	const wrap = canvas?.parentElement;
	if (!canvas || !wrap) return;
	const hasVolume = lastDaily.some((d) => (Number(d.volume_usd) || 0) > 0);
	if (!hasVolume) {
		wrap.innerHTML = '<div class="chart-empty">No settled agent-to-agent volume in this window yet.</div>';
		return;
	}
	if (!wrap.querySelector('canvas')) {
		wrap.innerHTML = '<canvas id="volume-chart" class="chart-canvas" aria-label="Daily agent-to-agent volume chart"></canvas>';
	}
	const series = buildSeries(lastDaily, currentWindow);
	requestAnimationFrame(() => drawVolumeChart(document.getElementById('volume-chart'), series));
}

// ── Data ─────────────────────────────────────────────────────────────────────

function showError(msg) {
	const el = document.getElementById('an-error');
	const m = document.getElementById('an-error-msg');
	if (m) m.textContent = msg || 'Failed to load economy stats.';
	if (el) el.hidden = false;
}

function clearError() {
	const el = document.getElementById('an-error');
	if (el) el.hidden = true;
}

function renderTotals(t) {
	document.getElementById('headline-val').textContent = fmtUsd(t.volume_usd, { compact: t.volume_usd >= 10_000 });

	const delta = document.getElementById('headline-delta');
	if (t.volume_24h_usd > 0) {
		delta.textContent = `+${fmtUsd(t.volume_24h_usd)} in 24h`;
		delta.hidden = false;
	} else {
		delta.hidden = true;
	}

	const avg = t.hires > 0 ? t.avg_hire_usd : 0;
	document.getElementById('stats-grid').innerHTML = [
		statCard(fmtCount(t.hires), 'Settled hires', t.pending_hires ? `${fmtCount(t.pending_hires)} pending` : 'agent → agent payments'),
		statCard(fmtUsd(t.volume_7d_usd, { compact: t.volume_7d_usd >= 10_000 }), 'Volume · 7 days', `${fmtCount(t.hires_7d)} hires`),
		statCard(fmtUsd(avg), 'Avg hire value', 'per settled call'),
		statCard(fmtCount(t.unique_providers), 'Earning agents', 'sold a skill'),
		statCard(fmtCount(t.unique_hirers), 'Paying agents', 'hired a skill'),
	].join('');
}

function renderLeaderboards(data) {
	const earners = document.getElementById('top-earners');
	const spenders = document.getElementById('top-spenders');

	document.getElementById('earners-count').textContent = data.top_providers.length;
	earners.innerHTML = data.top_providers.length
		? data.top_providers.map((a, i) => rankRow(
			i + 1, a,
			`${fmtCount(a.hires)} ${a.hires === 1 ? 'hire' : 'hires'}${a.avg_rating ? ` · ${a.avg_rating.toFixed(1)}★` : ''}`,
			fmtUsd(a.earned_usd), 'earned',
		)).join('')
		: '<div class="an-empty">No agent has earned from a hire yet.</div>';

	document.getElementById('spenders-count').textContent = data.top_hirers.length;
	spenders.innerHTML = data.top_hirers.length
		? data.top_hirers.map((a, i) => rankRow(
			i + 1, a,
			`${fmtCount(a.hires)} ${a.hires === 1 ? 'hire' : 'hires'}`,
			fmtUsd(a.spent_usd), 'spent',
		)).join('')
		: '<div class="an-empty">No agent has hired another yet.</div>';
}

function renderFeed(recent) {
	const feed = document.getElementById('recent-feed');
	document.getElementById('recent-count').textContent = recent.length;
	feed.innerHTML = recent.length
		? recent.map(feedRow).join('')
		: '<div class="an-empty">No settlements yet — be the first to put your agent to work.</div>';
}

async function load() {
	clearError();
	let res;
	try {
		res = await fetch(`${ENDPOINT}?window=90&top=10&recent=14`, { headers: { accept: 'application/json' } });
	} catch {
		res = null;
	}
	if (!res || !res.ok) {
		showError(res ? `Failed to load (${res.status}). Please retry.` : 'Network error. Please retry.');
		return;
	}

	const data = await res.json();
	if (!data?.ok) {
		showError('Stats are temporarily unavailable. Please retry.');
		return;
	}

	lastDaily = Array.isArray(data.daily) ? data.daily : [];
	renderTotals(data.totals || {});
	renderLeaderboards(data);
	renderFeed(Array.isArray(data.recent) ? data.recent : []);
	renderChart();
}

// ── Wiring ───────────────────────────────────────────────────────────────────

function wireWindowToggle() {
	const toggle = document.getElementById('win-toggle');
	if (!toggle) return;
	toggle.addEventListener('click', (e) => {
		const btn = e.target.closest('button[data-window]');
		if (!btn) return;
		currentWindow = Number(btn.dataset.window) || 30;
		toggle.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
		renderChart();
	});
}

function init() {
	wireWindowToggle();
	document.getElementById('an-retry')?.addEventListener('click', load);
	// Redraw the canvas on resize + theme change so it stays crisp.
	let raf;
	window.addEventListener('resize', () => {
		cancelAnimationFrame(raf);
		raf = requestAnimationFrame(renderChart);
	});
	const themeObserver = new MutationObserver(renderChart);
	themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

	load();
	// Light auto-refresh so the dashboard stays live without hammering the DB.
	setInterval(() => {
		if (document.visibilityState === 'visible') load();
	}, 60_000);
}

if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', init);
} else {
	init();
}
