/**
 * /launches — public feed of every coin launched by a three.ws agent.
 *
 * Data flow:
 *   GET /api/pump/launches?network=&offset=&limit=[&agent_id=]   registry rows
 *   GET /api/pump/coin?mint=                                     live market data
 *   GET /api/agents/:id                                          agent-filter chip label
 *
 * Registry rows render immediately; market data (price, image, graduation)
 * streams in per card afterwards so the feed never blocks on pump.fun.
 */

const PAGE_SIZE = 24;
const ENRICH_CONCURRENCY = 4;

const state = {
	network: 'mainnet',
	agentId: null,
	offset: 0,
	hasMore: false,
	loading: false,
	count: 0,
};

const feedEl = document.getElementById('lx-feed');
const footerEl = document.getElementById('lx-footer-state');
const countEl = document.getElementById('lx-count');
const agentFilterEl = document.getElementById('lx-agent-filter');

// ── helpers ──────────────────────────────────────────────────────────────────

function el(tag, props = {}, children = []) {
	const node = document.createElement(tag);
	for (const [k, v] of Object.entries(props)) {
		if (v == null || v === false) continue;
		if (k === 'class') node.className = v;
		else if (k === 'text') node.textContent = v;
		else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
		else node.setAttribute(k, v);
	}
	for (const c of [].concat(children || [])) {
		if (c == null) continue;
		node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
	}
	return node;
}

function shortAddr(s, head = 4, tail = 4) {
	const str = String(s || '');
	if (str.length <= head + tail + 1) return str;
	return `${str.slice(0, head)}…${str.slice(-tail)}`;
}

function timeAgo(iso) {
	const t = new Date(iso).getTime();
	if (!Number.isFinite(t)) return '';
	const s = Math.max(0, (Date.now() - t) / 1000);
	if (s < 60) return 'just now';
	if (s < 3600) return `${Math.floor(s / 60)}m ago`;
	if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
	if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
	return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function usdCompact(n) {
	if (!Number.isFinite(n)) return '—';
	if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
	if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
	if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
	return `$${n.toFixed(0)}`;
}

const GRADIENTS = [
	['#555577', '#4f46e5'],
	['#0ea5e9', '#ffffff'],
	['#10b981', '#0ea5e9'],
	['#f59e0b', '#ef4444'],
	['#ec4899', '#ffffff'],
	['#14b8a6', '#3b82f6'],
];

function coinFallbackUri(symbol) {
	const [c1, c2] = GRADIENTS[(symbol?.charCodeAt(0) || 0) % GRADIENTS.length];
	const letter = (symbol || '?')[0].toUpperCase();
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="88" height="88" viewBox="0 0 88 88"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs><rect width="88" height="88" rx="14" fill="url(#g)"/><text x="50%" y="56%" text-anchor="middle" font-family="Inter,system-ui,sans-serif" font-size="42" font-weight="600" fill="white">${letter}</text></svg>`;
	return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// ── market enrichment (mainnet only) ─────────────────────────────────────────
// Small worker pool over /api/pump/coin so a long feed page doesn't fire 100
// concurrent requests; each result patches its card in place.

const enrichQueue = [];
let enrichActive = 0;

function queueEnrich(mint, card) {
	enrichQueue.push({ mint, card });
	pumpEnrichQueue();
}

function pumpEnrichQueue() {
	while (enrichActive < ENRICH_CONCURRENCY && enrichQueue.length) {
		const job = enrichQueue.shift();
		enrichActive++;
		enrichCard(job.mint, job.card).finally(() => {
			enrichActive--;
			pumpEnrichQueue();
		});
	}
}

async function enrichCard(mint, card) {
	let coin;
	try {
		const r = await fetch(`/api/pump/coin?mint=${encodeURIComponent(mint)}`);
		if (!r.ok) return;
		coin = await r.json();
	} catch {
		return; // registry data already on screen; market data is best-effort
	}
	if (!coin || !card.isConnected) return;

	const img = card.querySelector('.lx-coin-img');
	const imgSrc = coin.image_uri || coin.image;
	if (img && imgSrc) img.src = imgSrc;

	const mcap = card.querySelector('.lx-mcap-value');
	const cap = Number(coin.usd_market_cap);
	if (mcap && Number.isFinite(cap)) mcap.textContent = usdCompact(cap);

	if (coin.complete) {
		const badges = card.querySelector('.lx-badges');
		if (badges && !badges.querySelector('.lx-badge-grad')) {
			badges.prepend(el('span', { class: 'lx-badge lx-badge-grad', text: 'Graduated' }));
		}
	}
}

// ── card rendering ───────────────────────────────────────────────────────────

function agentChip(agent) {
	if (!agent) {
		return el('div', { class: 'lx-agent-row', 'aria-disabled': 'true' }, [
			el('span', { class: 'lx-agent-fallback', text: '?' }),
			el('span', { class: 'lx-agent-name', text: 'Unknown agent' }),
		]);
	}
	const avatar = agent.avatar_thumbnail_url
		? el('img', { src: agent.avatar_thumbnail_url, alt: '', loading: 'lazy' })
		: el('span', { class: 'lx-agent-fallback', text: (agent.name || '?')[0].toUpperCase() });
	return el(
		'a',
		{
			class: 'lx-agent-row',
			href: agent.url || `/agents/${agent.id}`,
			'aria-label': `View agent ${agent.name || shortAddr(agent.id)}`,
		},
		[
			avatar,
			el('span', { class: 'lx-agent-name', text: agent.name || shortAddr(agent.id) }),
			el('span', { class: 'lx-agent-hint', text: 'Agent →' }),
		],
	);
}

function launchCard(launch, index) {
	const isDevnet = launch.network === 'devnet';
	const tradeHref = isDevnet
		? `https://explorer.solana.com/address/${launch.mint}?cluster=devnet`
		: `https://pump.fun/${launch.mint}`;

	const badges = el('div', { class: 'lx-badges' });
	if (isDevnet) badges.appendChild(el('span', { class: 'lx-badge', text: 'Devnet' }));
	if (Number(launch.buyback_bps) > 0) {
		badges.appendChild(
			el('span', {
				class: 'lx-badge lx-badge-buyback',
				text: `${(Number(launch.buyback_bps) / 100).toFixed(1)}% buyback`,
				title: 'Share of agent payments auto-bought-back and burned',
			}),
		);
	}

	const actions = [
		el('a', {
			class: 'lx-action',
			href: tradeHref,
			target: '_blank',
			rel: 'noopener noreferrer',
			text: isDevnet ? 'Explorer ↗' : 'pump.fun ↗',
		}),
	];
	if (!isDevnet) {
		actions.push(
			el('a', {
				class: 'lx-action',
				href: `/communities/${launch.mint}`,
				text: '3D world',
				'aria-label': `Visit the 3D world for ${launch.symbol || launch.name}`,
			}),
		);
	}

	const card = el('article', { class: 'lx-card', style: `animation-delay:${Math.min(index, 12) * 30}ms` }, [
		el('div', { class: 'lx-card-top' }, [
			el('img', {
				class: 'lx-coin-img',
				src: coinFallbackUri(launch.symbol || launch.name),
				alt: '',
				loading: 'lazy',
				onerror: (e) => {
					e.currentTarget.onerror = null;
					e.currentTarget.src = coinFallbackUri(launch.symbol || launch.name);
				},
			}),
			el('div', { class: 'lx-coin-id' }, [
				el('h3', { class: 'lx-coin-name', text: launch.name || launch.symbol || 'Unnamed coin' }),
				el('span', { class: 'lx-coin-symbol', text: launch.symbol ? `$${launch.symbol}` : shortAddr(launch.mint) }),
			]),
		]),
		badges,
		el('div', { class: 'lx-stats' }, [
			el('div', {}, [
				el('span', { class: 'lx-mcap-label', text: 'Market cap' }),
				el('span', { class: 'lx-mcap lx-mcap-value', text: isDevnet ? 'n/a' : '…' }),
			]),
			el('time', { class: 'lx-time', datetime: launch.created_at, text: timeAgo(launch.created_at) }),
		]),
		agentChip(launch.agent),
		el('div', { class: 'lx-card-actions' }, actions),
		el('span', { class: 'lx-mint', text: launch.mint, title: launch.mint }),
	]);

	if (!isDevnet) queueEnrich(launch.mint, card);
	return card;
}

// ── states ───────────────────────────────────────────────────────────────────

function renderSkeletons(n = 8) {
	for (let i = 0; i < n; i++) {
		feedEl.appendChild(
			el('div', { class: 'lx-skel', 'aria-hidden': 'true' }, [
				el('div', { class: 'lx-skel-bar', style: 'width:44px;height:44px;border-radius:10px' }),
				el('div', { class: 'lx-skel-bar', style: 'width:70%;height:14px' }),
				el('div', { class: 'lx-skel-bar', style: 'width:45%;height:22px' }),
				el('div', { class: 'lx-skel-bar', style: 'width:100%;height:34px' }),
			]),
		);
	}
}

function clearSkeletons() {
	feedEl.querySelectorAll('.lx-skel').forEach((n) => n.remove());
}

function renderEmpty() {
	const filtered = !!state.agentId;
	feedEl.appendChild(
		el('div', { class: 'lx-state' }, [
			el('h2', { text: filtered ? 'No launches by this agent yet' : 'No launches yet' }),
			el('p', {
				text: filtered
					? 'This agent has not launched a coin on this network. Clear the filter to see the full feed.'
					: state.network === 'devnet'
						? 'Nothing has been launched on devnet. Switch to mainnet to see live launches.'
						: 'Be the first: create an agent, give it a coin, and it shows up here in real time.',
			}),
			filtered
				? el('button', {
						class: 'lx-btn',
						type: 'button',
						text: 'Clear filter',
						onclick: () => setAgentFilter(null),
					})
				: el('a', {
						class: 'lx-btn lx-btn-primary',
						href: '/create-agent',
						text: 'Create an agent',
					}),
		]),
	);
}

function renderError(retry) {
	feedEl.appendChild(
		el('div', { class: 'lx-state', role: 'alert' }, [
			el('h2', { text: 'Could not load the feed' }),
			el('p', { text: 'The launches API did not respond. Check your connection and try again.' }),
			el('button', { class: 'lx-btn', type: 'button', text: 'Retry', onclick: retry }),
		]),
	);
}

function renderFooter() {
	footerEl.textContent = '';
	if (!state.hasMore) return;
	const btn = el('button', {
		class: 'lx-btn',
		type: 'button',
		text: 'Load more launches',
		onclick: () => loadPage(),
	});
	footerEl.appendChild(btn);
}

function updateCount() {
	countEl.textContent = state.count
		? `${state.count}${state.hasMore ? '+' : ''} launch${state.count === 1 ? '' : 'es'}`
		: '';
}

// ── data loading ─────────────────────────────────────────────────────────────

async function loadPage({ reset = false } = {}) {
	if (state.loading) return;
	state.loading = true;
	if (reset) {
		state.offset = 0;
		state.count = 0;
		state.hasMore = false;
		feedEl.textContent = '';
		footerEl.textContent = '';
		countEl.textContent = '';
	}
	feedEl.setAttribute('aria-busy', 'true');
	renderSkeletons(reset ? 8 : 4);

	const params = new URLSearchParams({
		network: state.network,
		offset: String(state.offset),
		limit: String(PAGE_SIZE),
	});
	if (state.agentId) params.set('agent_id', state.agentId);

	try {
		const r = await fetch(`/api/pump/launches?${params}`);
		if (!r.ok) throw new Error(`launches api ${r.status}`);
		const body = await r.json();
		const { launches = [], has_more: hasMore = false } = body.data || {};

		clearSkeletons();
		launches.forEach((l, i) => feedEl.appendChild(launchCard(l, i)));
		state.offset += launches.length;
		state.count += launches.length;
		state.hasMore = hasMore;
		if (state.count === 0) renderEmpty();
		renderFooter();
		updateCount();
	} catch (err) {
		console.error('[launches] feed load failed', err);
		clearSkeletons();
		if (state.count === 0) renderError(() => loadPage({ reset: true }));
		else renderFooter();
	} finally {
		state.loading = false;
		feedEl.setAttribute('aria-busy', 'false');
	}
}

// ── filters ──────────────────────────────────────────────────────────────────

function syncUrl() {
	const url = new URL(location.href);
	if (state.network === 'devnet') url.searchParams.set('network', 'devnet');
	else url.searchParams.delete('network');
	if (state.agentId) url.searchParams.set('agent_id', state.agentId);
	else url.searchParams.delete('agent_id');
	history.replaceState(null, '', url);
}

function setNetwork(network) {
	if (state.network === network) return;
	state.network = network;
	document.querySelectorAll('.lx-net-btn').forEach((b) => {
		const active = b.dataset.network === network;
		b.classList.toggle('active', active);
		b.setAttribute('aria-selected', String(active));
	});
	syncUrl();
	loadPage({ reset: true });
}

function setAgentFilter(agentId) {
	state.agentId = agentId;
	agentFilterEl.hidden = !agentId;
	agentFilterEl.textContent = '';
	syncUrl();
	if (agentId) renderAgentFilterChip(agentId);
	loadPage({ reset: true });
}

async function renderAgentFilterChip(agentId) {
	const chip = el('span', {}, [el('span', { text: `Agent ${shortAddr(agentId)}` })]);
	const clear = el('button', {
		type: 'button',
		'aria-label': 'Clear agent filter',
		text: '✕',
		onclick: () => setAgentFilter(null),
	});
	agentFilterEl.append(chip, clear);

	// Best-effort name + thumbnail; the chip already works without it.
	try {
		const r = await fetch(`/api/agents/${encodeURIComponent(agentId)}`);
		if (!r.ok) return;
		const body = await r.json();
		const agent = body.agent || body;
		if (state.agentId !== agentId || !agent?.name) return;
		chip.textContent = '';
		if (agent.avatar_thumbnail_url) {
			chip.appendChild(el('img', { src: agent.avatar_thumbnail_url, alt: '' }));
		}
		chip.appendChild(el('span', { text: agent.name }));
	} catch {
		/* keep the short-id chip */
	}
}

// ── boot ─────────────────────────────────────────────────────────────────────

function boot() {
	const qs = new URLSearchParams(location.search);
	state.network = qs.get('network') === 'devnet' ? 'devnet' : 'mainnet';
	const agentId = qs.get('agent_id');
	state.agentId = agentId && /^[0-9a-f-]{36}$/i.test(agentId) ? agentId : null;

	document.querySelectorAll('.lx-net-btn').forEach((b) => {
		const active = b.dataset.network === state.network;
		b.classList.toggle('active', active);
		b.setAttribute('aria-selected', String(active));
		b.addEventListener('click', () => setNetwork(b.dataset.network));
	});

	if (state.agentId) {
		agentFilterEl.hidden = false;
		renderAgentFilterChip(state.agentId);
	}

	loadPage({ reset: true });
}

boot();
