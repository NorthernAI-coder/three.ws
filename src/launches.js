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
 *
 * Visual systems (all decorative, all real-data-driven):
 *   · generative identicon per coin, seeded from its mint address — the coin's
 *     visual fingerprint until pump.fun art crossfades in over it
 *   · ambient particle field on a fixed canvas behind the page
 *   · marquee ticker built from the first page of real launches
 *   · cursor-tracked light on each card (--mx/--my custom properties)
 *   · 60s live refresh that prepends genuinely new launches in place
 */

const PAGE_SIZE = 24;
const ENRICH_CONCURRENCY = 4;
const LIVE_REFRESH_MS = 60_000;

const state = {
	network: 'mainnet',
	agentId: null,
	offset: 0,
	hasMore: false,
	loading: false,
	count: 0,
	seenMints: new Set(),
	latestCreatedAt: null,
};

const feedEl = document.getElementById('lx-feed');
const footerEl = document.getElementById('lx-footer-state');
const countEl = document.getElementById('lx-count');
const agentFilterEl = document.getElementById('lx-agent-filter');
const tickerEl = document.getElementById('lx-ticker');
const tickerTrackEl = document.getElementById('lx-ticker-track');
const statCountEl = document.getElementById('lx-stat-count');
const statLatestEl = document.getElementById('lx-stat-latest');
const statNetworkEl = document.getElementById('lx-stat-network');

const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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

// ── generative identicons ────────────────────────────────────────────────────
// Every mint address deterministically produces its own orbital glyph: ring
// radii, dash rhythms, satellite positions and rotation all derive from a
// seeded PRNG over the address. Monochrome via currentColor so themes remap.

function hashString(str) {
	let h = 2166136261;
	for (let i = 0; i < str.length; i++) {
		h ^= str.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return h >>> 0;
}

function mulberry32(seed) {
	let a = seed;
	return () => {
		a |= 0;
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const SVG_NS = 'http://www.w3.org/2000/svg';

function svgEl(tag, attrs) {
	const node = document.createElementNS(SVG_NS, tag);
	for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
	return node;
}

function mintIdenticon(mint) {
	const rand = mulberry32(hashString(String(mint)));
	const svg = svgEl('svg', { viewBox: '0 0 64 64', 'aria-hidden': 'true' });
	svg.style.color = 'var(--ink-dim)';

	const cx = 32;
	const cy = 32;
	const rings = 3 + Math.floor(rand() * 2);
	for (let i = 0; i < rings; i++) {
		const r = 8 + i * (20 / rings) + rand() * 4;
		const circumference = 2 * Math.PI * r;
		const dashOn = circumference * (0.18 + rand() * 0.55);
		const ring = svgEl('circle', {
			cx,
			cy,
			r: r.toFixed(1),
			fill: 'none',
			stroke: 'currentColor',
			'stroke-width': (0.7 + rand() * 0.9).toFixed(2),
			'stroke-dasharray': `${dashOn.toFixed(1)} ${(circumference - dashOn).toFixed(1)}`,
			'stroke-linecap': 'round',
			opacity: (0.3 + rand() * 0.45).toFixed(2),
			transform: `rotate(${Math.floor(rand() * 360)} ${cx} ${cy})`,
		});
		svg.appendChild(ring);

		// One satellite riding this orbit.
		if (rand() > 0.35) {
			const theta = rand() * Math.PI * 2;
			svg.appendChild(
				svgEl('circle', {
					cx: (cx + Math.cos(theta) * r).toFixed(1),
					cy: (cy + Math.sin(theta) * r).toFixed(1),
					r: (1 + rand() * 1.8).toFixed(1),
					fill: 'currentColor',
					opacity: (0.5 + rand() * 0.5).toFixed(2),
				}),
			);
		}
	}

	// Bright nucleus.
	svg.appendChild(
		svgEl('circle', {
			cx,
			cy,
			r: (2.2 + rand() * 1.6).toFixed(1),
			fill: 'currentColor',
			opacity: '0.9',
			style: 'color: var(--ink-bright)',
		}),
	);
	return svg;
}

// ── ambient particle field ───────────────────────────────────────────────────
// Slow constellation drift behind the page. Pure decoration: pauses when the
// tab hides, renders a single static frame under prefers-reduced-motion, and
// re-reads ink colour when the theme flips.

function startParticleField() {
	const canvas = document.getElementById('lx-field');
	if (!canvas) return;
	const ctx = canvas.getContext('2d');
	if (!ctx) return;

	let width = 0;
	let height = 0;
	let particles = [];
	let inkRGB = '255,255,255';
	let raf = 0;

	const readInk = () => {
		const probe = getComputedStyle(document.documentElement).getPropertyValue('color-scheme');
		inkRGB = probe.includes('light') ? '20,24,34' : '232,232,232';
	};

	const resize = () => {
		const dpr = Math.min(window.devicePixelRatio || 1, 2);
		width = window.innerWidth;
		height = window.innerHeight;
		canvas.width = width * dpr;
		canvas.height = height * dpr;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		const target = Math.min(90, Math.floor((width * height) / 26000));
		particles = Array.from({ length: target }, () => ({
			x: Math.random() * width,
			y: Math.random() * height,
			vx: (Math.random() - 0.5) * 0.12,
			vy: (Math.random() - 0.5) * 0.12,
			r: 0.6 + Math.random() * 1.1,
		}));
	};

	const draw = () => {
		ctx.clearRect(0, 0, width, height);
		const linkDist = 110;
		for (const p of particles) {
			p.x += p.vx;
			p.y += p.vy;
			if (p.x < -10) p.x = width + 10;
			if (p.x > width + 10) p.x = -10;
			if (p.y < -10) p.y = height + 10;
			if (p.y > height + 10) p.y = -10;
			ctx.beginPath();
			ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
			ctx.fillStyle = `rgba(${inkRGB},0.16)`;
			ctx.fill();
		}
		for (let i = 0; i < particles.length; i++) {
			for (let j = i + 1; j < particles.length; j++) {
				const a = particles[i];
				const b = particles[j];
				const dx = a.x - b.x;
				const dy = a.y - b.y;
				const d2 = dx * dx + dy * dy;
				if (d2 < linkDist * linkDist) {
					const alpha = 0.05 * (1 - Math.sqrt(d2) / linkDist);
					ctx.beginPath();
					ctx.moveTo(a.x, a.y);
					ctx.lineTo(b.x, b.y);
					ctx.strokeStyle = `rgba(${inkRGB},${alpha.toFixed(3)})`;
					ctx.lineWidth = 0.6;
					ctx.stroke();
				}
			}
		}
	};

	const loop = () => {
		draw();
		raf = requestAnimationFrame(loop);
	};

	readInk();
	resize();
	window.addEventListener('resize', resize, { passive: true });
	new MutationObserver(readInk).observe(document.documentElement, {
		attributes: true,
		attributeFilter: ['data-theme'],
	});

	if (REDUCED_MOTION) {
		draw(); // one calm static frame
		return;
	}
	loop();
	document.addEventListener('visibilitychange', () => {
		if (document.hidden) cancelAnimationFrame(raf);
		else loop();
	});
}

// ── cursor light ─────────────────────────────────────────────────────────────
// One delegated listener; each card's ::before radial light follows --mx/--my.

feedEl.addEventListener('pointermove', (e) => {
	const card = e.target.closest?.('.lx-card');
	if (!card) return;
	const rect = card.getBoundingClientRect();
	card.style.setProperty('--mx', `${(((e.clientX - rect.left) / rect.width) * 100).toFixed(1)}%`);
	card.style.setProperty('--my', `${(((e.clientY - rect.top) / rect.height) * 100).toFixed(1)}%`);
});

// ── entrance reveal ──────────────────────────────────────────────────────────

const revealObserver = REDUCED_MOTION
	? null
	: new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (!entry.isIntersecting) continue;
					entry.target.classList.add('lx-in');
					revealObserver.unobserve(entry.target);
				}
			},
			{ rootMargin: '0px 0px -8% 0px' },
		);

function reveal(card, index) {
	if (!revealObserver) {
		card.classList.add('lx-in');
		return;
	}
	card.style.transitionDelay = `${(index % 12) * 45}ms`;
	card.addEventListener(
		'transitionend',
		() => {
			card.style.transitionDelay = '';
		},
		{ once: true },
	);
	revealObserver.observe(card);
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
	if (img && imgSrc) {
		img.addEventListener('load', () => img.classList.add('lx-img-in'), { once: true });
		img.src = imgSrc;
	}

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

function launchCard(launch, index, { featured = false } = {}) {
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

	const art = el('div', { class: 'lx-coin-art' });
	art.appendChild(mintIdenticon(launch.mint));
	art.appendChild(el('img', { class: 'lx-coin-img', alt: '', loading: 'lazy' }));

	const card = el('article', { class: `lx-card${featured ? ' lx-card-featured' : ''}` }, [
		featured ? el('span', { class: 'lx-feat-tag', text: 'Latest' }) : null,
		featured && launch.symbol
			? el('span', { class: 'lx-feat-ghost', 'aria-hidden': 'true', text: `$${launch.symbol}` })
			: null,
		el('div', { class: 'lx-card-top' }, [
			art,
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

	reveal(card, index);
	if (!isDevnet) queueEnrich(launch.mint, card);
	return card;
}

// ── ticker ───────────────────────────────────────────────────────────────────
// Marquee strip of the freshest launches. Content duplicated once so the
// translateX(-50%) loop is seamless. Decorative (aria-hidden) — the same data
// lives in the accessible feed below.

function buildTicker(launches) {
	if (!tickerEl || !tickerTrackEl || REDUCED_MOTION) return;
	if (!launches.length) {
		tickerEl.hidden = true;
		return;
	}
	tickerTrackEl.textContent = '';
	const items = launches.slice(0, 12);
	const renderRun = () =>
		items.map((l) =>
			el('span', { class: 'lx-tick' }, [
				el('b', { text: l.symbol ? `$${l.symbol}` : shortAddr(l.mint) }),
				el('span', { text: l.name || '' }),
				el('span', { class: 'up', text: timeAgo(l.created_at) }),
			]),
		);
	renderRun().forEach((n) => tickerTrackEl.appendChild(n));
	renderRun().forEach((n) => tickerTrackEl.appendChild(n));
	tickerTrackEl.style.setProperty('--lx-marquee-duration', `${Math.max(24, items.length * 5)}s`);
	tickerEl.hidden = false;
}

// ── hero stats ───────────────────────────────────────────────────────────────

function updateStats(firstLaunch) {
	if (statCountEl) statCountEl.textContent = state.count ? `${state.count}${state.hasMore ? '+' : ''}` : '0';
	if (statLatestEl) statLatestEl.textContent = firstLaunch ? timeAgo(firstLaunch.created_at) : '—';
	if (statNetworkEl) statNetworkEl.textContent = state.network;
}

// ── states ───────────────────────────────────────────────────────────────────

function renderSkeletons(n = 8) {
	for (let i = 0; i < n; i++) {
		feedEl.appendChild(
			el('div', { class: 'lx-skel', 'aria-hidden': 'true' }, [
				el('div', { class: 'lx-skel-bar', style: 'width:48px;height:48px;border-radius:10px' }),
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

async function fetchLaunches(offset, limit) {
	const params = new URLSearchParams({
		network: state.network,
		offset: String(offset),
		limit: String(limit),
	});
	if (state.agentId) params.set('agent_id', state.agentId);
	const r = await fetch(`/api/pump/launches?${params}`);
	if (!r.ok) throw new Error(`launches api ${r.status}`);
	const body = await r.json();
	return body.data || { launches: [], has_more: false };
}

async function loadPage({ reset = false } = {}) {
	if (state.loading) return;
	state.loading = true;
	if (reset) {
		state.offset = 0;
		state.count = 0;
		state.hasMore = false;
		state.seenMints = new Set();
		state.latestCreatedAt = null;
		feedEl.textContent = '';
		footerEl.textContent = '';
		countEl.textContent = '';
	}
	const isFirstPage = state.offset === 0;
	feedEl.setAttribute('aria-busy', 'true');
	renderSkeletons(reset ? 8 : 4);

	try {
		const { launches = [], has_more: hasMore = false } = await fetchLaunches(state.offset, PAGE_SIZE);

		clearSkeletons();
		launches.forEach((l, i) => {
			state.seenMints.add(l.mint);
			feedEl.appendChild(launchCard(l, i, { featured: isFirstPage && i === 0 }));
		});
		state.offset += launches.length;
		state.count += launches.length;
		state.hasMore = hasMore;
		if (isFirstPage) {
			state.latestCreatedAt = launches[0]?.created_at || null;
			buildTicker(launches);
			updateStats(launches[0] || null);
		} else {
			updateStats({ created_at: state.latestCreatedAt });
		}
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

// ── live refresh ─────────────────────────────────────────────────────────────
// Re-checks page zero once a minute (visible tab only) and slides genuinely
// new launches in at the top — the feed stays alive without a reload.

async function liveRefresh() {
	if (document.hidden || state.loading || state.count === 0) return;
	let data;
	try {
		data = await fetchLaunches(0, 12);
	} catch {
		return; // next tick will retry
	}
	const fresh = (data.launches || []).filter((l) => !state.seenMints.has(l.mint));
	if (!fresh.length) return;

	const anchor = feedEl.querySelector('.lx-card');
	// Newest-first: insert in reverse so the very newest ends up on top.
	for (let i = fresh.length - 1; i >= 0; i--) {
		const l = fresh[i];
		state.seenMints.add(l.mint);
		const card = launchCard(l, 0);
		feedEl.insertBefore(card, anchor || feedEl.firstChild);
	}
	state.count += fresh.length;
	state.offset += fresh.length;
	state.latestCreatedAt = fresh[0].created_at;
	updateStats(fresh[0]);
	updateCount();
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

	updateStats(null);
	startParticleField();
	loadPage({ reset: true });
	setInterval(liveRefresh, LIVE_REFRESH_MS);
}

boot();
