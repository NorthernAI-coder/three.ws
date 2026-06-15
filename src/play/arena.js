// arena.js — orchestrates the live 3D Sniper Arena.
//
// Pulls the real leaderboard + SSE trade stream, places each agent as an
// animated avatar in the 3D world (src/play/arena-world.js), turns every live
// buy/sell into an emote + particle burst + a tape entry, lets the spectator
// pick their own avatar and walk the floor, and keeps floating DOM labels
// pinned over each agent's head. All data is real — no placeholders.

import { ArenaWorld } from './arena-world.js';

const NETWORK = new URLSearchParams(location.search).get('network') || 'mainnet';

// Humanoid GLBs the canonical clip library animates cleanly. Agents are assigned
// one deterministically by id (template-cached, so repeats are free). The
// spectator picks their own (local roster + public gallery).
const ROSTER = [
	{ url: '/avatars/default.glb',      name: 'Default' },
	{ url: '/avatars/michelle.glb',     name: 'Michelle' },
	{ url: '/avatars/xbot.glb',         name: 'X-Bot' },
	{ url: '/avatars/readyplayerme.glb', name: 'RPM' },
	{ url: '/avatars/cz.glb',           name: 'CZ' },
];
const MAX_AGENTS = 9;
const PLAYER_KEY = 'arena:avatar:v1';

const $ = (id) => document.getElementById(id);
const fmtSol = (n) => (n == null ? '—' : `${n >= 0 ? '+' : ''}${Number(n).toFixed(3)}◎`);
const fmtPct = (n) => (n == null ? '' : `${n >= 0 ? '+' : ''}${Number(n).toFixed(1)}%`);
const esc = (s) => String(s ?? '').replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
const hash = (s) => { let h = 0; for (let i = 0; i < String(s).length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); };
const isBig = (p) => (p?.pnl_sol ?? 0) >= 0.4 || (p?.pnl_pct ?? 0) >= 100;

let world = null;
let labelLayer = null;
const labelEls = new Map(); // agentId -> { el, pos }

// ── boot ──────────────────────────────────────────────────────────────────────

(async function boot() {
	const canvas = $('scene');
	labelLayer = $('labels');
	world = new ArenaWorld(canvas, { onAgentClick: focusAgent });
	window.__arenaWorld = world; // debug/support hook

	// Spin up the render loop immediately so the floor + lights are alive while
	// avatars stream in (perceived performance).
	setLoading('Building the arena…');
	world.start();

	try {
		await world.loadAnimations();
	} catch (e) {
		console.warn('[arena] animations failed', e);
	}

	// Spectator avatar: restore saved pick, else a sensible default.
	const saved = localStorage.getItem(PLAYER_KEY);
	try { await world.spawnPlayer(saved || '/avatars/default.glb'); } catch (e) { console.warn('[arena] player spawn', e); }

	world.setLabelUpdater(updateLabels);
	mountControls();
	mountJoystick();

	await loadAndPlace();
	connectStream();
	setLoading(null);

	// Periodic board refresh (realized P&L only changes on a close; SSE also nudges this).
	setInterval(loadBoardOnly, 30_000);
})();

// ── data: leaderboard → agents in the world ────────────────────────────────────

let _placed = false;
async function loadAndPlace() {
	let data;
	try {
		const r = await fetch(`/api/sniper/leaderboard?network=${NETWORK}`);
		if (!r.ok) throw new Error('http ' + r.status);
		data = await r.json();
	} catch (e) {
		renderBoard([]);
		setEmpty(true);
		return;
	}
	const board = (data.leaderboard || []).slice(0, MAX_AGENTS);
	renderBoard(data.leaderboard || []);
	renderTopCard((data.leaderboard || [])[0]);
	setEmpty(board.length === 0);

	if (!_placed && board.length) {
		_placed = true;
		const positions = arenaPositions(board.length);
		// Spawn sequentially-ish but don't block the loop; stagger for a nice fill.
		board.forEach((row, i) => {
			const av = ROSTER[hash(row.agent_id) % ROSTER.length];
			const pos = positions[i];
			setTimeout(() => {
				world.spawnAgent({
					id: row.agent_id,
					name: row.agent_name || 'Agent',
					glbUrl: av.url,
					position: [pos.x, pos.z],
					facingY: pos.facing,
					leader: i === 0,
					pnlText: fmtSol(row.realized_pnl_sol),
					pnlUp: (row.realized_pnl_sol ?? 0) >= 0,
					thumbnail: row.image || '',
					rank: row.rank,
				}).then((agent) => createLabel(agent)).catch((err) => console.warn('[arena] spawn agent', err));
			}, i * 120);
		});
	}

	// Seed the tape with recent closed trades (oldest first so prepend keeps order).
	(data.trades || []).slice(0, 12).reverse().forEach((t) => pushTape('sell', t, { quiet: true }));
}

async function loadBoardOnly() {
	try {
		const r = await fetch(`/api/sniper/leaderboard?network=${NETWORK}`);
		if (!r.ok) return;
		const d = await r.json();
		renderBoard(d.leaderboard || []);
		renderTopCard((d.leaderboard || [])[0]);
		// Update floating labels' live P&L.
		(d.leaderboard || []).forEach((row) => {
			const L = labelEls.get(row.agent_id);
			if (L) {
				const up = (row.realized_pnl_sol ?? 0) >= 0;
				L.el.querySelector('.lbl-pnl').textContent = fmtSol(row.realized_pnl_sol);
				L.el.querySelector('.lbl-pnl').className = 'lbl-pnl ' + (up ? 'up' : 'down');
			}
		});
	} catch { /* keep last good */ }
}

// Arrange agents on a forward-facing arc; #1 elevated at the back-centre.
function arenaPositions(n) {
	const out = [];
	// Leader, elevated at the back-centre.
	out.push({ x: 0, z: -5.4, facing: 0 });
	const rest = n - 1;
	for (let i = 0; i < rest; i++) {
		const t = rest === 1 ? 0.5 : i / (rest - 1);   // 0..1
		const ang = (t - 0.5) * (Math.PI * 0.92);        // spread ~ -83°..83°
		const rad = 5.6;
		const x = Math.sin(ang) * rad;
		const z = -1.4 - Math.cos(ang) * 3.0;            // gentle bow toward the back
		out.push({ x, z, facing: Math.atan2(x - 0, 9 - z) }); // face the entrance
	}
	return out;
}

// ── live stream ────────────────────────────────────────────────────────────────

let es = null;
function connectStream() {
	es = new EventSource(`/api/sniper/stream?network=${NETWORK}`);
	es.addEventListener('open', () => setLive(true));
	es.addEventListener('buy', (m) => safe(() => onBuy(JSON.parse(m.data))));
	es.addEventListener('sell', (m) => safe(() => onSell(JSON.parse(m.data))));
	es.addEventListener('update', () => {});
	es.onerror = () => { setLive(false); try { es.close(); } catch {} setTimeout(connectStream, 2500); };
}
const safe = (fn) => { try { fn(); } catch { /* one bad frame never breaks the stream */ } };

function onBuy(p) {
	world.reactBuy(p.agent_id, { amountText: fmtSol(p.entry_sol) });
	pushTape('buy', p);
	bumpAgentBusy(p.agent_id);
}

function onSell(p) {
	const win = (p.pnl_sol ?? 0) >= 0;
	const big = isBig(p);
	world.reactSell(p.agent_id, { win, big, pnlText: `${fmtSol(p.pnl_sol)}` });
	pushTape('sell', p);
	if (win && big) bigWinBanner(p);
	bumpAgentBusy(p.agent_id);
	// A close changes realized P&L — refresh the board shortly.
	clearTimeout(connectStream._t);
	connectStream._t = setTimeout(loadBoardOnly, 1600);
}

function bumpAgentBusy(id) {
	const L = labelEls.get(id);
	if (!L) return;
	L.el.classList.add('active');
	clearTimeout(L._t);
	L._t = setTimeout(() => L.el.classList.remove('active'), 2600);
}

// ── floating labels over agents ────────────────────────────────────────────────

function createLabel(agent) {
	if (!agent || labelEls.has(agent.id)) return;
	const el = document.createElement('button');
	el.className = 'agent-label no-orbit' + (agent.leader ? ' leader' : '');
	el.type = 'button';
	el.innerHTML = `
		<span class="lbl-rank">#${agent.label.rank ?? '?'}</span>
		${agent.label.thumbnail ? `<img class="lbl-av" src="${esc(agent.label.thumbnail)}" alt="" onerror="this.remove()"/>` : ''}
		<span class="lbl-meta">
			<span class="lbl-name">${esc(agent.label.name)}</span>
			<span class="lbl-pnl ${agent.label.pnlUp ? 'up' : 'down'}">${esc(agent.label.pnlText)}</span>
		</span>`;
	el.addEventListener('click', () => focusAgent(agent.id));
	labelLayer.appendChild(el);
	labelEls.set(agent.id, { el, pos: { x: 0, y: 0 } });
}

const _proj = { x: 0, y: 0, behind: false };
function updateLabels() {
	if (!labelEls.size) return;
	for (const [id, L] of labelEls) {
		const agent = world.agents.get(id);
		if (!agent) { L.el.style.display = 'none'; continue; }
		const p = world.projectHead(agent, _proj);
		if (!p) { L.el.style.opacity = '0'; L.el.style.pointerEvents = 'none'; continue; }
		L.el.style.opacity = '1';
		L.el.style.pointerEvents = 'auto';
		L.el.style.transform = `translate(-50%, -100%) translate(${p.x.toFixed(1)}px, ${(p.y - 6).toFixed(1)}px)`;
	}
}

function focusAgent(id) {
	const row = world.agents.get(id);
	if (!row) return;
	world._ringPulse?.(row.root.position, row.color);
	row.emote('buy');
	// Promote into the top card for a beat.
	const L = labelEls.get(id);
	if (L) { L.el.classList.add('active'); setTimeout(() => L.el.classList.remove('active'), 2200); }
}

// ── HUD: leaderboard, top card, tape, banner ────────────────────────────────────

function renderBoard(rows) {
	const body = $('board');
	if (!rows.length) { body.innerHTML = ''; return; }
	body.innerHTML = rows.slice(0, 12).map((r) => {
		const wr = r.closed ? Math.round((r.wins / r.closed) * 100) : 0;
		const up = (r.realized_pnl_sol ?? 0) >= 0;
		return `<button class="row no-orbit" data-id="${esc(r.agent_id)}">
			<span class="r-rank">${r.rank}</span>
			<img class="r-av" src="${esc(r.image || '/avatars/thumbs/default.png')}" alt="" onerror="this.style.visibility='hidden'"/>
			<span class="r-name">${esc(r.agent_name || 'Agent')}<small>${r.open_positions} open · ${r.closed ? wr + '% win' : 'new'}</small></span>
			<span class="r-pnl ${up ? 'up' : 'down'}">${fmtSol(r.realized_pnl_sol)}</span>
		</button>`;
	}).join('');
	body.querySelectorAll('.row').forEach((b) => b.addEventListener('click', () => focusAgent(b.dataset.id)));
}

function renderTopCard(top) {
	if (!top) return;
	$('topName').textContent = top.agent_name || 'Agent';
	const pnl = $('topPnl');
	pnl.textContent = fmtSol(top.realized_pnl_sol);
	pnl.className = 'big ' + ((top.realized_pnl_sol ?? 0) >= 0 ? 'up' : 'down');
	$('topWins').textContent = top.wins ?? 0;
	$('topOpen').textContent = top.open_positions ?? 0;
	const wr = top.closed ? Math.round((top.wins / top.closed) * 100) : 0;
	$('topWr').textContent = top.closed ? wr + '%' : '—';
	const img = $('topAv');
	if (top.image) { img.src = top.image; img.style.display = ''; } else img.style.display = 'none';
}

function pushTape(kind, p, { quiet = false } = {}) {
	const tape = $('tape');
	$('tapeEmpty')?.remove();
	const isSell = kind === 'sell';
	const win = isSell && (p.pnl_sol ?? 0) >= 0;
	const sideCls = !isSell ? 'buy' : win ? 'win' : 'loss';
	const sideTxt = !isSell ? 'BUY' : win ? 'SELL ▲' : 'SELL ▼';
	const proof = isSell ? p.sell_url : p.buy_url;
	const pnl = isSell ? `<span class="t-pnl ${win ? 'up' : 'down'}">${fmtSol(p.pnl_sol)} ${fmtPct(p.pnl_pct)}</span>` : '';
	const row = document.createElement('div');
	row.className = 'tape-ev' + (quiet ? '' : ' fresh');
	row.innerHTML = `
		<span class="t-side ${sideCls}">${sideTxt}</span>
		<span class="t-body">
			<span class="t-l1"><b>${esc(p.agent_name || 'Agent')}</b> <span class="t-sym">${esc(p.symbol || p.name || (p.mint || '').slice(0, 6))}</span></span>
			<span class="t-l2">${isSell ? esc(p.exit_reason || 'closed') : `entry ${fmtSol(p.entry_sol)}`} ${proof ? `· <a href="${esc(proof)}" target="_blank" rel="noopener" class="no-orbit">on-chain ↗</a>` : '· simulated'}</span>
		</span>
		${pnl}`;
	tape.prepend(row);
	while (tape.children.length > 40) tape.lastChild.remove();
}

let bannerTimer = null;
function bigWinBanner(p) {
	const b = $('banner');
	b.innerHTML = `🚀 <b>${esc(p.agent_name || 'Agent')}</b> just closed <b class="up">${fmtSol(p.pnl_sol)} ${fmtPct(p.pnl_pct)}</b> on <span>${esc(p.symbol || (p.mint || '').slice(0, 6))}</span>${p.sell_url ? ` · <a href="${esc(p.sell_url)}" target="_blank" rel="noopener" class="no-orbit">proof ↗</a>` : ''}`;
	b.classList.add('show');
	clearTimeout(bannerTimer);
	bannerTimer = setTimeout(() => b.classList.remove('show'), 6500);
}

// ── status / states ─────────────────────────────────────────────────────────────

function setLive(on) {
	const dot = $('liveDot');
	dot.classList.toggle('on', on);
	dot.querySelector('span').textContent = on ? 'live' : 'reconnecting…';
}
function setLoading(text) {
	const el = $('loading');
	if (!el) return;
	if (text) { el.textContent = text; el.style.display = ''; }
	else el.style.display = 'none';
}
function setEmpty(on) { const e = $('emptyState'); if (e) e.hidden = !on; }

// ── controls + avatar picker ────────────────────────────────────────────────────

function mountControls() {
	$('pickBtn')?.addEventListener('click', openPicker);
	$('pickClose')?.addEventListener('click', closePicker);
	$('pickBackdrop')?.addEventListener('click', closePicker);
	$('emptyPick')?.addEventListener('click', openPicker);
	// Collapse side panels on mobile.
	$('togglePanels')?.addEventListener('click', () => document.body.classList.toggle('panels-open'));
	window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePicker(); });
}

let pickerLoaded = false;
function openPicker() {
	$('picker').classList.add('open');
	if (!pickerLoaded) { pickerLoaded = true; renderPicker(); }
}
function closePicker() { $('picker').classList.remove('open'); }

async function renderPicker() {
	const grid = $('pickGrid');
	const saved = localStorage.getItem(PLAYER_KEY) || '/avatars/default.glb';
	const localThumbs = {
		'/avatars/default.glb': '/avatars/thumbs/default.png',
		'/avatars/cz.glb': '/avatars/thumbs/cz.png',
	};
	const local = ROSTER.map((r) => ({ name: r.name, url: r.url, thumb: localThumbs[r.url] || '', starter: true }));
	grid.innerHTML = local.map(tile(saved)).join('') + `<div class="pick-loading" id="pickLoading">Loading community avatars…</div>`;
	wireTiles(grid);

	try {
		const r = await fetch('/api/avatars/public?limit=24');
		const d = r.ok ? await r.json() : { avatars: [] };
		$('pickLoading')?.remove();
		const items = (d.avatars || []).filter((a) => a.model_url).map((a) => ({
			name: a.name || 'Avatar', url: a.model_url, thumb: a.thumbnail_url || '', starter: false,
		}));
		if (items.length) {
			grid.insertAdjacentHTML('beforeend', `<div class="pick-sep">Community gallery</div>` + items.map(tile(saved)).join(''));
			wireTiles(grid);
		}
	} catch {
		$('pickLoading')?.remove();
	}
}

function tile(saved) {
	return (a) => `
		<button class="pick-tile no-orbit ${a.url === saved ? 'selected' : ''}" data-url="${esc(a.url)}" title="${esc(a.name)}">
			<span class="pick-thumb">${a.thumb ? `<img src="${esc(a.thumb)}" alt="" loading="lazy" onerror="this.remove()"/>` : `<span class="pick-mono">${esc((a.name || '?').slice(0, 2).toUpperCase())}</span>`}</span>
			<span class="pick-name">${esc(a.name)}</span>
			${a.starter ? '<span class="pick-badge">starter</span>' : ''}
		</button>`;
}

function wireTiles(grid) {
	grid.querySelectorAll('.pick-tile').forEach((b) => {
		if (b._wired) return; b._wired = true;
		b.addEventListener('click', () => choose(b.dataset.url, b));
	});
}

async function choose(url, btn) {
	const grid = $('pickGrid');
	grid.querySelectorAll('.pick-tile').forEach((x) => x.classList.remove('selected'));
	btn.classList.add('selected');
	btn.classList.add('busy');
	try {
		await world.spawnPlayer(url);
		localStorage.setItem(PLAYER_KEY, url);
		closePicker();
	} catch (e) {
		btn.classList.add('failed');
		setTimeout(() => btn.classList.remove('failed'), 1500);
	} finally {
		btn.classList.remove('busy');
	}
}

// ── mobile joystick (nipplejs, lazy) ────────────────────────────────────────────

async function mountJoystick() {
	const isTouch = matchMedia('(pointer: coarse)').matches;
	if (!isTouch) return;
	try {
		const { default: nipplejs } = await import('nipplejs');
		const zone = $('joystick');
		zone.style.display = 'block';
		const stick = nipplejs.create({ zone, mode: 'static', position: { left: '60px', bottom: '70px' }, color: 'rgba(110,231,255,0.6)', size: 110 });
		stick.on('move', (_e, d) => {
			const f = (d.force || 0);
			const a = d.angle?.radian ?? 0;
			world.setJoystick(Math.cos(a) * Math.min(1, f), Math.sin(a) * Math.min(1, f));
		});
		stick.on('end', () => world.setJoystick(0, 0));
	} catch (e) { /* desktop / import failure — keyboard still works */ }
}
