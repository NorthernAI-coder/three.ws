// ════════════════════════════════════════════════════════════════════════════
// /watchlist — the coins a trader is tracking.
//
// Closes the loop opened by the "Watch" button on every coin profile
// (/launches/<mint>): that button writes a mint into localStorage under
// `ld_watchlist`; this page reads it back and renders each as a live status
// card (shared coin-status widget → one /api/pump/coin fetch per coin), linking
// straight back to the full profile. The list is device-local and private —
// no account required — and stays in sync across tabs via the storage event.
// ════════════════════════════════════════════════════════════════════════════

import { mountCoinStatus } from './pump/coin-status-card.js';

const WATCH_KEY        = 'ld_watchlist'; // shared with src/launch-detail.js
const LAST_TIERS_KEY   = 'wl_last_tiers'; // mint → tier, for upgrade detection
const ALERTS_KEY       = 'wl_alerts_on';
const TIER_COLOR       = { prime: '#c084fc', strong: '#34d399', lean: '#fbbf24', watch: '#94a3b8', avoid: '#f87171' };
const TIER_RANK        = { avoid: 0, watch: 1, lean: 2, strong: 3, prime: 4 };
const MINT_RE          = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const REDUCED_MOTION   = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const REFRESH_MS       = 90_000;

const feedEl    = document.getElementById('wl-feed');
const stateEl   = document.getElementById('wl-state');
const countEl   = document.getElementById('wl-count');
const clearBtn  = document.getElementById('wl-clear');
const alertsBtn = document.getElementById('wl-alerts');

const handles = new Set();
let refreshTimer = null;

// ── DOM helper ───────────────────────────────────────────────────────────────

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
		if (c == null || c === false) continue;
		node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
	}
	return node;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
function svgEl(tag, attrs) {
	const node = document.createElementNS(SVG_NS, tag);
	for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
	return node;
}

// Deterministic orbital glyph seeded from the mint — the placeholder behind the
// real pump.fun logo (matches the /launches feed identicon language).
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
		svg.appendChild(
			svgEl('circle', {
				cx, cy, r: r.toFixed(1), fill: 'none', stroke: 'currentColor',
				'stroke-width': (0.7 + rand() * 0.9).toFixed(2),
				'stroke-dasharray': `${dashOn.toFixed(1)} ${(circumference - dashOn).toFixed(1)}`,
				'stroke-linecap': 'round', opacity: (0.3 + rand() * 0.45).toFixed(2),
				transform: `rotate(${Math.floor(rand() * 360)} ${cx} ${cy})`,
			}),
		);
		if (rand() > 0.35) {
			const theta = rand() * Math.PI * 2;
			svg.appendChild(
				svgEl('circle', {
					cx: (cx + Math.cos(theta) * r).toFixed(1),
					cy: (cy + Math.sin(theta) * r).toFixed(1),
					r: (1 + rand() * 1.8).toFixed(1), fill: 'currentColor',
					opacity: (0.5 + rand() * 0.5).toFixed(2),
				}),
			);
		}
	}
	svg.appendChild(svgEl('circle', { cx, cy, r: '3.2', fill: 'currentColor', opacity: '0.9', style: 'color: var(--ink-bright)' }));
	return svg;
}

// ── storage ──────────────────────────────────────────────────────────────────

function readList() {
	try {
		const arr = JSON.parse(localStorage.getItem(WATCH_KEY) || '[]');
		return Array.isArray(arr) ? arr.filter((m) => MINT_RE.test(m)) : [];
	} catch {
		return [];
	}
}

function writeList(list) {
	try {
		localStorage.setItem(WATCH_KEY, JSON.stringify(list.slice(0, 200)));
	} catch {
		/* storage blocked — non-fatal */
	}
}

function remove(mint) {
	writeList(readList().filter((m) => m !== mint));
	render();
}

// ── tier memory ───────────────────────────────────────────────────────────────

function readLastTiers() {
	try { return JSON.parse(localStorage.getItem(LAST_TIERS_KEY) || '{}'); } catch { return {}; }
}

function saveLastTiers(map) {
	try { localStorage.setItem(LAST_TIERS_KEY, JSON.stringify(map)); } catch { /* non-fatal */ }
}

// ── alerts ────────────────────────────────────────────────────────────────────

function alertsEnabled() {
	return localStorage.getItem(ALERTS_KEY) === '1' && Notification.permission === 'granted';
}

function updateAlertsBtn() {
	if (!alertsBtn) return;
	const on = alertsEnabled();
	alertsBtn.setAttribute('aria-pressed', String(on));
	alertsBtn.textContent = on ? '🔔 Alerts on' : '🔔 Alerts';
	alertsBtn.style.color = on ? '#c084fc' : '';
	alertsBtn.style.borderColor = on ? 'rgba(192,132,252,.4)' : '';
}

async function toggleAlerts() {
	if (alertsEnabled()) {
		localStorage.setItem(ALERTS_KEY, '0');
		updateAlertsBtn();
		return;
	}
	if (Notification.permission === 'denied') {
		// Can't request again — show a tooltip-style message
		alertsBtn.textContent = '🔕 Blocked by browser';
		setTimeout(() => updateAlertsBtn(), 2400);
		return;
	}
	const perm = await Notification.requestPermission().catch(() => 'denied');
	if (perm === 'granted') {
		localStorage.setItem(ALERTS_KEY, '1');
	}
	updateAlertsBtn();
}

function maybeFire(mint, symbol, newTier, oldTier) {
	if (!alertsEnabled()) return;
	const oldRank = TIER_RANK[oldTier] ?? -1;
	const newRank = TIER_RANK[newTier] ?? -1;
	if (newRank <= oldRank) return;
	// Only notify for strong+ upgrades
	if (newRank < TIER_RANK.strong) return;
	const title = `${symbol || mint.slice(0, 8)} → ${newTier} conviction`;
	const body  = `Oracle scored this coin ${newTier} on three.ws`;
	try {
		const n = new Notification(title, { body, icon: '/favicon-32x32.png', tag: mint });
		n.onclick = () => { window.focus(); window.open(`/oracle?mint=${mint}`, '_blank'); n.close(); };
	} catch { /* Notification blocked mid-flight */ }
}

// ── teardown ─────────────────────────────────────────────────────────────────

function teardown() {
	for (const h of handles) {
		try {
			h.destroy();
		} catch {
			/* ignore */
		}
	}
	handles.clear();
}

// ── cards ────────────────────────────────────────────────────────────────────

function watchCard(mint, index) {
	// Primary card link opens Oracle conviction drawer for this coin.
	// Secondary "launch page" link is rendered inside the coin-status-card footer.
	const link = el('a', {
		class: 'wl-card-link',
		href: `/oracle?mint=${mint}`,
		'aria-label': 'Open Oracle conviction breakdown',
	});
	const market = el('div', { class: 'wl-market' });
	const removeBtn = el('button', {
		class: 'wl-remove',
		type: 'button',
		'aria-label': 'Remove from watchlist',
		title: 'Remove from watchlist',
		text: '✕',
		onclick: (e) => {
			e.preventDefault();
			e.stopPropagation();
			remove(mint);
		},
	});
	const oracleBadge = el('div', { class: 'wl-oracle-badge', 'data-oracle': mint });
	const card = el('article', { class: 'wl-card', 'data-mint': mint }, [link, oracleBadge, removeBtn, market]);
	if (!REDUCED_MOTION) {
		card.style.animationDelay = `${Math.min(index, 12) * 40}ms`;
		card.classList.add('wl-in');
	}
	handles.add(mountCoinStatus(market, mint, { variant: 'card', placeholder: mintIdenticon(mint), showBuy: true }));
	return card;
}

// ── states ───────────────────────────────────────────────────────────────────

function renderEmpty() {
	stateEl.replaceChildren(
		el('div', { class: 'wl-empty' }, [
			el('div', { class: 'wl-empty-glyph', 'aria-hidden': 'true' }, [mintIdenticon('three.ws-watchlist-empty')]),
			el('h2', { text: 'Nothing on your watchlist yet' }),
			el('p', { text: 'Paste a mint address or pump.fun URL above to add any coin instantly. Or tap ☆ Watch on any coin profile to pin it here.' }),
			el('div', { class: 'wl-empty-ctas' }, [
				el('a', { class: 'wl-btn wl-btn-primary', href: '/launches', text: 'Explore launches' }),
				el('a', { class: 'wl-btn', href: '/oracle', text: 'Open Oracle' }),
			]),
		]),
	);
}

function render() {
	teardown();
	feedEl.replaceChildren();
	stateEl.replaceChildren();

	const list = readList();
	const n = list.length;
	countEl.textContent = n ? `${n} coin${n === 1 ? '' : 's'} watched` : '';
	clearBtn.hidden = n === 0;

	if (n === 0) {
		feedEl.setAttribute('aria-busy', 'false');
		renderEmpty();
		return;
	}

	list.forEach((mint, i) => feedEl.appendChild(watchCard(mint, i)));
	feedEl.setAttribute('aria-busy', 'false');

	enrichWithOracleConviction(list);
}

// Batch-fetch Oracle conviction for all watched mints and paint badges on cards.
async function enrichWithOracleConviction(mints) {
	if (!mints.length) return;
	const chunks = [];
	for (let i = 0; i < mints.length; i += 20) chunks.push(mints.slice(i, i + 20));
	let results = {};
	try {
		const responses = await Promise.all(
			chunks.map((chunk) =>
				fetch(`/api/oracle/batch?mints=${chunk.map(encodeURIComponent).join(',')}&network=mainnet`)
					.then((r) => r.ok ? r.json() : null)
					.catch(() => null),
			),
		);
		for (const resp of responses) {
			if (resp?.results) Object.assign(results, resp.results);
		}
	} catch { return; }

	const lastTiers = readLastTiers();
	const nextTiers = { ...lastTiers };

	for (const article of feedEl.querySelectorAll('article[data-mint]')) {
		const mint = article.dataset.mint;
		const data = results[mint];
		if (!data || data.score == null) continue;

		let badge = article.querySelector('.wl-oracle-badge');
		if (!badge) {
			badge = document.createElement('div');
			badge.className = 'wl-oracle-badge';
			article.appendChild(badge);
		}
		const color = TIER_COLOR[data.tier] || '#94a3b8';
		badge.innerHTML = `<a class="wl-ob-link" href="/oracle?mint=${encodeURIComponent(mint)}" aria-label="Oracle conviction: ${data.score} ${data.tier || ''}">
			<span class="wl-ob-score" style="color:${color}">${data.score}</span>
			<span class="wl-ob-tier" style="color:${color}">${data.tier || ''}</span>
		</a>`;

		// Tier upgrade detection — only alert after first load (lastTiers exists)
		const oldTier = lastTiers[mint];
		const newTier = data.tier;
		if (oldTier && newTier && oldTier !== newTier) {
			maybeFire(mint, data.symbol || '', newTier, oldTier);
		}
		if (newTier) nextTiers[mint] = newTier;
	}

	saveLastTiers(nextTiers);
}

function scheduleRefresh() {
	clearTimeout(refreshTimer);
	refreshTimer = setTimeout(async () => {
		const list = readList();
		if (list.length) await enrichWithOracleConviction(list);
		scheduleRefresh();
	}, REFRESH_MS);
}

// ── ambient field (shared visual language) ──────────────────────────────────

function startParticleField() {
	const canvas = document.getElementById('wl-field');
	if (!canvas) return;
	const ctx = canvas.getContext('2d');
	if (!ctx) return;
	let width = 0;
	let height = 0;
	let particles = [];
	let inkRGB = '232,232,232';
	let raf = 0;
	const readInk = () => {
		const scheme = getComputedStyle(document.documentElement).getPropertyValue('color-scheme');
		inkRGB = scheme.includes('light') ? '20,24,34' : '232,232,232';
	};
	const resize = () => {
		const dpr = Math.min(window.devicePixelRatio || 1, 2);
		width = window.innerWidth;
		height = window.innerHeight;
		canvas.width = width * dpr;
		canvas.height = height * dpr;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		const target = Math.min(60, Math.floor((width * height) / 32000));
		particles = Array.from({ length: target }, () => ({
			x: Math.random() * width,
			y: Math.random() * height,
			vx: (Math.random() - 0.5) * 0.1,
			vy: (Math.random() - 0.5) * 0.1,
			r: 0.6 + Math.random() * 1,
		}));
	};
	const draw = () => {
		ctx.clearRect(0, 0, width, height);
		for (const p of particles) {
			p.x += p.vx;
			p.y += p.vy;
			if (p.x < -10) p.x = width + 10;
			if (p.x > width + 10) p.x = -10;
			if (p.y < -10) p.y = height + 10;
			if (p.y > height + 10) p.y = -10;
			ctx.beginPath();
			ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
			ctx.fillStyle = `rgba(${inkRGB},0.13)`;
			ctx.fill();
		}
		for (let i = 0; i < particles.length; i++) {
			for (let j = i + 1; j < particles.length; j++) {
				const a = particles[i];
				const b = particles[j];
				const dx = a.x - b.x;
				const dy = a.y - b.y;
				const d2 = dx * dx + dy * dy;
				if (d2 < 12100) {
					const alpha = 0.04 * (1 - Math.sqrt(d2) / 110);
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
	new MutationObserver(readInk).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
	if (REDUCED_MOTION) {
		draw();
		return;
	}
	loop();
	document.addEventListener('visibilitychange', () => {
		if (document.hidden) cancelAnimationFrame(raf);
		else loop();
	});
}

// ── add by mint / URL ────────────────────────────────────────────────────────

function parseMintFromInput(raw) {
	const s = raw.trim();
	// pump.fun/coin/<mint> or pump.fun/token/<mint>
	const urlMatch = s.match(/pump\.fun\/(?:coin|token)\/([1-9A-HJ-NP-Za-km-z]{32,44})/);
	if (urlMatch) return urlMatch[1];
	// bare mint address
	if (MINT_RE.test(s)) return s;
	return null;
}

function addMint(mint) {
	const list = readList();
	if (list.includes(mint)) return 'already';
	writeList([mint, ...list]);
	render();
	return 'added';
}

function showAddMsg(msg, tone = 'ok') {
	const el = document.getElementById('wl-add-msg');
	if (!el) return;
	el.textContent = msg;
	el.className = `wl-add-msg wl-add-msg-${tone}`;
	el.hidden = false;
	clearTimeout(el._t);
	el._t = setTimeout(() => { el.hidden = true; }, 3500);
}

const addForm  = document.getElementById('wl-add-form');
const addInput = document.getElementById('wl-add-input');

if (addForm && addInput) {
	addForm.addEventListener('submit', (e) => {
		e.preventDefault();
		const mint = parseMintFromInput(addInput.value);
		if (!mint) {
			showAddMsg('Paste a valid Solana mint address or pump.fun URL.', 'err');
			addInput.focus();
			return;
		}
		const result = addMint(mint);
		if (result === 'already') {
			showAddMsg(`Already on your watchlist.`, 'warn');
		} else {
			showAddMsg(`Added — scroll down to see it.`, 'ok');
			addInput.value = '';
		}
	});

	// Auto-submit on paste if the pasted value is a complete mint/URL
	addInput.addEventListener('paste', (e) => {
		const pasted = (e.clipboardData || window.clipboardData)?.getData('text') || '';
		const mint = parseMintFromInput(pasted);
		if (mint) {
			e.preventDefault();
			const result = addMint(mint);
			if (result === 'already') {
				showAddMsg('Already on your watchlist.', 'warn');
			} else {
				showAddMsg(`Added — scroll down to see it.`, 'ok');
			}
		}
	});
}

// ── boot ─────────────────────────────────────────────────────────────────────

clearBtn.addEventListener('click', () => {
	if (!readList().length) return;
	writeList([]);
	render();
});

if (alertsBtn) {
	updateAlertsBtn();
	alertsBtn.addEventListener('click', () => toggleAlerts());
}

// Keep in sync if the user watches/unwatches a coin in another tab.
window.addEventListener('storage', (e) => {
	if (e.key === WATCH_KEY) render();
	if (e.key === ALERTS_KEY) updateAlertsBtn();
});

// Pause refresh when tab is hidden, resume on visibility.
document.addEventListener('visibilitychange', () => {
	if (document.hidden) clearTimeout(refreshTimer);
	else scheduleRefresh();
});

startParticleField();
render();
scheduleRefresh();
