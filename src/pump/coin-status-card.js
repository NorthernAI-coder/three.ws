/**
 * Shared live coin-status widget.
 * ================================
 *
 * One module, three surfaces. Live coin status (symbol, price, market cap,
 * graduation %, 24h volume, buy link) was independently implemented in
 * agent-detail.js, agent-home-pumpfun.js and launches.js — each fetching
 * `/api/pump/coin`, formatting numbers, and handling loading/error states on
 * its own. This unifies all of that: map the response shape once here, and
 * every consumer benefits when a field name or format changes.
 *
 * Data source: GET /api/pump/coin?mint=<mint> (pump.fun coin object, proxied).
 * The raw shape is normalized exactly once in `mapCoin()`, so renaming an
 * upstream field (e.g. `usd_market_cap` → `mcap`) is a one-line change that
 * propagates to all three variants without touching any caller.
 *
 * Variants:
 *   · chip (default) — compact inline chip: symbol · price · mcap · grad %.
 *   · row            — table-row layout: symbol, mint, volume, time.
 *   · card           — full card: name, price, mcap, graduation ring, volume,
 *                      buy link, time-since-launch.
 *
 * States: loading skeleton → populated → error (with Retry). The module owns
 * its own refresh timer; callers just hand it a container and call destroy().
 */

const COIN_ENDPOINT = '/api/pump/coin';
const ORACLE_ENDPOINT = '/api/oracle/coin';
const DEFAULT_REFRESH_MS = 30_000;
// pump.fun bonding curves complete (graduate) around a ~$69k USD market cap;
// the same constant the agent token widget uses for its graduation gauge.
const GRADUATION_CAP_USD = 69_000;
const SVG_NS = 'http://www.w3.org/2000/svg';

// ── formatting ───────────────────────────────────────────────────────────────
// Copied from the existing implementations (launches.usdCompact /
// agent-detail.launchUsdCompact / agent-detail.fmtPct) so the three surfaces
// keep formatting identical after the refactor.

/** Compact USD market cap: `$1.2M`, `$340.0K`, `$420`. */
export function formatMcap(n) {
	if (!Number.isFinite(n)) return '—';
	if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
	if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
	if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
	return `$${n.toFixed(0)}`;
}

/** Per-token USD price: `$0.00012`, `$1.20`, `$1.2e-8`. */
export function formatPrice(n) {
	if (!Number.isFinite(n) || n <= 0) return '—';
	if (n < 1e-6) return `$${n.toExponential(2)}`;
	if (n < 1) return `$${n.toPrecision(2)}`;
	if (n < 1000) return `$${n.toFixed(2)}`;
	return `$${Math.round(n).toLocaleString('en-US')}`;
}

/** Percentage (0–100 in, clamped): `0%`, `34%`, `7.5%`. */
export function formatPct(n) {
	if (!Number.isFinite(n)) return '—';
	const v = Math.max(0, Math.min(100, n));
	return `${v >= 10 || v === 0 ? v.toFixed(0) : v.toFixed(1)}%`;
}

function timeSince(ms) {
	const t = Number(ms);
	if (!Number.isFinite(t) || t <= 0) return '';
	const s = Math.max(0, (Date.now() - t) / 1000);
	if (s < 60) return 'just now';
	if (s < 3600) return `${Math.floor(s / 60)}m ago`;
	if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
	if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
	return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function shortMint(s, head = 4, tail = 4) {
	const str = String(s || '');
	if (str.length <= head + tail + 1) return str;
	return `${str.slice(0, head)}…${str.slice(-tail)}`;
}

// Plain-language values for screen readers — "1.2 million dollars" etc.
function spokenUsd(n) {
	if (!Number.isFinite(n)) return 'unavailable';
	if (n >= 1e9) return `${(n / 1e9).toFixed(2)} billion dollars`;
	if (n >= 1e6) return `${(n / 1e6).toFixed(2)} million dollars`;
	if (n >= 1e3) return `${(n / 1e3).toFixed(1)} thousand dollars`;
	return `${n.toFixed(2)} dollars`;
}

// ── field mapping (the single source of truth for the API shape) ─────────────

/**
 * Normalize the raw `/api/pump/coin` response into the shape every variant
 * reads from. This is the ONLY place that knows the upstream field names — a
 * rename here propagates to chip, row, and card at once.
 */
function mapCoin(raw, mint) {
	const mcap = Number(raw?.usd_market_cap);
	const supplyAtomic = Number(raw?.total_supply);
	// pump.fun tokens carry 6 decimals; human supply = atomic / 1e6.
	const supply = Number.isFinite(supplyAtomic) && supplyAtomic > 0 ? supplyAtomic / 1e6 : null;
	const price = supply && Number.isFinite(mcap) ? mcap / supply : null;
	const graduated = raw?.complete === true;
	const graduationPct = graduated
		? 100
		: Number.isFinite(mcap)
			? Math.max(0, Math.min(100, (mcap / GRADUATION_CAP_USD) * 100))
			: null;
	const volume24h = Number(raw?.volume_24h ?? raw?.volume24h);

	return {
		mint: raw?.mint || mint,
		symbol: raw?.symbol || '',
		name: raw?.name || '',
		image: raw?.image_uri || raw?.image || '',
		mcap: Number.isFinite(mcap) ? mcap : null,
		price: Number.isFinite(price) ? price : null,
		graduationPct,
		graduated,
		volume24h: Number.isFinite(volume24h) ? volume24h : null,
		createdAt: Number(raw?.created_timestamp) || null,
	};
}

// ── tiny DOM helper ──────────────────────────────────────────────────────────

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

// ── graduation ring (SVG arc via stroke-dasharray) ───────────────────────────

function graduationRing(pct) {
	const value = Math.max(0, Math.min(100, Number(pct) || 0));
	const r = 13;
	const circumference = 2 * Math.PI * r;
	const dash = (value / 100) * circumference;

	const svg = document.createElementNS(SVG_NS, 'svg');
	svg.setAttribute('viewBox', '0 0 32 32');
	svg.setAttribute('class', 'csc-ring');
	svg.setAttribute('role', 'img');
	svg.setAttribute('aria-label', `${formatPct(value)} to graduation`);

	const track = document.createElementNS(SVG_NS, 'circle');
	track.setAttribute('cx', '16');
	track.setAttribute('cy', '16');
	track.setAttribute('r', String(r));
	track.setAttribute('class', 'csc-ring-track');

	const arc = document.createElementNS(SVG_NS, 'circle');
	arc.setAttribute('cx', '16');
	arc.setAttribute('cy', '16');
	arc.setAttribute('r', String(r));
	arc.setAttribute('class', 'csc-ring-arc');
	arc.setAttribute('stroke-dasharray', `${dash.toFixed(2)} ${(circumference - dash).toFixed(2)}`);
	arc.setAttribute('transform', 'rotate(-90 16 16)');

	const label = document.createElementNS(SVG_NS, 'text');
	label.setAttribute('x', '16');
	label.setAttribute('y', '16');
	label.setAttribute('class', 'csc-ring-label');
	label.textContent = `${Math.round(value)}`;

	svg.append(track, arc, label);
	return svg;
}

// ── Oracle conviction badge ──────────────────────────────────────────────────

const TIER_LABEL = { prime: 'PRIME', strong: 'STRONG', lean: 'LEAN', watch: 'WATCH', avoid: 'AVOID' };

function renderConvictionBadge(conviction) {
	if (!conviction || conviction.score == null) return null;
	const tier = conviction.tier || 'watch';
	const score = Math.round(Number(conviction.score));
	const p = conviction.pillars || {};
	const pill = el('span', {
		class: `csc-cv-pill csc-cv-${tier}`,
		text: `${TIER_LABEL[tier] || tier.toUpperCase()} · ${score}`,
		title: `Oracle conviction: ${score}/100`,
	});
	const pillars = [
		p.pedigree != null ? `P:${Math.round(p.pedigree)}` : null,
		p.structure != null ? `S:${Math.round(p.structure)}` : null,
		p.narrative != null ? `N:${Math.round(p.narrative)}` : null,
		p.momentum != null ? `M:${Math.round(p.momentum)}` : null,
	].filter(Boolean);
	const breakdown = pillars.length
		? el('span', { class: 'csc-cv-breakdown', text: pillars.join('  ') })
		: null;
	return el('div', { class: 'csc-conviction', 'aria-label': `Oracle conviction score: ${score}, tier ${tier}` }, [pill, breakdown]);
}

// ── variant renderers ────────────────────────────────────────────────────────

function renderChip(coin, opts) {
	const nodes = [el('span', { class: 'csc-sym', text: coin.symbol ? `$${coin.symbol}` : shortMint(coin.mint) })];
	if (coin.price != null) {
		nodes.push(el('span', { class: 'csc-price', text: formatPrice(coin.price), 'aria-label': `Price: ${formatPrice(coin.price)} per token` }));
	}
	if (coin.mcap != null) {
		nodes.push(el('span', { class: 'csc-mcap', text: formatMcap(coin.mcap), 'aria-label': `Market cap: ${spokenUsd(coin.mcap)}` }));
	}
	if (coin.graduationPct != null) {
		nodes.push(
			el('span', {
				class: `csc-grad${coin.graduated ? ' csc-grad-done' : ''}`,
				text: coin.graduated ? 'Graduated' : `${formatPct(coin.graduationPct)} to grad`,
			}),
		);
	}
	if (opts.showBuy) nodes.push(buyLink(coin.mint));
	return el('div', { class: 'csc csc-chip' }, nodes);
}

function renderRow(coin, opts) {
	const nodes = [
		el('span', { class: 'csc-sym', text: coin.symbol ? `$${coin.symbol}` : coin.name || '—' }),
		el('span', { class: 'csc-mono csc-mint', text: shortMint(coin.mint) }),
		el('span', {
			class: 'csc-mcap',
			text: coin.mcap != null ? formatMcap(coin.mcap) : '—',
			'aria-label': `Market cap: ${spokenUsd(coin.mcap)}`,
		}),
	];
	if (coin.volume24h != null) {
		nodes.push(el('span', { class: 'csc-vol', text: `Vol ${formatMcap(coin.volume24h)}` }));
	}
	if (coin.createdAt) nodes.push(el('span', { class: 'csc-time', text: timeSince(coin.createdAt) }));
	if (opts.showBuy) nodes.push(buyLink(coin.mint));
	return el('div', { class: 'csc csc-row' }, nodes);
}

function renderCard(coin, opts) {
	const head = el('div', { class: 'csc-card-head' }, [
		coinAvatar(coin, opts.placeholder),
		el('div', { class: 'csc-card-id' }, [
			el('span', { class: 'csc-card-name', text: coin.name || coin.symbol || 'Coin' }),
			el('span', { class: 'csc-sym', text: coin.symbol ? `$${coin.symbol}` : shortMint(coin.mint) }),
		]),
		coin.graduationPct != null ? graduationRing(coin.graduationPct) : null,
	]);

	const stats = el('div', { class: 'csc-card-stats' }, [
		el('div', { class: 'csc-stat' }, [
			el('span', { class: 'csc-stat-label', text: 'Price' }),
			el('span', {
				class: 'csc-stat-value',
				text: coin.price != null ? formatPrice(coin.price) : '—',
				'aria-label': coin.price != null ? `Price: ${formatPrice(coin.price)} per token` : null,
			}),
		]),
		el('div', { class: 'csc-stat' }, [
			el('span', { class: 'csc-stat-label', text: 'Market cap' }),
			el('span', {
				class: 'csc-stat-value',
				text: coin.mcap != null ? formatMcap(coin.mcap) : '—',
				'aria-label': `Market cap: ${spokenUsd(coin.mcap)}`,
			}),
		]),
	]);
	if (coin.volume24h != null) {
		stats.appendChild(
			el('div', { class: 'csc-stat' }, [
				el('span', { class: 'csc-stat-label', text: '24h volume' }),
				el('span', { class: 'csc-stat-value', text: formatMcap(coin.volume24h) }),
			]),
		);
	}

	// Market-cap progress bar mirrors the graduation ring as a wider readout.
	const bar = el('div', { class: 'csc-bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.round(coin.graduationPct || 0)) }, [
		el('div', { class: 'csc-bar-fill', style: `width:${Math.min(100, coin.graduationPct || 0).toFixed(1)}%` }),
	]);

	const conviction = opts.conviction || null;
	const badge = renderConvictionBadge(conviction);

	const foot = el('div', { class: 'csc-card-foot' }, [
		coin.createdAt ? el('span', { class: 'csc-time', text: `Launched ${timeSince(coin.createdAt)}` }) : null,
		opts.showBuy ? buyLink(coin.mint) : null,
	]);

	return el('div', { class: 'csc csc-card' }, [head, stats, coin.graduationPct != null ? bar : null, badge, foot]);
}

/**
 * Avatar for the card variant. A real pump.fun logo fades in over an optional
 * caller-supplied placeholder node (e.g. a deterministic identicon) — the same
 * crossfade the launches feed used before unification. Renders nothing when
 * there is neither an image nor a placeholder.
 */
function coinAvatar(coin, placeholder) {
	if (!coin.image && !placeholder) return null;
	const box = el('div', { class: 'csc-avatar' });
	if (placeholder) box.appendChild(placeholder);
	if (coin.image) {
		const img = el('img', { class: 'csc-card-img', src: coin.image, alt: '', loading: 'lazy' });
		img.addEventListener('load', () => img.classList.add('csc-img-in'), { once: true });
		// No placeholder behind it → show immediately rather than fading from blank.
		if (!placeholder) img.classList.add('csc-img-in');
		box.appendChild(img);
	}
	return box;
}

function buyLink(mint) {
	return el('a', {
		class: 'csc-buy',
		href: `https://pump.fun/${mint}`,
		target: '_blank',
		rel: 'noopener noreferrer',
		text: 'Buy →',
	});
}

const RENDERERS = { chip: renderChip, row: renderRow, card: renderCard };

// ── loading / error states ───────────────────────────────────────────────────

function skeleton(variant) {
	const bars = variant === 'card' ? 4 : variant === 'row' ? 3 : 2;
	return el(
		'div',
		{ class: `csc csc-${variant} csc-skeleton` },
		Array.from({ length: bars }, () => el('span', { class: 'csc-skel-bar' })),
	);
}

function errorState(variant, retry) {
	return el('div', { class: `csc csc-${variant} csc-error`, role: 'alert' }, [
		el('span', { class: 'csc-error-msg', text: 'Coin data unavailable.' }),
		el('button', { class: 'csc-retry', type: 'button', text: 'Retry', onclick: retry }),
	]);
}

// ── styles (injected once) ───────────────────────────────────────────────────

let stylesInjected = false;
const STYLES = `
.csc { color: var(--ink-bright, #e8e8e8); font-size: 13px; box-sizing: border-box; }
.csc-chip, .csc-row { display: inline-flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.csc-row { display: flex; width: 100%; }
.csc-sym { font-weight: 600; }
.csc-mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.csc-mint, .csc-time, .csc-vol { color: var(--ink-dim, rgba(255,255,255,0.55)); font-size: 12px; }
.csc-time { margin-left: auto; }
.csc-price { color: var(--ink-dim, rgba(255,255,255,0.7)); }
.csc-mcap { font-weight: 600; }
.csc-grad { font-size: 11px; padding: 1px 7px; border-radius: 999px; background: rgba(120,140,255,0.14); color: rgba(190,200,255,0.95); }
.csc-grad-done { background: rgba(120,200,140,0.16); color: rgba(170,235,190,0.95); }
.csc-buy { color: var(--accent, #7c83ff); text-decoration: none; font-weight: 600; transition: opacity .15s; }
.csc-buy:hover { opacity: .8; }
.csc-buy:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; border-radius: 4px; }

.csc-card { display: flex; flex-direction: column; gap: 12px; padding: 14px; border-radius: 14px;
	background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07); }
.csc-card-head { display: flex; align-items: center; gap: 10px; }
.csc-avatar { position: relative; width: 40px; height: 40px; border-radius: 9px; overflow: hidden; flex: 0 0 auto; background: rgba(255,255,255,0.05); }
.csc-avatar > svg, .csc-avatar > img { position: absolute; inset: 0; width: 100%; height: 100%; }
.csc-card-img { object-fit: cover; opacity: 0; transition: opacity .4s ease; }
.csc-card-img.csc-img-in { opacity: 1; }
@media (prefers-reduced-motion: reduce) { .csc-card-img { transition: none; } }
.csc-card-id { display: flex; flex-direction: column; min-width: 0; gap: 1px; }
.csc-card-name { font-weight: 600; font-size: 15px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.csc-ring { width: 36px; height: 36px; margin-left: auto; flex: 0 0 auto; }
.csc-ring-track { fill: none; stroke: rgba(255,255,255,0.1); stroke-width: 3; }
.csc-ring-arc { fill: none; stroke: var(--accent, #7c83ff); stroke-width: 3; stroke-linecap: round; transition: stroke-dasharray .5s ease; }
.csc-ring-label { fill: var(--ink-bright, #e8e8e8); font-size: 11px; font-weight: 600; text-anchor: middle; dominant-baseline: central; }
.csc-card-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(80px, 1fr)); gap: 10px; }
.csc-stat { display: flex; flex-direction: column; gap: 2px; }
.csc-stat-label { font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: var(--ink-dim, rgba(255,255,255,0.5)); }
.csc-stat-value { font-size: 15px; font-weight: 600; }
.csc-bar { height: 5px; border-radius: 999px; background: rgba(255,255,255,0.08); overflow: hidden; }
.csc-bar-fill { height: 100%; background: var(--accent, #7c83ff); border-radius: 999px; transition: width .5s ease; }
.csc-card-foot { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.csc-card-foot:empty { display: none; }

.csc-skeleton { gap: 8px; }
.csc-skel-bar { display: inline-block; height: 12px; min-width: 48px; flex: 1 1 48px; border-radius: 6px;
	background: linear-gradient(90deg, rgba(255,255,255,0.06) 25%, rgba(255,255,255,0.12) 37%, rgba(255,255,255,0.06) 63%);
	background-size: 400% 100%; animation: csc-shimmer 1.4s ease infinite; }
.csc-card.csc-skeleton { min-height: 120px; }
@keyframes csc-shimmer { 0% { background-position: 100% 50%; } 100% { background-position: 0 50%; } }
@media (prefers-reduced-motion: reduce) { .csc-skel-bar { animation: none; } }

.csc-error { display: flex; align-items: center; gap: 10px; color: var(--ink-dim, rgba(255,255,255,0.6)); font-size: 12px; }
.csc-error-msg { flex: 1 1 auto; }
.csc-retry { background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.12); color: inherit;
	border-radius: 7px; padding: 3px 10px; font-size: 12px; cursor: pointer; transition: background .15s; }
.csc-retry:hover { background: rgba(255,255,255,0.14); }
.csc-retry:focus-visible { outline: 2px solid var(--accent, #7c83ff); outline-offset: 1px; }
`;

function injectStyles() {
	if (stylesInjected || typeof document === 'undefined') return;
	const tag = document.createElement('style');
	tag.dataset.cscStyles = '1';
	tag.textContent = STYLES;
	document.head.appendChild(tag);
	stylesInjected = true;
}

// ── mount ────────────────────────────────────────────────────────────────────

/**
 * Mounts a live coin-status display into `container`.
 *
 * @param {HTMLElement} container  — where to render
 * @param {string}      mint       — Solana mint address (base58)
 * @param {object}      [opts]
 * @param {string}      [opts.variant]   — 'chip' | 'row' | 'card' (default: 'chip')
 * @param {number}      [opts.refreshMs] — live-refresh interval (default: 30000, 0 disables)
 * @param {boolean}     [opts.showBuy]   — show "Buy" link (default: false)
 * @param {HTMLElement} [opts.placeholder] — node shown behind the avatar in the
 *                       'card' variant until the real logo loads (e.g. an identicon)
 * @returns {{ destroy: () => void }}   — cleanup handle
 */
export function mountCoinStatus(container, mint, opts = {}) {
	const variant = RENDERERS[opts.variant] ? opts.variant : 'chip';
	const refreshMs = opts.refreshMs == null ? DEFAULT_REFRESH_MS : Number(opts.refreshMs);
	const showBuy = !!opts.showBuy;
	const placeholder = opts.placeholder || null;
	const render = RENDERERS[variant];

	injectStyles();

	let timer = null;
	let abort = null;
	let destroyed = false;
	let lastCoin = null;

	const paint = (node) => {
		if (destroyed || !container) return;
		container.replaceChildren(node);
	};

	async function load({ silent = false } = {}) {
		if (destroyed) return;
		if (abort) abort.abort();
		abort = new AbortController();
		container.setAttribute('aria-busy', 'true');
		if (!silent && !lastCoin) paint(skeleton(variant));

		try {
			const r = await fetch(`${COIN_ENDPOINT}?mint=${encodeURIComponent(mint)}`, { signal: abort.signal });
			if (!r.ok) throw new Error(`coin api ${r.status}`);
			const raw = await r.json();
			lastCoin = mapCoin(raw, mint);
			paint(render(lastCoin, { showBuy, placeholder }));
		} catch (err) {
			if (err?.name === 'AbortError' || destroyed) return;
			// A refresh blip keeps the last good render; only a cold failure with
			// nothing on screen shows the error state.
			if (!lastCoin) paint(errorState(variant, () => load()));
		} finally {
			if (!destroyed) container.setAttribute('aria-busy', 'false');
		}
	}

	load();
	if (refreshMs > 0) {
		timer = setInterval(() => load({ silent: true }), refreshMs);
	}

	return {
		destroy() {
			destroyed = true;
			if (timer) clearInterval(timer);
			if (abort) abort.abort();
		},
	};
}
