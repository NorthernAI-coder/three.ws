// /agents-live — mission control page.
//
// Fetches all agents with active screen streams from /api/agent-screen-active,
// then for each spins up a mini SSE listener that paints frames onto the card's
// canvas in real time (same technique as agent-desk.js in the 3D world).
// Auto-refreshes the roster every 30 seconds to pick up newly-live agents.

const grid       = document.getElementById('al-grid');
const liveCount  = document.getElementById('al-live-count');
const statsBar   = document.getElementById('al-stats');
const statLive   = document.getElementById('al-stat-live');
const statFps    = document.getElementById('al-stat-fps');

// Track active card streams for cleanup on roster refresh.
const _streams = new Map(); // agentId → EventSource
const _fpsMap  = new Map(); // agentId → frames since last tick
let   _totalFrames = 0;
let   _fpsInterval = null;

async function fetchRoster() {
	try {
		const res = await fetch('/api/agent-screen-active', { credentials: 'include' });
		if (!res.ok) return [];
		const data = await res.json();
		return data.desks || data.agents || [];
	} catch {
		return [];
	}
}

function renderSkeletons(n = 3) {
	return Array.from({ length: n }, () => `
<div class="al-skeleton">
	<div class="al-skeleton-screen"></div>
	<div class="al-skeleton-info">
		<div class="al-skeleton-avatar"></div>
		<div class="al-skeleton-lines">
			<div class="al-skeleton-line"></div>
			<div class="al-skeleton-line"></div>
		</div>
	</div>
</div>`).join('');
}

function renderEmpty() {
	return `
<div class="al-empty">
	<div class="al-empty-icon">🖥</div>
	<h2>No agents live right now</h2>
	<p>When an agent starts streaming its screen, it appears here in real time. Launch a session from any agent's profile page.</p>
	<a href="/agents" class="al-empty-cta">Browse agents →</a>
</div>`;
}

function esc(s) {
	return String(s ?? '').replace(/[&<>"']/g, (c) => ({
		'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
	}[c]));
}

function buildCard(agent) {
	const id      = agent.agentId || agent.id;
	const name    = agent.agentName || agent.name || 'Agent';
	const avatar  = agent.avatarUrl || agent.avatar_url || '';
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
  </div>
  <a class="al-card-watch-btn" href="${esc(watchHref)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">Watch</a>
</div>`;

	return el;
}

function attachStream(card, agentId) {
	// Tear down any existing stream for this agent.
	const old = _streams.get(agentId);
	if (old) { try { old.close(); } catch { /* */ } }

	const canvas   = card.querySelector('canvas');
	const ctx      = canvas.getContext('2d');
	const dot      = card.querySelector('[data-dot]');
	const statusEl = card.querySelector('[data-status]');
	const actionEl = card.querySelector('[data-action]');

	let frameTimeoutId = null;

	function setLive(live) {
		dot.classList.toggle('idle', !live);
		statusEl.textContent = live ? 'Live' : 'Idle';
	}

	function bumpTimeout() {
		clearTimeout(frameTimeoutId);
		frameTimeoutId = setTimeout(() => setLive(false), 5000);
	}

	const es = new EventSource(`/api/agent-screen-stream?agentId=${encodeURIComponent(agentId)}`);
	_streams.set(agentId, es);

	es.addEventListener('frame', (e) => {
		try {
			const msg = JSON.parse(e.data);
			const src = msg.frame || msg.data;
			if (!src) return;
			const img = new Image();
			img.onload = () => ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
			img.src = src.startsWith('data:') ? src : 'data:image/png;base64,' + src;
			setLive(true);
			bumpTimeout();
			_totalFrames++;
			_fpsMap.set(agentId, (_fpsMap.get(agentId) || 0) + 1);
			if (msg.activity) actionEl.textContent = msg.activity;
		} catch { /* malformed */ }
	});

	es.addEventListener('log', (e) => {
		try {
			const { entries } = JSON.parse(e.data);
			if (entries?.length) actionEl.textContent = entries[0]?.activity || '';
		} catch { /* */ }
	});

	es.addEventListener('dark', () => setLive(false));
	es.addEventListener('ping', () => {
		if (statusEl.textContent === 'Connecting') { statusEl.textContent = 'Idle'; }
	});
	es.onerror = () => setLive(false);
}

function paintActivityFallback(canvas, agentName, status) {
	const ctx = canvas.getContext('2d');
	const W = canvas.width, H = canvas.height;
	ctx.fillStyle = '#08090e';
	ctx.fillRect(0, 0, W, H);

	// Dot
	ctx.beginPath();
	ctx.arc(20, H / 2, 4, 0, Math.PI * 2);
	ctx.fillStyle = status === 'live' ? '#5fd08a' : 'rgba(255,255,255,0.15)';
	ctx.fill();

	ctx.font = '600 13px Inter, system-ui, sans-serif';
	ctx.fillStyle = 'rgba(255,255,255,0.5)';
	ctx.textAlign = 'left';
	ctx.textBaseline = 'middle';
	ctx.fillText((agentName || 'Agent') + ' — awaiting stream', 32, H / 2);
}

async function refresh() {
	const agents = await fetchRoster();

	liveCount.textContent = agents.length;
	statLive.textContent  = agents.length;
	if (statsBar) statsBar.hidden = agents.length === 0;

	// Build a set of current agent IDs to prune stale streams.
	const currentIds = new Set(agents.map((a) => a.agentId || a.id));

	// Remove cards for agents no longer streaming.
	for (const [id, es] of _streams) {
		if (!currentIds.has(id)) {
			try { es.close(); } catch { /* */ }
			_streams.delete(id);
			const old = grid.querySelector(`[data-agent-id="${CSS.escape(id)}"]`);
			if (old) old.remove();
		}
	}

	if (!agents.length) {
		// Preserve existing cards (might still have streams), only show empty if none at all.
		if (!_streams.size) {
			grid.innerHTML = renderEmpty();
		}
		return;
	}

	// Add new cards.
	for (const agent of agents) {
		const id = agent.agentId || agent.id;
		if (!grid.querySelector(`[data-agent-id="${CSS.escape(id)}"]`)) {
			const card = buildCard(agent);
			// Remove skeleton loaders once we have real cards.
			grid.querySelectorAll('.al-skeleton').forEach((s) => s.remove());
			grid.querySelector('.al-empty')?.remove();
			grid.appendChild(card);
			attachStream(card, id);
		}
	}
}

// FPS ticker — measures aggregate frames/s across all cards.
function startFpsTicker() {
	_fpsInterval = setInterval(() => {
		let total = 0;
		for (const c of _fpsMap.values()) total += c;
		_fpsMap.clear();
		statFps.textContent = total > 0 ? `${total}/s` : '—';
	}, 1000);
}

// ── boot ──────────────────────────────────────────────────────────────────────

await refresh();
startFpsTicker();
setInterval(refresh, 30_000);
