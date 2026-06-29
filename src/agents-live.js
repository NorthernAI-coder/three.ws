// /agents-live — the live agent wall.
//
// Shows EVERY agent on the platform (the full public directory + the signed-in
// owner's own agents), each as a card with a live screen. For each agent we open
// an SSE listener to /api/agent-screen-stream:
//   • If a Playwright caster is pushing frames, we paint those frames verbatim.
//   • Otherwise we render the agent's real activity (its agent_actions, streamed
//     from the DB by the endpoint) as a live terminal — so a screen is NEVER
//     blank, for any agent, 24/7, at zero compute cost.
//
// Watching a card also signals intent (/api/agent/watch-intent) so the on-demand
// caster pool can spin a real browser up for agents people are actually looking
// at, and tear it down when they leave. That keeps live pixels available for any
// agent on demand without paying for an idle browser per agent.

import { parsePnlDelta, formatSol, formatUsd } from './shared/trade-pnl.js';

const grid       = document.getElementById('al-grid');
const liveCount  = document.getElementById('al-live-count');
const statsBar   = document.getElementById('al-stats');
const statLive   = document.getElementById('al-stat-live');
const statFps    = document.getElementById('al-stat-fps');
const statTotal  = document.getElementById('al-stat-total');

// Per-agent runtime state. agentId → { es, card, entries, lastFrameAt, live }
const _cards = new Map();
const _fpsMap = new Map();   // agentId → frames since last tick

// Roster pagination cursor (created_at of the last public agent loaded).
let   _cursor = null;
let   _hasMore = true;
let   _loading = false;

// Interval handles for the FPS ticker and idle repaint loops.
let   _fpsInterval = null;
let   _idleRepaint = null;

const FRAME_STALE_MS = 6000;       // no frame within this window ⇒ fall back to activity
const WATCH_PING_MS  = 20000;      // re-assert watch intent while a card is on screen
const WATCH_STATUS_MS = 4000;      // refresh the warming/queued handoff while not yet live
const STATUS_GRACE_POLLS = 3;      // keep polling this many ticks to cover the intent→status write race

// Cards currently intersecting the viewport. Only these signal watch intent and
// poll handoff status, so the bounded Chromium pool spins up exactly for the
// agents a viewer is actually looking at — and frees the slot the instant they
// scroll away (the worker tears a caster down once its agent leaves the wanted
// window). IntersectionObserver maintains this set.
const _inView = new Set();
let _observer = null;

function esc(s) {
	return String(s ?? '').replace(/[&<>"']/g, (c) => ({
		'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
	}[c]));
}

// ── roster ──────────────────────────────────────────────────────────────────

// Pull a page of agents from the public directory. When signed in we also merge
// the caller's own agents (which may be private) so an owner always sees theirs.
async function fetchRosterPage() {
	const params = new URLSearchParams({ sort: 'popular', limit: '48' });
	if (_cursor) params.set('before', _cursor);
	let agents = [];
	let hasMore = false;
	let cursor = null;
	try {
		const res = await fetch(`/api/agents/public?${params}`, { headers: { accept: 'application/json' } });
		if (res.ok) {
			const data = await res.json();
			agents = data.agents || [];
			hasMore = !!data.has_more;
			cursor = data.next_cursor || null;
		}
	} catch { /* network — handled by caller via empty page */ }

	// First page only: merge the owner's own agents so a signed-in user always
	// sees their roster even if some are private / not yet in the public index.
	if (!_cursor) {
		try {
			const res = await fetch('/api/agents', { credentials: 'include', headers: { accept: 'application/json' } });
			if (res.ok) {
				const data = await res.json();
				const own = (data.agents || []).map((a) => ({
					id: a.id,
					name: a.name || a.display_name || 'Agent',
					avatar_thumbnail: a.avatar_thumbnail_url || a.avatar_url || a.avatar_glb_url || '',
					owned: true,
				}));
				const seen = new Set(agents.map((a) => a.id));
				agents = [...own.filter((a) => !seen.has(a.id)), ...agents];
			}
		} catch { /* anonymous — public list only */ }
	}

	return { agents, hasMore, cursor };
}

// ── card ──────────────────────────────────────────────────────────────────────

function buildCard(agent) {
	const id     = agent.id || agent.agentId;
	const name   = agent.name || agent.agentName || 'Agent';
	const avatar = agent.avatar_thumbnail || agent.avatarUrl || agent.avatar_url || '';
	const watchHref = `/agent-screen?agentId=${encodeURIComponent(id)}`;

	const el = document.createElement('a');
	el.className = 'al-card';
	el.href = watchHref;
	el.target = '_blank';
	el.rel = 'noopener';
	el.dataset.agentId = id;
	el.innerHTML = `
<div class="al-card-screen">
  <canvas class="al-card-canvas" width="640" height="360"></canvas>
  <div class="al-card-overlay"></div>
  <div class="al-card-warming" data-warming hidden>
    <span class="al-warming-pulse"></span>
    <span class="al-warming-text" data-warming-text></span>
  </div>
  <div class="al-card-live-badge">
    <div class="al-card-live-dot idle" data-dot></div>
    <span data-status>Connecting</span>
  </div>
  <div class="al-card-expand">⛶</div>
</div>
<div class="al-card-info">
  ${avatar
		? `<img class="al-card-avatar" src="${esc(avatar)}" alt="${esc(name)}" onerror="this.style.display='none'">`
		: `<div class="al-card-avatar" style="background:rgba(255,255,255,0.06)"></div>`}
  <div class="al-card-meta">
    <div class="al-card-name">${esc(name)}</div>
    <div class="al-card-action" data-action>Connecting…</div>
    <span class="al-card-pnl" data-pnl hidden></span>
  </div>
  <a class="al-card-watch-btn" href="${esc(watchHref)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">Watch</a>
</div>`;
	return el;
}

// Render the agent's recent activity as a live terminal onto the card canvas.
// This is the always-available view shown whenever live pixels aren't arriving.
function paintActivity(state) {
	const { card, entries, name } = state;
	const canvas = card.querySelector('canvas');
	const ctx = canvas.getContext('2d');
	const W = canvas.width, H = canvas.height;
	const t = Date.now() / 1000;

	const g = ctx.createLinearGradient(0, 0, 0, H);
	g.addColorStop(0, '#0d0d11');
	g.addColorStop(1, '#070708');
	ctx.fillStyle = g;
	ctx.fillRect(0, 0, W, H);

	// header
	ctx.fillStyle = 'rgba(255,255,255,0.03)';
	ctx.fillRect(0, 0, W, 30);
	ctx.beginPath();
	ctx.arc(16, 15, 3.5, 0, Math.PI * 2);
	ctx.fillStyle = 'rgba(120,120,128,0.6)';
	ctx.fill();
	ctx.font = '600 11px Inter, system-ui, sans-serif';
	ctx.fillStyle = 'rgba(255,255,255,0.55)';
	ctx.textAlign = 'left';
	ctx.textBaseline = 'middle';
	ctx.fillText(`${(name || 'Agent').slice(0, 28)} · activity`, 28, 15);

	const lines = (entries || []).slice().reverse(); // newest-first
	if (!lines.length) {
		ctx.font = '500 12px "Courier New", monospace';
		ctx.fillStyle = 'rgba(255,255,255,0.18)';
		const msg = '> standing by — no recorded actions yet';
		ctx.fillText(msg, 16, 56);
		if (Math.sin(t * 4) > 0) {
			ctx.fillStyle = 'rgba(255,255,255,0.18)';
			ctx.fillRect(16 + ctx.measureText(msg).width + 4, 48, 7, 14);
		}
		if (state.action) state.action.textContent = 'Standing by';
		return;
	}

	const lH = 26;
	const y = 52;
	const max = Math.floor((H - 52) / lH);
	lines.slice(0, max).forEach((a, i) => {
		const latest = i === 0;
		const age = Math.max(0, Math.round((Date.now() - (a.ts || Date.now())) / 1000));
		const ts = age < 5 ? 'now' : age < 60 ? `${age}s` : age < 3600 ? `${Math.round(age / 60)}m` : `${Math.round(age / 3600)}h`;
		// A realized exit tints its line green/red so the terminal reads as a tape.
		const exit = parsePnlDelta(a.pnl);
		const exitSign = exit?.phase === 'exit'
			? (exit.solDelta ?? exit.realizedUsd ?? 0)
			: null;
		ctx.font = '600 11px "Courier New", monospace';
		ctx.fillStyle = latest ? '#5fd08a' : 'rgba(255,255,255,0.2)';
		const pfx = `[${ts}] `;
		ctx.fillText(pfx, 16, y + i * lH);
		const pw = ctx.measureText(pfx).width;
		ctx.font = `${latest ? '600' : '400'} 12px "Courier New", monospace`;
		if (exitSign != null && exitSign !== 0) {
			ctx.fillStyle = exitSign > 0
				? (latest ? '#6ee7a0' : 'rgba(110,231,160,0.55)')
				: (latest ? '#f9a8a8' : 'rgba(249,168,168,0.55)');
		} else {
			ctx.fillStyle = latest ? '#f0f0f4' : 'rgba(255,255,255,0.4)';
		}
		ctx.fillText((a.activity || a.type || 'action').slice(0, 64), 16 + pw, y + i * lH);
	});

	if (state.action) state.action.textContent = lines[0].activity || lines[0].type || 'active';
}

function isLiveNow(state) {
	return state.lastFrameAt && (Date.now() - state.lastFrameAt) < FRAME_STALE_MS;
}

// Fold one trade frame/log entry's realized exit into the card's running PnL and
// render the colored chip. Deduped by timestamp so the reconnect backfill can't
// double-count. Returns true when a fresh exit moved the number.
function ingestCardPnl(state, entry) {
	const delta = parsePnlDelta(entry?.pnl);
	if (!delta || delta.phase !== 'exit') return false;
	const ts = Number(entry.ts) || 0;
	if (ts && state.seenPnlTs.has(ts)) return false;
	if (ts) state.seenPnlTs.add(ts);
	if (delta.realizedUsd != null) { state.realizedUsd += delta.realizedUsd; state.sawUsd = true; }
	if (delta.solDelta != null) state.realizedSol += delta.solDelta;
	renderCardPnl(state);
	return true;
}

function renderCardPnl(state) {
	const chip = state.card.querySelector('[data-pnl]');
	if (!chip) return;
	const primary = state.sawUsd ? state.realizedUsd : state.realizedSol;
	if (!Number.isFinite(primary)) { chip.hidden = true; return; }
	chip.hidden = false;
	chip.classList.toggle('pos', primary > 1e-9);
	chip.classList.toggle('neg', primary < -1e-9);
	chip.textContent = state.sawUsd ? (formatUsd(primary) ?? formatSol(state.realizedSol)) : formatSol(primary);
	chip.title = `Session realized P&L · ${formatSol(state.realizedSol)}`;
}

function attachStream(state) {
	const { card, agentId } = state;
	if (state.es) { try { state.es.close(); } catch { /* */ } }

	const dot      = card.querySelector('[data-dot]');
	const statusEl = card.querySelector('[data-status]');
	const canvas   = card.querySelector('canvas');
	const ctx      = canvas.getContext('2d');

	function setLive(live) {
		state.live = live;
		dot.classList.toggle('idle', !live);
		if (live) {
			statusEl.textContent = 'Live';
			state.reconnecting = false;
			clearTimeout(state.reconnectLabelTimer);
		} else {
			dot.classList.remove('thin');
			state.lowFpsSince = 0;
			// Don't clobber a transient "Reconnecting…" label set by onerror below.
			if (!state.reconnecting) statusEl.textContent = state.entries?.length ? 'Active' : 'Idle';
		}
	}
	state.setLive = setLive;

	const es = new EventSource(`/api/agent-screen-stream?agentId=${encodeURIComponent(agentId)}`);
	state.es = es;

	es.addEventListener('frame', (e) => {
		try {
			const msg = JSON.parse(e.data);
			const src = msg.frame || msg.data;
			if (!src) return;
			const img = new Image();
			img.onload = () => ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
			img.src = src.startsWith('data:') ? src : 'data:image/png;base64,' + src;
			state.lastFrameAt = Date.now();
			setLive(true);
			// Real pixels are arriving — the handoff is done. Hide the warming overlay
			// and stop polling status; frames are now the source of truth.
			hideWarming(state);
			stopStatusPolling(state);
			_fpsMap.set(agentId, (_fpsMap.get(agentId) || 0) + 1);
			if (msg.activity && state.action) state.action.textContent = msg.activity;
			if (msg.type === 'trade') ingestCardPnl(state, msg);
		} catch { /* malformed */ }
	});

	es.addEventListener('log', (e) => {
		try {
			const { entries } = JSON.parse(e.data);
			if (Array.isArray(entries)) {
				state.entries = entries;
				// Fold any realized exits in the backfill into the running PnL chip.
				entries.forEach((entry) => ingestCardPnl(state, entry));
			}
			if (!isLiveNow(state)) { paintActivity(state); setLive(false); }
		} catch { /* */ }
	});

	es.addEventListener('open', () => { if (statusEl.textContent === 'Connecting') setLive(false); });
	es.addEventListener('dark', () => {
		setLive(false);
		paintActivity(state);
		// Still on screen but no caster — resume the warming/queued handoff poll.
		if (_inView.has(agentId)) startStatusPolling(state);
	});
	es.addEventListener('ping', () => { if (statusEl.textContent === 'Connecting') setLive(false); });
	es.onerror = () => {
		// Reclaim pool priority immediately on a drop — don't wait for the slow ping
		// loop — and show a transient "Reconnecting…" (not "Idle") for the first 2s
		// so a brief blip doesn't read as the agent going quiet.
		if (_inView.has(agentId)) signalWatch(agentId);
		state.reconnecting = true;
		setLive(false);
		statusEl.textContent = 'Reconnecting…';
		clearTimeout(state.reconnectLabelTimer);
		state.reconnectLabelTimer = setTimeout(() => {
			state.reconnecting = false;
			if (!isLiveNow(state)) statusEl.textContent = state.entries?.length ? 'Active' : 'Idle';
		}, 2000);
	};
}

// ── watch intent ────────────────────────────────────────────────────────────
// Tell the backend which agents are being actively watched so the caster pool
// can prioritise real browser streams for them. Fire-and-forget; the wall works
// fully (activity view) whether or not a caster ever picks the agent up.
function signalWatch(agentId) {
	try {
		fetch('/api/agent/watch-intent', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ agentId }),
			keepalive: true,
		}).catch(() => {});
	} catch { /* */ }
}

// ── handoff status overlay (warming / queued) ────────────────────────────────
// While a viewer is looking at a card that isn't live yet, the on-demand pool is
// either spinning a browser up for it (warming) or it's waiting behind others
// (queued). /api/agent/watch-status resolves which, from Redis only, so the card
// shows an honest "warming up" / "#N in line" overlay instead of a dead box.

function showWarming(state, text) {
	const el = state.card.querySelector('[data-warming]');
	if (!el) return;
	const txt = el.querySelector('[data-warming-text]');
	if (txt) txt.textContent = text;
	// Drop the initial display:none gate once, then drive visibility via opacity so
	// the overlay can fade in/out (and never blocks the card link — pointer-events:none).
	el.hidden = false;
	el.classList.add('is-visible');
}

function hideWarming(state) {
	const el = state.card?.querySelector('[data-warming]');
	if (el) el.classList.remove('is-visible');
}

function applyWatchStatus(state, data) {
	if (isLiveNow(state)) { hideWarming(state); return; }
	if (data?.state === 'warming') showWarming(state, 'Warming up a live view…');
	else if (data?.state === 'queued') showWarming(state, `Live view queued · #${data.position || 1} in line`);
	else hideWarming(state);
}

async function pollWatchStatus(state) {
	if (isLiveNow(state)) { hideWarming(state); return; }
	state.statusPolls = (state.statusPolls || 0) + 1;
	try {
		const res = await fetch(`/api/agent/watch-status?agentId=${encodeURIComponent(state.agentId)}`, {
			headers: { accept: 'application/json' },
		});
		if (!res.ok) { hideWarming(state); return; }
		const data = await res.json();
		state.lastStatus = data.state;
		applyWatchStatus(state, data);
	} catch { hideWarming(state); }
}

// Keep refreshing while the card is on screen and not yet live, but only as long
// as the pool is actually working on it (warming/queued) — with a short grace
// window so the watch-intent → watch-status write race can't end polling early.
function shouldKeepPolling(state) {
	if (!_inView.has(state.agentId) || isLiveNow(state)) return false;
	if (state.lastStatus === 'warming' || state.lastStatus === 'queued') return true;
	return (state.statusPolls || 0) < STATUS_GRACE_POLLS;
}

function startStatusPolling(state) {
	stopStatusPolling(state);
	state.statusPolls = 0;
	const tick = async () => {
		await pollWatchStatus(state);
		state.statusTimer = shouldKeepPolling(state) ? setTimeout(tick, WATCH_STATUS_MS) : null;
	};
	tick();
}

function stopStatusPolling(state) {
	if (state.statusTimer) { clearTimeout(state.statusTimer); state.statusTimer = null; }
}

// ── intersection-driven intent ───────────────────────────────────────────────
// Only cards actually on screen signal watch intent + poll status, so the bounded
// pool spins up exactly for what's being looked at and frees the slot the instant
// a viewer scrolls past (the agent falls out of the wanted window; the worker
// tears its caster down).
function getObserver() {
	if (_observer) return _observer;
	_observer = new IntersectionObserver((entries) => {
		for (const entry of entries) {
			const id = entry.target.dataset.agentId;
			const state = _cards.get(id);
			if (!state) continue;
			if (entry.isIntersecting) {
				_inView.add(id);
				signalWatch(id);
				if (!isLiveNow(state)) startStatusPolling(state);
			} else {
				_inView.delete(id);
				stopStatusPolling(state);
				hideWarming(state);
			}
		}
	}, { threshold: 0.1 });
	return _observer;
}

// ── lifecycle ──────────────────────────────────────────────────────────────────

function mountAgent(agent) {
	const id = agent.id || agent.agentId;
	if (!id || _cards.has(id)) return;
	const card = buildCard(agent);
	grid.querySelectorAll('.al-skeleton').forEach((s) => s.remove());
	grid.querySelector('.al-empty')?.remove();
	grid.appendChild(card);
	const state = {
		agentId: id,
		card,
		name: agent.name || agent.agentName || 'Agent',
		action: card.querySelector('[data-action]'),
		entries: [],
		lastFrameAt: 0,
		live: false,
		es: null,
		// running realized PnL for the card chip
		realizedSol: 0,
		realizedUsd: 0,
		sawUsd: false,
		seenPnlTs: new Set(),
	};
	_cards.set(id, state);
	attachStream(state);
	// Intent + status polling are intersection-driven (getObserver), so the pool
	// only spins up for cards actually on screen and frees the slot on scroll-away.
	getObserver().observe(card);
}

function renderEmpty() {
	grid.innerHTML = `
<div class="al-empty">
	<div class="al-empty-icon">🖥</div>
	<h2>No agents yet</h2>
	<p>Agents appear here the moment they're created. Spin one up and watch it work in real time.</p>
	<a href="/dashboard-next/create" class="al-empty-cta">Create an agent →</a>
</div>`;
}

async function loadMore() {
	if (_loading || !_hasMore) return;
	_loading = true;
	const { agents, hasMore, cursor } = await fetchRosterPage();
	_hasMore = hasMore;
	_cursor = cursor;

	if (!_cards.size && !agents.length) {
		renderEmpty();
		_loading = false;
		return;
	}
	agents.forEach(mountAgent);
	updateStats();
	_loading = false;
}

function updateStats() {
	const total = _cards.size;
	let live = 0;
	for (const s of _cards.values()) if (isLiveNow(s)) live++;
	if (liveCount) liveCount.textContent = live;
	if (statLive) statLive.textContent = live;
	if (statTotal) statTotal.textContent = total;
	if (statsBar) statsBar.hidden = total === 0;
}

// FPS + live-count ticker. Also surfaces per-card FPS in the live badge tooltip
// and downgrades the dot to a "thin" amber state when a casting agent's own feed
// stutters below ~1 fps for >3s — a stalled caster, distinct from a full dark.
function startFpsTicker() {
	_fpsInterval = setInterval(() => {
		let total = 0;
		for (const [id, s] of _cards) {
			const c = _fpsMap.get(id) || 0;
			total += c;
			s.fps = c;
			const live = isLiveNow(s);
			const statusEl = s.card.querySelector('[data-status]');
			const dot = s.card.querySelector('[data-dot]');
			if (statusEl) statusEl.title = live ? (c > 0 ? `${c} fps` : 'stalled — no frames this second') : '';
			if (live && c < 1) { if (!s.lowFpsSince) s.lowFpsSince = Date.now(); }
			else s.lowFpsSince = 0;
			if (dot) dot.classList.toggle('thin', !!(live && s.lowFpsSince && Date.now() - s.lowFpsSince > 3000));
		}
		_fpsMap.clear();
		if (statFps) statFps.textContent = total > 0 ? `${total}/s` : '—';
		updateStats();
	}, 1000);
}

// Repaint idle cards so relative timestamps + the cursor stay alive, and a card
// that just lost its live feed falls back to the activity terminal.
function startIdleRepaint() {
	_idleRepaint = setInterval(() => {
		if (document.hidden) return;
		for (const s of _cards.values()) {
			if (!isLiveNow(s)) {
				paintActivity(s);
				if (s.live) s.setLive?.(false);
			}
		}
	}, 2500);
}

// Re-assert watch intent on a slow cadence — but only for cards currently on
// screen, so the pool keeps a slot for what a viewer is actually watching and
// lets it expire for everything they've scrolled past.
function startWatchPings() {
	setInterval(() => {
		if (document.hidden) return;
		for (const id of _inView) signalWatch(id);
	}, WATCH_PING_MS);
}

// Infinite scroll: load the next page as the user nears the bottom.
function startInfiniteScroll() {
	window.addEventListener('scroll', () => {
		if (_loading || !_hasMore) return;
		if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 600) loadMore();
	}, { passive: true });
}

function suspendStreams() {
	for (const s of _cards.values()) {
		try { s.es?.close(); } catch { /* */ }
		s.es = null;
		stopStatusPolling(s);
		clearTimeout(s.reconnectLabelTimer);
		s.reconnecting = false;
		hideWarming(s);
		const statusEl = s.card.querySelector('[data-status]');
		if (statusEl) { statusEl.textContent = 'Paused'; statusEl.title = ''; }
		const dot = s.card.querySelector('[data-dot]');
		dot?.classList.add('idle');
		dot?.classList.remove('thin');
	}
}

function resumeStreams() {
	for (const s of _cards.values()) {
		if (!s.es) attachStream(s);
	}
	// IntersectionObserver doesn't re-fire on tab focus, so re-assert intent and
	// restart the handoff poll for cards that are still on screen.
	for (const id of _inView) {
		const s = _cards.get(id);
		if (!s) continue;
		signalWatch(id);
		if (!isLiveNow(s)) startStatusPolling(s);
	}
}

// ── boot ──────────────────────────────────────────────────────────────────────

await loadMore();
startFpsTicker();
startIdleRepaint();
startWatchPings();
startInfiniteScroll();

document.addEventListener('visibilitychange', () => {
	if (document.hidden) suspendStreams();
	else resumeStreams();
});
