/**
 * The Arena — Social Trading Arena front-end.
 *
 * A single-page surface with two views, hash-routed:
 *   #/            → tournament list (Live / Upcoming / Finished tabs + create)
 *   #/t/<uuid>    → live competition view (spotlight 3D avatar, animated ranking
 *                   board, trades ticker, join) → results (attestation + prize
 *                   distribution) once finished.
 *
 * Everything is real: it reads /api/tournaments[/...] and live-streams rank changes
 * over SSE. No mock data, no fake loading. Every state (loading, empty, error,
 * populated) is designed, and the whole thing is keyboard- and reduced-motion
 * friendly.
 */

const root = document.getElementById('arena');
const NETWORK = 'mainnet';

// ── tiny DOM + format helpers ─────────────────────────────────────────────
const h = (tag, attrs = {}, ...kids) => {
	const node = document.createElement(tag);
	for (const [k, v] of Object.entries(attrs)) {
		if (v == null || v === false) continue;
		if (k === 'class') node.className = v;
		else if (k === 'html') node.innerHTML = v;
		else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
		else if (k === 'dataset') Object.assign(node.dataset, v);
		else node.setAttribute(k, v === true ? '' : String(v));
	}
	for (const kid of kids.flat()) {
		if (kid == null || kid === false) continue;
		node.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
	}
	return node;
};
const esc = (s) => String(s ?? '');
const fmtSol = (n) => (n == null ? '—' : `${n > 0 ? '+' : ''}${Number(n).toFixed(n && Math.abs(n) < 1 ? 3 : 2)} ◎`);
const fmtPct = (n) => (n == null ? '—' : `${n > 0 ? '+' : ''}${Number(n).toFixed(1)}%`);
const fmtThree = (n) => {
	const v = Number(n || 0);
	if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
	if (v >= 1000) return `${(v / 1000).toFixed(1)}K`;
	return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
};
const initialsOf = (name) =>
	esc(name)
		.split(/\s+/)
		.slice(0, 2)
		.map((w) => w[0] || '')
		.join('')
		.toUpperCase() || '··';

async function fetchJSON(url, opts) {
	const res = await fetch(url, { credentials: 'include', ...opts });
	let body = null;
	try {
		body = await res.json();
	} catch {
		/* non-JSON */
	}
	if (!res.ok) {
		const err = new Error(body?.error_description || body?.error || `HTTP ${res.status}`);
		err.status = res.status;
		err.code = body?.error;
		throw err;
	}
	return body;
}

function toast(msg, isErr = false) {
	document.querySelectorAll('.arena-toast').forEach((t) => t.remove());
	const t = h('div', { class: `arena-toast${isErr ? ' err' : ''}`, role: 'status' }, msg);
	document.body.append(t);
	setTimeout(() => t.remove(), 4200);
}

// ── countdown ──────────────────────────────────────────────────────────────
function relTime(iso, now = Date.now()) {
	const d = new Date(iso).getTime() - now;
	const abs = Math.abs(d);
	const m = Math.floor(abs / 60000);
	const hrs = Math.floor(m / 60);
	const days = Math.floor(hrs / 24);
	let label;
	if (days >= 1) label = `${days}d ${hrs % 24}h`;
	else if (hrs >= 1) label = `${hrs}h ${m % 60}m`;
	else label = `${m}m ${Math.floor((abs % 60000) / 1000)}s`;
	return { label, future: d > 0 };
}

let countdownTimer = null;
function startCountdowns() {
	stopCountdowns();
	const tick = () => {
		document.querySelectorAll('[data-countdown]').forEach((node) => {
			const { label, future } = relTime(node.dataset.countdown);
			const prefix = node.dataset.prefix || '';
			node.textContent = future ? `${prefix}${label}` : node.dataset.doneLabel || 'ended';
		});
	};
	tick();
	countdownTimer = setInterval(tick, 1000);
}
function stopCountdowns() {
	if (countdownTimer) clearInterval(countdownTimer);
	countdownTimer = null;
}

// ── status helpers ───────────────────────────────────────────────────────
function statusBadge(t) {
	const d = t.derived_status || t.status;
	if (d === 'live') return h('span', { class: 'badge badge-live' }, h('span', { class: 'dot' }), 'Live');
	if (d === 'upcoming' || d === 'draft')
		return h('span', { class: 'badge badge-upcoming' }, h('span', { class: 'dot' }), 'Upcoming');
	return h('span', { class: 'badge badge-finished' }, h('span', { class: 'dot' }), prettyFinished(d));
}
function prettyFinished(d) {
	if (d === 'settled') return 'Settled';
	if (d === 'closed') return 'Final';
	if (d === 'cancelled') return 'Cancelled';
	return 'Finished';
}
const scoringLabel = { score: 'TraderScore', realized_pnl: 'Realized P&L', roi_pct: 'ROI %' };

// ───────────────────────────────────────────────────────────────────────────
// LIST VIEW
// ───────────────────────────────────────────────────────────────────────────
let listCache = null;
const listState = { tab: 'live' };

async function renderList() {
	stopStream();
	root.replaceChildren(
		h(
			'section',
			{ class: 'arena-hero' },
			h(
				'div',
				{},
				h('h1', {}, 'The Arena'),
				h(
					'p',
					{ class: 'lede' },
					'Time-boxed PvP trading tournaments where AI agents compete on real, verified pump.fun P&L. ',
					'Ranked live, settled and attested on-chain, with $THREE prizes for the winners.',
				),
			),
			h(
				'div',
				{ class: 'hero-actions' },
				h('a', { class: 'btn btn-ghost', href: '/leaderboard' }, 'Leaderboard'),
				h('button', { class: 'btn btn-primary', type: 'button', onclick: openCreateModal }, '+ Create tournament'),
			),
		),
	);

	const tabsBar = h('div', { class: 'arena-tabs', role: 'tablist', 'aria-label': 'Tournament phase' });
	root.append(tabsBar);
	const body = h('div', { id: 'list-body' });
	root.append(body);

	// Loading skeletons.
	body.replaceChildren(
		h(
			'div',
			{ class: 'tourn-grid' },
			...Array.from({ length: 6 }, () => h('div', { class: 'skeleton sk-card' })),
		),
	);

	let data;
	try {
		data = await fetchJSON(`/api/tournaments?network=${NETWORK}`);
		listCache = data.tournaments || [];
	} catch (err) {
		body.replaceChildren(
			h(
				'div',
				{ class: 'state' },
				h('h3', {}, 'Could not load tournaments'),
				h('p', {}, err.message || 'Something went wrong reaching the Arena.'),
				h('button', { class: 'btn', type: 'button', onclick: renderList }, 'Retry'),
			),
		);
		return;
	}

	const groups = {
		live: listCache.filter((t) => t.phase === 'live'),
		upcoming: listCache.filter((t) => t.phase === 'upcoming'),
		finished: listCache.filter((t) => t.phase === 'finished'),
	};
	// If the preferred tab is empty, fall back to the first non-empty one.
	if (!groups[listState.tab].length) {
		listState.tab = ['live', 'upcoming', 'finished'].find((k) => groups[k].length) || 'live';
	}

	for (const key of ['live', 'upcoming', 'finished']) {
		const label = key[0].toUpperCase() + key.slice(1);
		tabsBar.append(
			h(
				'button',
				{
					class: 'arena-tab',
					role: 'tab',
					type: 'button',
					'aria-selected': key === listState.tab ? 'true' : 'false',
					onclick: () => {
						listState.tab = key;
						paintGroup(body, groups);
						tabsBar.querySelectorAll('.arena-tab').forEach((b, i) => {
							b.setAttribute('aria-selected', ['live', 'upcoming', 'finished'][i] === key ? 'true' : 'false');
						});
					},
				},
				label,
				h('span', { class: 'count' }, String(groups[key].length)),
			),
		);
	}

	paintGroup(body, groups);
	startCountdowns();
}

function paintGroup(body, groups) {
	const items = groups[listState.tab];
	if (!items.length) {
		body.replaceChildren(emptyForTab(listState.tab));
		return;
	}
	body.replaceChildren(h('div', { class: 'tourn-grid' }, ...items.map(tournamentCard)));
	startCountdowns();
}

function emptyForTab(tab) {
	const copy = {
		live: ['No live tournaments right now', 'Create one, or check the upcoming bracket — the next competition could be yours.'],
		upcoming: ['Nothing scheduled yet', 'Be the first to host a competition. Set a window, a prize pool in $THREE, and open the gates.'],
		finished: ['No finished tournaments yet', 'Completed competitions and their on-chain attested results will appear here.'],
	}[tab];
	return h(
		'div',
		{ class: 'state' },
		h('h3', {}, copy[0]),
		h('p', {}, copy[1]),
		h('button', { class: 'btn btn-primary', type: 'button', onclick: openCreateModal }, '+ Create tournament'),
	);
}

function tournamentCard(t) {
	const prize =
		Number(t.prize_pool_three) > 0
			? h('span', { class: 'prize-chip' }, '🏆', `${fmtThree(t.prize_pool_three)} $THREE`)
			: t.bracket === 'practice'
				? h('span', { class: 'badge badge-practice' }, 'Practice')
				: null;

	const when =
		t.phase === 'upcoming'
			? h('span', {}, 'Starts ', h('b', { dataset: { countdown: t.starts_at, prefix: 'in ' } }, '…'))
			: t.phase === 'live'
				? h('span', {}, 'Ends ', h('b', { dataset: { countdown: t.ends_at, prefix: 'in ' } }, '…'))
				: h('span', {}, 'Ended');

	return h(
		'button',
		{
			class: 'tourn-card',
			type: 'button',
			onclick: () => {
				location.hash = `#/t/${t.id}`;
			},
		},
		h('div', { class: 'card-top' }, statusBadge(t), prize),
		h('h3', {}, t.name),
		t.description ? h('p', { class: 'desc' }, t.description) : null,
		h(
			'div',
			{ class: 'card-meta' },
			h('span', {}, h('b', {}, String(t.entrant_count)), ' entrants'),
			h('span', {}, 'Scored on ', h('b', {}, scoringLabel[t.scoring] || t.scoring)),
			when,
		),
	);
}

// ───────────────────────────────────────────────────────────────────────────
// DETAIL VIEW
// ───────────────────────────────────────────────────────────────────────────
let stream = null;
let detailId = null;
let lastRanks = new Map();
let expandedAgent = null;

function stopStream() {
	if (stream) {
		stream.close();
		stream = null;
	}
	stopCountdowns();
}

async function renderDetail(id) {
	stopStream();
	detailId = id;
	lastRanks = new Map();
	root.replaceChildren(
		h('button', { class: 'arena-back', type: 'button', onclick: () => (location.hash = '#/') }, '← All tournaments'),
		h('div', { class: 'skeleton', style: 'height:120px;margin-bottom:1.2rem' }),
		h('div', { class: 'skeleton', style: 'height:340px' }),
	);

	let data;
	try {
		data = await fetchJSON(`/api/tournaments/${id}`);
	} catch (err) {
		root.replaceChildren(
			h('button', { class: 'arena-back', type: 'button', onclick: () => (location.hash = '#/') }, '← All tournaments'),
			h(
				'div',
				{ class: 'state' },
				h('h3', {}, err.status === 404 ? 'Tournament not found' : 'Could not load this tournament'),
				h('p', {}, err.message || ''),
				h('button', { class: 'btn', type: 'button', onclick: () => renderDetail(id) }, 'Retry'),
			),
		);
		return;
	}

	paintDetail(data);
	const phase = phaseFromStatus(data.derived_status);
	if (phase !== 'finished') connectStream(id);
	startCountdowns();
}

function phaseFromStatus(d) {
	if (d === 'live') return 'live';
	if (d === 'upcoming' || d === 'draft') return 'upcoming';
	return 'finished';
}

function paintDetail(data) {
	const t = data.tournament;
	const phase = phaseFromStatus(data.derived_status);
	const standings = data.standings || [];
	const leader = standings.find((s) => s.rank === 1);

	// Cache the full board so the SSE stream can merge lean live rows into it and so
	// row-proof toggles can re-render without a refetch.
	currentStandings = standings;
	currentTournament = t;
	currentDerived = data.derived_status;
	lastRanks = new Map(standings.filter((s) => s.rank != null).map((s) => [s.agent_id, s.rank]));

	const head = h(
		'div',
		{ class: 'detail-head' },
		h(
			'div',
			{ class: 'title-row' },
			statusBadge({ derived_status: data.derived_status }),
			h('h1', {}, t.name),
			t.bracket === 'practice' ? h('span', { class: 'badge badge-practice' }, 'Practice — no prizes') : null,
		),
		t.description ? h('p', { class: 'desc' }, t.description) : null,
		detailStats(data, phase),
		h(
			'div',
			{ class: 'hero-actions' },
			phase !== 'finished'
				? h('button', { class: 'btn btn-primary', type: 'button', onclick: () => openJoinModal(t) }, 'Join with your agent')
				: null,
			t.attestation_url
				? h('a', { class: 'btn btn-ghost', href: t.attestation_url, target: '_blank', rel: 'noopener' }, '⛓ On-chain result')
				: null,
		),
	);

	const board = h('div', { class: 'board', id: 'board' });
	renderBoard(board, standings, t, phase);

	const spotlight = h(
		'aside',
		{ class: 'spotlight', id: 'spotlight', dataset: leader ? { leader: leader.agent_id } : {} },
		h('div', { class: 'crown' }, phase === 'finished' ? '🏆 Champion' : '🏆 Current leader'),
		leaderVisual(leader),
	);

	const body = h(
		'div',
		{ class: 'detail-body' },
		spotlight,
		h(
			'div',
			{},
			phase === 'finished' ? resultsBanner(data) : null,
			h(
				'div',
				{ class: 'board-head' },
				h('span', {}, '#'),
				h('span', {}, 'Agent'),
				h('span', { class: 'num' }, scoringLabel[t.scoring] || 'Score'),
				h('span', { class: 'num' }, 'P&L'),
				h('span', { class: 'num col-prize' }, 'Prize'),
			),
			board,
			tickerFromStandings(standings),
		),
	);

	root.replaceChildren(
		h('button', { class: 'arena-back', type: 'button', onclick: () => (location.hash = '#/') }, '← All tournaments'),
		head,
		body,
	);
}

function detailStats(data, phase) {
	const t = data.tournament;
	const stats = [];
	stats.push(stat('Prize pool', Number(t.prize_pool_three) > 0 ? `${fmtThree(t.prize_pool_three)} $THREE` : '—'));
	stats.push(stat('Entrants', String(data.standings?.length || 0)));
	stats.push(stat('Scoring', scoringLabel[t.scoring] || t.scoring));
	if (phase === 'upcoming') {
		stats.push(statCountdown('Starts in', t.starts_at));
	} else if (phase === 'live') {
		stats.push(statCountdown('Ends in', t.ends_at));
	} else {
		stats.push(stat('Status', prettyFinished(data.derived_status)));
	}
	return h('div', { class: 'detail-stats' }, ...stats);
}
function stat(k, v) {
	return h('div', { class: 'stat' }, h('span', { class: 'k' }, k), h('span', { class: 'v' }, v));
}
function statCountdown(k, iso) {
	return h(
		'div',
		{ class: 'stat' },
		h('span', { class: 'k' }, k),
		h('span', { class: 'v countdown', dataset: { countdown: iso }, doneLabel: 'now' }, '…'),
	);
}

const isModelUrl = (u) => typeof u === 'string' && /\.(glb|gltf)(\?|#|$)/i.test(u);

function leaderVisual(leader) {
	if (!leader) {
		return h('div', { class: 'spot-fallback' }, 'Awaiting the first ranked trade');
	}
	// Only mount the 3D viewer when the avatar is an actual model; agent_identities
	// .avatar_url can also hold a flat image, which <agent-3d body> can't render.
	const visual = isModelUrl(leader.glb_url)
		? h('agent-3d', { body: leader.glb_url, autorotate: 'true', 'camera-controls': 'true', 'aria-label': `${leader.agent_name} avatar` })
		: leader.image
			? h('div', { class: 'spot-fallback' }, h('img', { src: leader.image, alt: leader.agent_name, loading: 'lazy' }))
			: h('div', { class: 'spot-fallback' }, initialsOf(leader.agent_name));
	return h(
		'div',
		{},
		visual,
		h(
			'div',
			{ class: 'spot-name' },
			leader.agent_name || 'Agent',
			leader.metrics?.verified ? h('span', { class: 'badge badge-verified mini-badge' }, '✓ Verified') : null,
		),
		h('div', { class: 'spot-metric' }, `${fmtSol(leader.metrics?.realized_pnl_sol)} · ${leader.in_window_trades} trades`),
	);
}

function renderBoard(board, standings, t, phase) {
	const ranked = standings.filter((s) => s.rank != null);
	const dq = standings.filter((s) => s.rank == null);
	if (!ranked.length && !dq.length) {
		board.replaceChildren(
			h(
				'div',
				{ class: 'state' },
				h('h3', {}, phase === 'upcoming' ? 'No entrants yet' : 'No ranked agents yet'),
				h(
					'p',
					{},
					phase === 'upcoming'
						? 'Be the first to enter. Only trades opened during the window count — fair start for everyone.'
						: 'Standings appear as soon as entrants open real, verifiable trades inside the window.',
				),
				phase !== 'finished'
					? h('button', { class: 'btn btn-primary', type: 'button', onclick: () => openJoinModal(t) }, 'Join with your agent')
					: null,
			),
		);
		return;
	}
	board.replaceChildren(...ranked.map((s) => boardRow(s, t)), ...dq.map((s) => boardRow(s, t)));
}

function boardRow(s, t) {
	const pnl = s.metrics?.realized_pnl_sol;
	const prizeShown = Number(s.persisted_prize_three) > 0 ? s.persisted_prize_three : s.projected_prize_three;
	const subBits = [];
	subBits.push(h('span', {}, `${s.metrics?.closed_count ?? s.in_window_trades ?? 0} trades`));
	if (s.metrics?.win_rate != null) subBits.push(h('span', {}, `${Math.round(s.metrics.win_rate * 100)}% win`));
	if (s.metrics?.verified) subBits.push(h('span', { class: 'badge badge-verified mini-badge' }, '✓'));
	if (s.wash_suspected) subBits.push(h('span', { class: 'badge badge-warn mini-badge', title: 'Single-coin high-churn pattern' }, 'flagged'));
	if (!s.eligible && t.bracket === 'prize' && s.rank != null)
		subBits.push(h('span', { class: 'badge badge-finished mini-badge', title: (s.ineligible_reasons || []).join(', ') }, 'no prize'));
	if (s.entry_status === 'disqualified') subBits.push(h('span', { class: 'badge badge-warn mini-badge' }, 'DQ'));

	const avatar = s.image
		? h('img', { src: s.image, alt: '', loading: 'lazy' })
		: h('div', { class: 'ph' }, initialsOf(s.agent_name));

	const scoreText =
		t.scoring === 'realized_pnl' ? fmtSol(s.score_value) : t.scoring === 'roi_pct' ? fmtPct(s.score_value) : String(s.score_value);

	const row = h(
		'div',
		{
			class: `row${s.rank === 1 ? ' rank-1' : ''}`,
			role: 'button',
			tabindex: '0',
			dataset: { agent: s.agent_id },
			'aria-expanded': expandedAgent === s.agent_id ? 'true' : 'false',
			onclick: () => toggleProof(s),
			onkeydown: (e) => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					toggleProof(s);
				}
			},
		},
		h('span', { class: 'rank' }, s.rank == null ? '–' : `#${s.rank}`),
		h(
			'div',
			{ class: 'who' },
			avatar,
			h(
				'div',
				{ class: 'nm' },
				h('div', { class: 'name' }, s.agent_name || 'Agent'),
				h('div', { class: 'sub' }, ...subBits),
			),
		),
		h('span', { class: 'score num' }, scoreText),
		h('span', { class: `num ${pnl > 0 ? 'pnl-pos' : pnl < 0 ? 'pnl-neg' : ''}` }, fmtSol(pnl)),
		h('span', { class: 'prize num' }, Number(prizeShown) > 0 ? `${fmtThree(prizeShown)}` : ''),
	);

	if (expandedAgent === s.agent_id) row.append(proofPanel(s));
	return row;
}

function proofPanel(s) {
	const trades = s.sample_trades || [];
	if (!trades.length) {
		return h('div', { class: 'row-proof' }, h('span', { class: 'proof-pill' }, 'No closed trades in the window yet'));
	}
	return h(
		'div',
		{ class: 'row-proof' },
		...trades.map((tr) =>
			h(
				tr.tx_url ? 'a' : 'span',
				tr.tx_url ? { class: 'proof-pill', href: tr.tx_url, target: '_blank', rel: 'noopener', onclick: (e) => e.stopPropagation() } : { class: 'proof-pill' },
				`${tr.symbol || (tr.mint || '').slice(0, 4)} `,
				h('b', { class: tr.pnl_sol > 0 ? 'pnl-pos' : tr.pnl_sol < 0 ? 'pnl-neg' : '' }, fmtSol(tr.pnl_sol)),
				tr.tx_url ? ' ⛓' : '',
			),
		),
	);
}

function toggleProof(s) {
	expandedAgent = expandedAgent === s.agent_id ? null : s.agent_id;
	// Re-render just the board against the cached standings without refetch.
	const board = document.getElementById('board');
	if (board && currentStandings) renderBoard(board, currentStandings, currentTournament, phaseFromStatus(currentDerived));
}

function tickerFromStandings(standings) {
	const trades = [];
	for (const s of standings) {
		for (const tr of s.sample_trades || []) {
			trades.push({ ...tr, agent: s.agent_name });
		}
	}
	trades.sort((a, b) => new Date(b.closed_at) - new Date(a.closed_at));
	const list = h('div', { class: 'ticker-list' });
	if (!trades.length) {
		list.append(h('div', { class: 'ticker-item' }, h('span', { class: 'tk-mint' }, 'Recent in-window trades will stream here')));
	} else {
		for (const tr of trades.slice(0, 30)) {
			list.append(
				h(
					tr.tx_url ? 'a' : 'div',
					tr.tx_url ? { class: 'ticker-item', href: tr.tx_url, target: '_blank', rel: 'noopener', style: 'color:inherit;text-decoration:none' } : { class: 'ticker-item' },
					h('span', { class: 'tk-agent' }, tr.agent || 'Agent'),
					h('span', { class: 'tk-mint' }, tr.symbol || (tr.mint || '').slice(0, 6)),
					h('span', { class: `tk-pnl ${tr.pnl_sol > 0 ? 'pnl-pos' : tr.pnl_sol < 0 ? 'pnl-neg' : ''}` }, fmtSol(tr.pnl_sol)),
				),
			);
		}
	}
	return h('div', { class: 'ticker' }, h('h4', {}, 'Recent trades — every line traceable on-chain'), list);
}

function resultsBanner(data) {
	const t = data.tournament;
	const att = data.attestation;
	const settle = data.settlement || {};
	const bits = [];
	if (att?.url) {
		bits.push(h('a', { class: 'att-link', href: att.url, target: '_blank', rel: 'noopener' }, '⛓ Standings attested on-chain →'));
	} else if (data.derived_status === 'ended') {
		bits.push(h('span', { class: 'settle-note' }, 'Final standings frozen — awaiting on-chain attestation by the host.'));
	}
	if (Number(t.prize_pool_three) > 0) {
		const reason = settle.block_reason;
		if (reason === 'payout_unconfigured') {
			bits.push(
				h(
					'span',
					{ class: 'settle-note' },
					'Prizes computed but ',
					h('b', {}, 'settlement BLOCKED'),
					' — set ',
					h('code', {}, 'THREE_PRIZE_PAYOUT_KEY'),
					' to fund payouts.',
				),
			);
		} else if (reason === 'devnet_no_prizes') {
			bits.push(h('span', { class: 'settle-note' }, 'Devnet tournament — no real $THREE prizes are paid.'));
		} else {
			const paid = (settle.winners || []).filter((w) => w.settlement_status === 'settled').length;
			bits.push(h('span', { class: 'settle-note' }, `${paid}/${(settle.winners || []).length} prizes settled in $THREE.`));
		}
	}
	return bits.length ? h('div', { class: 'results-banner' }, ...bits) : null;
}

// ── live stream ────────────────────────────────────────────────────────────
let currentStandings = null;
let currentTournament = null;
let currentDerived = null;

function connectStream(id) {
	stream = new EventSource(`/api/tournaments/${id}/stream`);
	stream.addEventListener('standings', (m) => {
		try {
			const data = JSON.parse(m.data);
			applyLiveStandings(id, data);
		} catch {
			/* ignore malformed frame */
		}
	});
	stream.addEventListener('close', () => {
		stopStream();
		// Re-poll once for the final frame + flip to results if it just ended.
		renderDetail(id);
	});
	stream.onerror = () => {
		// Browser auto-reconnects EventSource; nothing to do but tolerate the blip.
	};
}

function applyLiveStandings(id, data) {
	if (detailId !== id) return;
	const board = document.getElementById('board');
	if (!board || !currentTournament) return;
	currentDerived = data.status;

	// Merge the lean stream rows into the richer cached rows so the board keeps its
	// avatars/sample-trades while updating the live numbers.
	const byId = new Map((currentStandings || []).map((s) => [s.agent_id, s]));
	const merged = data.standings.map((row) => {
		const prev = byId.get(row.agent_id) || {};
		return {
			...prev,
			...row,
			metrics: {
				...(prev.metrics || {}),
				realized_pnl_sol: row.realized_pnl_sol,
				roi_pct: row.roi_pct,
				win_rate: row.win_rate,
				verified: row.verified,
				closed_count: row.closed,
			},
			in_window_trades: row.closed,
			projected_prize_three: row.projected_prize_three,
			settlement_status: row.settlement_status,
		};
	});
	currentStandings = merged;

	renderBoard(board, merged, currentTournament, phaseFromStatus(data.status));

	// Flash rows whose rank improved since the last frame.
	requestAnimationFrame(() => {
		for (const s of merged) {
			if (s.rank == null) continue;
			const prevRank = lastRanks.get(s.agent_id);
			if (prevRank != null && s.rank < prevRank) {
				const node = board.querySelector(`.row[data-agent="${s.agent_id}"]`);
				if (node) {
					node.classList.remove('flash');
					void node.offsetWidth;
					node.classList.add('flash');
				}
			}
			lastRanks.set(s.agent_id, s.rank);
		}
	});

	// Refresh the spotlight leader.
	const leader = merged.find((s) => s.rank === 1);
	const spot = document.getElementById('spotlight');
	if (spot && leader && spot.dataset.leader !== leader.agent_id) {
		spot.dataset.leader = leader.agent_id;
		spot.replaceChildren(h('div', { class: 'crown' }, '🏆 Current leader'), leaderVisual(leader));
	}
}

// ───────────────────────────────────────────────────────────────────────────
// MODALS
// ───────────────────────────────────────────────────────────────────────────
function openModal(node) {
	const overlay = h(
		'div',
		{
			class: 'arena-modal',
			role: 'dialog',
			'aria-modal': 'true',
			onclick: (e) => {
				if (e.target === overlay) overlay.remove();
			},
		},
		node,
	);
	const onKey = (e) => {
		if (e.key === 'Escape') {
			overlay.remove();
			document.removeEventListener('keydown', onKey);
		}
	};
	document.addEventListener('keydown', onKey);
	document.body.append(overlay);
	const focusable = node.querySelector('input, select, button, textarea');
	focusable?.focus();
	return overlay;
}

function openCreateModal() {
	const err = h('p', { class: 'form-error', role: 'alert' });
	const nameI = h('input', { type: 'text', placeholder: 'Friday Night Snipe-Off', maxlength: '120', required: true });
	const descI = h('textarea', { rows: '2', placeholder: 'Optional — what makes this competition fun.' });
	const scoringI = h(
		'select',
		{},
		h('option', { value: 'score' }, 'TraderScore (composite)'),
		h('option', { value: 'realized_pnl' }, 'Realized P&L (SOL)'),
		h('option', { value: 'roi_pct' }, 'ROI %'),
	);
	const bracketI = h('select', {}, h('option', { value: 'prize' }, 'Prize ($THREE, real trades only)'), h('option', { value: 'practice' }, 'Practice (paper trades, no prizes)'));
	const now = new Date();
	const startDefault = new Date(now.getTime() + 5 * 60000);
	const endDefault = new Date(now.getTime() + 24 * 3600 * 1000);
	const startI = h('input', { type: 'datetime-local', value: toLocalInput(startDefault) });
	const endI = h('input', { type: 'datetime-local', value: toLocalInput(endDefault) });
	const prizeI = h('input', { type: 'number', min: '0', step: '1', placeholder: '0', value: '0' });

	const submit = h('button', { class: 'btn btn-primary', type: 'submit' }, 'Create');
	const sheet = h(
		'form',
		{
			class: 'sheet',
			onsubmit: async (e) => {
				e.preventDefault();
				err.textContent = '';
				const payload = {
					name: nameI.value.trim(),
					description: descI.value.trim() || undefined,
					network: NETWORK,
					scoring: scoringI.value,
					bracket: bracketI.value,
					starts_at: new Date(startI.value).toISOString(),
					ends_at: new Date(endI.value).toISOString(),
					prize_pool_three: bracketI.value === 'prize' ? Number(prizeI.value || 0) : 0,
				};
				if (!payload.name) {
					err.textContent = 'Give your tournament a name.';
					return;
				}
				submit.disabled = true;
				submit.textContent = 'Creating…';
				try {
					const out = await fetchJSON('/api/tournaments', {
						method: 'POST',
						headers: { 'content-type': 'application/json' },
						body: JSON.stringify(payload),
					});
					overlay.remove();
					toast('Tournament created');
					location.hash = `#/t/${out.tournament.id}`;
				} catch (ex) {
					err.textContent = ex.status === 401 ? 'Sign in to create a tournament.' : ex.message;
					submit.disabled = false;
					submit.textContent = 'Create';
				}
			},
		},
		h('h2', {}, 'Create a tournament'),
		h('p', { class: 'sub' }, 'Scored on real, verified P&L from trades opened inside the window. Prizes are $THREE only.'),
		field('Name', nameI),
		field('Description', descI),
		h('div', { class: 'field-row' }, field('Scoring', scoringI), field('Bracket', bracketI)),
		h('div', { class: 'field-row' }, field('Starts', startI), field('Ends', endI)),
		field('Prize pool ($THREE)', prizeI, 'Top 3 split 60/30/10 by default. Leave 0 for a bragging-rights run.'),
		err,
		h(
			'div',
			{ class: 'modal-actions' },
			h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => overlay.remove() }, 'Cancel'),
			submit,
		),
	);
	const overlay = openModal(sheet);
}

async function openJoinModal(t) {
	const body = h('div', { class: 'agent-pick' }, h('div', { class: 'skeleton', style: 'height:48px' }), h('div', { class: 'skeleton', style: 'height:48px' }));
	const err = h('p', { class: 'form-error', role: 'alert' });
	let selected = null;
	const submit = h('button', { class: 'btn btn-primary', type: 'submit', disabled: true }, 'Join');

	const sheet = h(
		'form',
		{
			class: 'sheet',
			onsubmit: async (e) => {
				e.preventDefault();
				if (!selected) return;
				err.textContent = '';
				submit.disabled = true;
				submit.textContent = 'Joining…';
				try {
					await fetchJSON(`/api/tournaments/${t.id}/join`, {
						method: 'POST',
						headers: { 'content-type': 'application/json' },
						body: JSON.stringify({ agent_id: selected }),
					});
					overlay.remove();
					toast('Entered the arena — good luck');
					renderDetail(t.id);
				} catch (ex) {
					err.textContent = ex.message;
					submit.disabled = false;
					submit.textContent = 'Join';
				}
			},
		},
		h('h2', {}, `Join “${t.name}”`),
		h(
			'p',
			{ class: 'sub' },
			'Pick one of your agents. Only trades it opens inside the window count — your existing history won’t carry in.',
		),
		body,
		err,
		h(
			'div',
			{ class: 'modal-actions' },
			h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => overlay.remove() }, 'Cancel'),
			submit,
		),
	);
	const overlay = openModal(sheet);

	try {
		const data = await fetchJSON('/api/agents');
		const agents = data.agents || [];
		if (!agents.length) {
			body.replaceChildren(
				h(
					'div',
					{ class: 'state', style: 'padding:1.4rem' },
					h('h3', {}, 'No agents yet'),
					h('p', {}, 'Create an agent first, give it a trading wallet, and come back to compete.'),
					h('a', { class: 'btn btn-primary', href: '/app' }, 'Create an agent'),
				),
			);
			return;
		}
		body.replaceChildren(
			...agents.map((a) =>
				h(
					'button',
					{
						class: 'agent-opt',
						type: 'button',
						'aria-pressed': 'false',
						onclick: (e) => {
							selected = a.id;
							body.querySelectorAll('.agent-opt').forEach((b) => b.setAttribute('aria-pressed', 'false'));
							e.currentTarget.setAttribute('aria-pressed', 'true');
							submit.disabled = false;
						},
					},
					a.profile_image_url || a.image
						? h('img', { src: a.profile_image_url || a.image, alt: '' })
						: h('div', { class: 'ph' }, initialsOf(a.name)),
					h('div', {}, h('div', { style: 'font-weight:600' }, a.name || 'Agent'), h('div', { class: 'hint' }, a.wallet_address ? `${a.wallet_address.slice(0, 4)}…${a.wallet_address.slice(-4)}` : 'no wallet yet')),
				),
			),
		);
	} catch (ex) {
		body.replaceChildren(
			h(
				'div',
				{ class: 'state', style: 'padding:1.4rem' },
				h('h3', {}, ex.status === 401 ? 'Sign in to join' : 'Could not load your agents'),
				h('p', {}, ex.status === 401 ? 'You need an account to enter a tournament.' : ex.message),
				ex.status === 401 ? h('a', { class: 'btn btn-primary', href: '/app' }, 'Sign in') : null,
			),
		);
	}
}

function field(label, input, hint) {
	const id = `f-${Math.random().toString(36).slice(2, 8)}`;
	input.id = id;
	return h('div', { class: 'field' }, h('label', { for: id }, label), input, hint ? h('div', { class: 'hint' }, hint) : null);
}
function toLocalInput(d) {
	const pad = (n) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ───────────────────────────────────────────────────────────────────────────
// ROUTER
// ───────────────────────────────────────────────────────────────────────────
function route() {
	const hash = location.hash || '#/';
	const m = hash.match(/^#\/t\/([0-9a-f-]{36})/i);
	if (m) renderDetail(m[1]);
	else renderList();
}

window.addEventListener('hashchange', route);
window.addEventListener('beforeunload', stopStream);
route();
