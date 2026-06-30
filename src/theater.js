// Live Trading Theater — controller.
//
// Stages the platform's highest-reputation agents as real 3D avatars and makes
// trading a spectator sport: when a REAL on-chain event lands on the live feed,
// the matching avatar performs and a real receipt rises with an explorer link.
// Click any avatar for its read-only wallet/reputation HUD; watch, follow, or
// fork it from there. Three themed rooms re-cohort the stage around real filters.
//
// Every number here traces to a real endpoint:
//   roster   → GET /api/reputation/leaderboard  ·  GET /api/agents/public
//   bodies   → GET /api/agents/:id (avatar_model_url, mannequin fallback)
//   trust    → GET /api/agents/reputation-batch
//   balances → fetchWalletBalances() (live SOL/USDC/$THREE)
//   events   → GET /api/feed (snapshot) + GET /api/feed-stream (SSE)

import { createStage } from './theater-stage.js';
import { connectFeed, loadSnapshot } from './theater-feed.js';
import { fetchWalletBalances } from './shared/agent-wallet-identity.js';
import { log } from './shared/log.js';
import './ui-juice.css';
import { enterRow } from './ui-juice.js';

const THREE_MINT = 'FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump';
const WATCH_KEY = 'theater:watch:v1';

// Stage budget — keep the cast lively but 60fps. Tighter on small screens.
const isMobile = () => window.matchMedia('(max-width: 768px)').matches;
const rosterBudget = () => (isMobile() ? 6 : 14);

const ROOMS = [
	{ id: 'top', label: 'Top performers', hint: 'Ranked by the non-gameable wallet-trust score', centerpiece: false, featured: new Set(['buy', 'launch', 'verify', 'pay', 'win']) },
	{ id: 'launches', label: 'New launches', hint: 'Freshest agents going on-chain right now', centerpiece: true, featured: new Set(['launch', 'verify', 'buy']) },
	{ id: 'three', label: '$THREE stage', hint: 'The one coin — buys of $THREE take center stage', centerpiece: true, featured: new Set(['buy', 'pay']) },
];

// ── tiny DOM helper ──────────────────────────────────────────────────────────
function el(tag, attrs = {}, kids = []) {
	const n = document.createElement(tag);
	for (const [k, v] of Object.entries(attrs)) {
		if (v == null || v === false) continue;
		if (k === 'class') n.className = v;
		else if (k === 'html') n.innerHTML = v;
		else if (k === 'text') n.textContent = v;
		else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2).toLowerCase(), v);
		else if (k === 'dataset') Object.assign(n.dataset, v);
		else n.setAttribute(k, v);
	}
	for (const c of [].concat(kids)) { if (c != null) n.append(c.nodeType ? c : document.createTextNode(c)); }
	return n;
}
const fmtScore = (s) => (Number.isFinite(s) ? Math.round(s) : '—');
const fmtUsd = (v) => (Number.isFinite(v) ? `$${v >= 1000 ? Math.round(v).toLocaleString() : v.toFixed(2)}` : '—');
const timeAgo = (ts) => {
	const s = Math.max(0, (Date.now() - ts) / 1000);
	if (s < 60) return `${Math.floor(s)}s`;
	if (s < 3600) return `${Math.floor(s / 60)}m`;
	if (s < 86400) return `${Math.floor(s / 3600)}h`;
	return `${Math.floor(s / 86400)}d`;
};

// ── auth probe (real, cached) ─────────────────────────────────────────────────
let _me;
async function whoami() {
	if (_me !== undefined) return _me;
	try {
		const r = await fetch('/api/auth/me', { credentials: 'include' });
		_me = r.ok ? await r.json().catch(() => null) : null;
	} catch { _me = null; }
	return _me;
}

// ── data layer ────────────────────────────────────────────────────────────────
async function fetchLeaderboard(limit) {
	const r = await fetch(`/api/reputation/leaderboard?limit=${limit}`, { headers: { accept: 'application/json' } });
	if (!r.ok) throw new Error(`leaderboard ${r.status}`);
	const body = await r.json();
	return (body.agents || []).map((a) => ({
		id: a.id, name: a.name || 'Agent', solana_address: a.solana_address || null,
		score: a.score, tier: a.tier, tierLabel: a.tier_label, totals: a.totals || {},
		avatar_thumbnail: a.avatar_thumbnail_url || null,
	}));
}
async function fetchNewLaunches(limit) {
	const r = await fetch(`/api/agents/public?sort=newest&limit=${limit}`, { headers: { accept: 'application/json' } });
	if (!r.ok) throw new Error(`public ${r.status}`);
	const body = await r.json();
	return (body.agents || []).map((a) => ({
		id: a.id, name: a.name || 'Agent', solana_address: null,
		score: null, tier: null, tierLabel: null, totals: {},
		avatar_thumbnail: a.avatar_thumbnail || null,
	}));
}

// Resolve a staged agent's real 3D body + ownership from the public agent GET.
// Falls back cleanly (mannequin via agentAvatarGlb) if the detail is unavailable.
async function resolveBody(agent) {
	try {
		const r = await fetch(`/api/agents/${encodeURIComponent(agent.id)}`, { credentials: 'include', headers: { accept: 'application/json' } });
		if (r.ok) {
			const d = await r.json().catch(() => null);
			const a = d?.agent || d || {};
			agent.avatar_model_url = a.avatar_model_url || a.avatar_glb_url || a.glb_url || null;
			agent.is_owner = !!a.is_owner;
			if (!agent.solana_address) agent.solana_address = a.solana_address || null;
		}
	} catch { /* mannequin fallback handles it */ }
	return agent;
}

async function fetchReputationBatch(ids) {
	if (!ids.length) return {};
	try {
		const r = await fetch(`/api/agents/reputation-batch?ids=${ids.map(encodeURIComponent).join(',')}`, { headers: { accept: 'application/json' } });
		if (!r.ok) return {};
		const body = await r.json();
		return body.data || {};
	} catch { return {}; }
}

// pooled map with bounded concurrency
async function pool(items, n, fn) {
	const out = new Array(items.length);
	let i = 0;
	const workers = Array.from({ length: Math.min(n, items.length || 1) }, async () => {
		while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx], idx); }
	});
	await Promise.all(workers);
	return out;
}

// ── main ──────────────────────────────────────────────────────────────────────
export function initTheater(root) {
	const refs = {
		canvas: root.querySelector('#th-canvas'),
		overlay: root.querySelector('#th-overlay'),
		stageWrap: root.querySelector('#th-stage'),
		rooms: root.querySelector('#th-rooms'),
		status: root.querySelector('#th-status'),
		ticker: root.querySelector('#th-ticker'),
		replay: root.querySelector('#th-replay'),
		panel: root.querySelector('#th-panel'),
		quiet: root.querySelector('#th-quiet'),
		loading: root.querySelector('#th-loading'),
		error: root.querySelector('#th-error'),
		hint: root.querySelector('#th-room-hint'),
	};

	const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	const stage = createStage({
		canvas: refs.canvas,
		overlay: refs.overlay,
		reducedMotion: reduced,
		onSelect: (id) => openPanel(id),
	});

	const ro = new ResizeObserver(() => stage.resize());
	ro.observe(refs.stageWrap);
	window.addEventListener('resize', () => stage.resize());

	const state = {
		room: ROOMS[0],
		roster: [],
		byId: new Map(),
		reputation: {},
		balances: {},
		watch: new Set(loadWatch()),
		sessionEvents: [], // featured events captured this session (for replay)
		liveCount: 0,
		selected: null,
	};

	// ── rooms ──────────────────────────────────────────────────────────────────
	renderRooms();
	function renderRooms() {
		refs.rooms.replaceChildren(
			...ROOMS.map((rm) =>
				el('button', {
					class: `th-room${rm.id === state.room.id ? ' is-active' : ''}`,
					role: 'tab',
					'aria-selected': rm.id === state.room.id ? 'true' : 'false',
					onClick: () => switchRoom(rm),
				}, rm.label),
			),
		);
		refs.hint.textContent = state.room.hint;
	}

	async function switchRoom(rm) {
		if (rm.id === state.room.id) return;
		state.room = rm;
		renderRooms();
		await loadRoom();
	}

	// ── status pill ─────────────────────────────────────────────────────────────
	function setStatus(s) {
		const map = {
			connecting: ['Connecting', 'th-dot-amber'],
			live: ['Live', 'th-dot-green'],
			reconnecting: ['Reconnecting…', 'th-dot-amber'],
			offline: ['Offline', 'th-dot-red'],
		};
		const [label, dot] = map[s] || map.offline;
		refs.status.className = `th-status ${dot}`;
		refs.status.querySelector('.th-status-label').textContent = label;
	}

	// ── roster load ──────────────────────────────────────────────────────────────
	async function loadRoom() {
		showState('loading');
		try {
			const limit = rosterBudget();
			const rows = state.room.id === 'launches' ? await fetchNewLaunches(limit) : await fetchLeaderboard(limit);

			await pool(rows, 5, resolveBody);
			state.roster = rows;
			state.byId = new Map(rows.map((a) => [a.id, a]));
			await stage.setRoster(rows);

			// $THREE room: drop the coin centerpiece immediately as the room's anchor.
			if (state.room.id === 'three') stage.spawnCenterpiece({ tint: 0x8b5cf6 });

			// Enrich with batch reputation (fills New-launches scores; refreshes others).
			fetchReputationBatch(rows.map((a) => a.id)).then((rep) => { state.reputation = rep; if (state.selected) renderPanel(state.selected); });

			// Re-apply any watched highlight that belongs to this room.
			for (const id of state.watch) if (state.byId.has(id)) stage.highlight(id);

			showState('stage');
			maybeShowQuiet();
		} catch (err) {
			log.warn('[theater] room load failed', err?.message);
			showState('error');
		}
	}

	// loading & error are mutually-exclusive center cards over the live canvas.
	// The quiet-market card is independent: it rides at the foot of the stage and
	// only shows while no live event has arrived (the cast still stands on stage).
	function showState(which) {
		refs.loading.hidden = which !== 'loading';
		refs.error.hidden = which !== 'error';
		if (which !== 'stage') refs.quiet.hidden = true;
	}
	function maybeShowQuiet() {
		refs.quiet.hidden = !(state.liveCount === 0 && refs.loading.hidden && refs.error.hidden);
	}

	refs.error.querySelector('[data-retry]')?.addEventListener('click', loadRoom);

	// ── live feed routing ────────────────────────────────────────────────────────
	const feed = connectFeed({
		onStatus: setStatus,
		onEvent: (n) => routeEvent(n),
	});

	function routeEvent(n) {
		pushTicker(n);
		const featured = state.room.featured.has(n.kind);
		// $THREE room only celebrates $THREE buys; other rooms celebrate any buy.
		const threeOnly = state.room.id === 'three';
		const isThree = n.mint && n.mint === THREE_MINT;
		if (!featured) return;
		if (threeOnly && n.kind === 'buy' && !isThree) return;

		if ((n.kind === 'buy' || n.kind === 'launch') && (state.room.centerpiece || isThree)) {
			stage.spawnCenterpiece({ tint: isThree ? 0x8b5cf6 : 0x4ade80 });
		}

		// Attribute to a staged performer when the event names one; otherwise the
		// receipt rises center-stage (still a real event, just no avatar to own it).
		const performerId = n.agentId && stage.hasPerformer(n.agentId) ? n.agentId : matchByActor(n.actor);
		stage.perform(performerId, { kind: n.kind, receipt: buildReceipt(n) });

		// Capture featured events for replay.
		state.sessionEvents.unshift({ ...n, performerId });
		if (state.sessionEvents.length > 24) state.sessionEvents.pop();
		renderReplay();
	}

	function matchByActor(actor) {
		if (!actor) return null;
		const a = actor.toLowerCase();
		for (const ag of state.roster) if (ag.name && ag.name.toLowerCase() === a && stage.hasPerformer(ag.id)) return ag.id;
		return null;
	}

	function buildReceipt(n) {
		const tone = n.kind === 'loss' ? 'th-rec-loss' : n.kind === 'buy' || n.kind === 'win' ? 'th-rec-win' : 'th-rec-neutral';
		const node = el('div', { class: `th-receipt ${tone}` }, [
			el('span', { class: 'th-rec-title', text: n.title }),
			n.sub ? el('span', { class: 'th-rec-sub', text: n.sub }) : null,
			n.href ? el('a', { class: 'th-rec-link', href: n.href, target: '_blank', rel: 'noopener', text: 'View ↗' }) : null,
		]);
		return node;
	}

	// ── ticker ───────────────────────────────────────────────────────────────────
	function pushTicker(n) {
		state.liveCount++;
		const row = el('li', { class: `th-tick th-tick-${n.kind}` }, [
			el('span', { class: 'th-tick-dot' }),
			el('div', { class: 'th-tick-body' }, [
				el('span', { class: 'th-tick-title', text: n.title }),
				n.sub ? el('span', { class: 'th-tick-sub', text: n.sub }) : null,
			]),
			n.href ? el('a', { class: 'th-tick-link', href: n.href, target: '_blank', rel: 'noopener', 'aria-label': 'Open in explorer', text: '↗' }) : null,
			el('time', { class: 'th-tick-time', text: timeAgo(n.ts), datetime: new Date(n.ts).toISOString() }),
		]);
		refs.ticker.prepend(row);
		enterRow(row); // slide the freshly-landed live event in (reduced-motion safe)
		while (refs.ticker.children.length > 40) refs.ticker.lastElementChild.remove();
		// a real event arrived → dismiss the quiet state
		if (!refs.quiet.hidden) refs.quiet.hidden = true;
	}

	// ── replay ────────────────────────────────────────────────────────────────────
	function renderReplay() {
		const evts = state.sessionEvents;
		refs.replay.querySelector('[data-empty]')?.toggleAttribute('hidden', evts.length > 0);
		const rail = refs.replay.querySelector('[data-rail]');
		rail.replaceChildren(
			...evts.map((e) =>
				el('button', {
					class: `th-replay-mark th-tick-${e.kind}`,
					title: `${e.title}${e.sub ? ' · ' + e.sub : ''} · ${timeAgo(e.ts)} ago`,
					'aria-label': `Replay ${e.title}`,
					onClick: () => {
						stage.perform(e.performerId, { kind: e.kind, receipt: buildReceipt(e) });
						if (e.performerId) stage.highlight(e.performerId);
					},
				}),
			),
		);
	}
	refs.replay.querySelector('[data-play-all]')?.addEventListener('click', async () => {
		const evts = [...state.sessionEvents].reverse();
		for (const e of evts) {
			stage.perform(e.performerId, { kind: e.kind, receipt: buildReceipt(e) });
			await new Promise((r) => setTimeout(r, 700));
		}
	});

	// ── read-only HUD panel ────────────────────────────────────────────────────────
	async function openPanel(id) {
		const agent = state.byId.get(id);
		if (!agent) return;
		state.selected = id;
		renderPanel(id);
		refs.panel.classList.add('is-open');
		// live balance (real)
		if (!state.balances[id]) {
			fetchWalletBalances([id], { network: 'mainnet' }).then((b) => { state.balances = { ...state.balances, ...b }; if (state.selected === id) renderPanel(id); }).catch(() => {});
		}
	}
	function closePanel() { refs.panel.classList.remove('is-open'); state.selected = null; }

	async function renderPanel(id) {
		const agent = state.byId.get(id);
		if (!agent) return;
		const rep = state.reputation[id] || (agent.score != null ? { score: agent.score, tier: agent.tier, tierLabel: agent.tierLabel, totals: agent.totals } : null);
		const bal = state.balances[id];
		const me = await whoami();
		const isOwner = !!agent.is_owner;
		const signedIn = !!me;
		const watching = state.watch.has(id);
		const totals = rep?.totals || {};

		// value may be a string or a node (e.g. the loading skeleton)
		const stat = (label, value) => el('div', { class: 'th-stat' }, [
			el('span', { class: 'th-stat-v' }, [value]),
			el('span', { class: 'th-stat-l', text: label }),
		]);

		refs.panel.replaceChildren(
			el('button', { class: 'th-panel-close', 'aria-label': 'Close', onClick: closePanel, text: '✕' }),
			el('div', { class: 'th-panel-head' }, [
				agent.avatar_thumbnail
					? el('img', { class: 'th-panel-av', src: agent.avatar_thumbnail, alt: '', loading: 'lazy' })
					: el('div', { class: 'th-panel-av th-panel-av-fallback', text: (agent.name || '?').slice(0, 1).toUpperCase() }),
				el('div', {}, [
					el('h2', { class: 'th-panel-name', text: agent.name }),
					rep ? el('span', { class: 'th-panel-tier', text: `${rep.tierLabel || rep.tier || 'Agent'} · trust ${fmtScore(rep.score)}` }) : el('span', { class: 'th-panel-tier th-muted', text: 'New — no track record yet' }),
				]),
			]),
			el('div', { class: 'th-stats' }, [
				stat('Trust', rep ? fmtScore(rep.score) : '—'),
				stat('Wallet', bal ? fmtUsd(bal.usd) : el('span', { class: 'th-skel-inline' })),
				stat('Tips', totals.tip_count != null ? String(totals.tip_count) : '0'),
				stat('Launches', totals.deployed_mints != null ? String(totals.deployed_mints) : '0'),
			]),
			agent.solana_address
				? el('a', { class: 'th-addr', href: `https://solscan.io/account/${agent.solana_address}`, target: '_blank', rel: 'noopener', title: agent.solana_address }, [
					el('span', { text: `${agent.solana_address.slice(0, 4)}…${agent.solana_address.slice(-4)}` }),
					el('span', { class: 'th-addr-ext', text: '↗' }),
				])
				: null,
			el('div', { class: 'th-panel-actions' }, [
				el('button', {
					class: `th-btn ${watching ? 'th-btn-on' : ''}`,
					onClick: () => toggleWatch(id),
					text: watching ? '★ Watching' : '☆ Watch',
				}),
				el('a', { class: 'th-btn', href: `/agent/${id}/wallet#reputation`, text: 'Wallet & positions' }),
				el('a', { class: 'th-btn th-btn-primary', href: `/agent/${id}`, text: isOwner ? 'Manage agent' : 'Open profile' }),
			]),
			isOwner
				? el('p', { class: 'th-panel-foot th-muted', text: 'This agent is yours — act from its profile.' })
				: signedIn
					? el('p', { class: 'th-panel-foot th-muted' }, [
						'Fork to own a copy with its own wallet, or follow its alpha from ',
						el('a', { href: `/agent/${id}`, text: 'its profile' }),
						'.',
					])
					: el('p', { class: 'th-panel-foot th-muted' }, [
						el('a', { href: `/login?next=${encodeURIComponent(`/agent/${id}`)}`, text: 'Sign in' }),
						' to fork this agent to your own wallet or follow its alpha. Watching is always free.',
					]),
			recentForAgent(id),
		);
	}

	function recentForAgent(id) {
		const mine = state.sessionEvents.filter((e) => e.performerId === id).slice(0, 5);
		if (!mine.length) return el('p', { class: 'th-panel-foot th-muted', text: 'No live moves captured yet this session.' });
		return el('div', { class: 'th-panel-recent' }, [
			el('h3', { class: 'th-panel-recent-h', text: 'Live moves this session' }),
			el('ul', {}, mine.map((e) => el('li', { class: `th-tick-${e.kind}` }, [
				el('span', { class: 'th-tick-dot' }),
				el('span', { text: `${e.title}${e.sub ? ' · ' + e.sub : ''}` }),
				el('time', { class: 'th-tick-time', text: timeAgo(e.ts) }),
			]))),
		]);
	}

	function toggleWatch(id) {
		if (state.watch.has(id)) {
			state.watch.delete(id);
			// re-focus another watched agent in this room, if any
			const next = [...state.watch].find((w) => state.byId.has(w));
			stage.highlight(next || null);
		} else {
			state.watch.add(id);
			stage.highlight(id);
		}
		saveWatch([...state.watch]);
		if (state.selected === id) renderPanel(id);
	}

	// ── quiet-market highlights (real recent activity) ───────────────────────────
	loadSnapshot(40).then((events) => {
		const featured = events.filter((e) => ROOMS.some((r) => r.featured.has(e.kind)) && (e.href || e.sub));
		const host = refs.quiet.querySelector('[data-highlights]');
		if (!host) return;
		if (!featured.length) {
			host.append(el('p', { class: 'th-muted', text: 'No recent activity to replay. The stage goes live the moment an agent moves.' }));
			return;
		}
		host.replaceChildren(
			...featured.slice(0, 8).map((e) =>
				el('a', { class: `th-hl th-tick-${e.kind}`, href: e.href || '#', target: e.href ? '_blank' : null, rel: 'noopener' }, [
					el('span', { class: 'th-tick-dot' }),
					el('span', { class: 'th-hl-title', text: e.title }),
					e.sub ? el('span', { class: 'th-hl-sub', text: e.sub }) : null,
					el('time', { class: 'th-tick-time', text: timeAgo(e.ts) }),
				]),
			),
		);
		maybeShowQuiet();
	});

	// keep ticker timestamps fresh
	const tickTimer = setInterval(() => {
		refs.ticker.querySelectorAll('time.th-tick-time').forEach((t) => {
			const dt = Date.parse(t.getAttribute('datetime'));
			if (Number.isFinite(dt)) t.textContent = timeAgo(dt);
		});
	}, 15000);

	// reduced-motion live toggle (system pref change)
	window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener?.('change', (e) => stage.setReducedMotion(e.matches));

	// keyboard: Esc closes panel
	window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePanel(); });

	renderReplay();
	loadRoom();

	// teardown for SPA navigations / HMR
	window.addEventListener('beforeunload', () => { feed.close(); stage.dispose(); clearInterval(tickTimer); ro.disconnect(); });
}

function loadWatch() { try { return JSON.parse(localStorage.getItem(WATCH_KEY) || '[]'); } catch { return []; } }
function saveWatch(arr) { try { localStorage.setItem(WATCH_KEY, JSON.stringify(arr.slice(0, 50))); } catch {} }

// auto-boot when the page mounts us directly
const _root = document.getElementById('th-root');
if (_root) initTheater(_root);
