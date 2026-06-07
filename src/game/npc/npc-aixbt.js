// AIXBT — the town's intelligence terminal.
//
// Unlike the vendor counters (npc-services.js), aixbt doesn't sell a one-shot
// paid call: he's the wired-in oracle. Walk up, press E, and he immediately
// pulls the live aixbt feed — narrative intel + momentum-ranked movers — and
// reads it back in a terminal panel. A query bar re-runs the feed for a token
// or chain. Data is the three.ws ⇄ aixbt bridge (/api/aixbt/*); the upstream
// aixbt key stays server-side.
//
// Free at the counter because three.ws already pays aixbt upstream; the paid
// layer lives on the MCP tools (aixbt_intel / aixbt_projects) for other agents.
//
// Self-contained: reuses the .npc-svc-* panel chrome for native look + the
// shared overlay lifecycle, plus a small .aixbt-* stylesheet injected once.

// ── tiny DOM helper (mirrors npc-services.js conventions) ─────────────────────
function el(tag, attrs, kids) {
	const node = document.createElement(tag);
	if (attrs) {
		for (const [k, v] of Object.entries(attrs)) {
			if (v == null || v === false) continue;
			if (k === 'class') node.className = v;
			else if (k === 'text') node.textContent = v;
			else if (k === 'html') node.innerHTML = v;
			else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
			else node.setAttribute(k, v === true ? '' : v);
		}
	}
	for (const kid of [].concat(kids || [])) {
		if (kid == null || kid === false) continue;
		node.appendChild(typeof kid === 'string' ? document.createTextNode(kid) : kid);
	}
	return node;
}

function fmtPct(n) {
	if (n == null || Number.isNaN(Number(n))) return '—';
	const v = Number(n);
	return (v >= 0 ? '+' : '') + v.toFixed(2) + '%';
}
function fmtUsd(n) {
	if (n == null || Number.isNaN(Number(n))) return '—';
	const v = Number(n);
	if (v >= 1) return '$' + v.toLocaleString(undefined, { maximumFractionDigits: 2 });
	return '$' + v.toLocaleString(undefined, { maximumSignificantDigits: 4 });
}
function scoreBar(label, score) {
	const pct = Math.max(0, Math.min(100, Math.round((Number(score) || 0) * 100)));
	return el('div', { class: 'aixbt-score' }, [
		el('span', { class: 'aixbt-score-k', text: label }),
		el('span', { class: 'aixbt-score-track' }, [
			el('span', { class: 'aixbt-score-fill', style: `width:${pct}%` }),
		]),
		el('span', { class: 'aixbt-score-v', text: score == null ? '—' : pct + '%' }),
	]);
}

const CHAINS = [
	{ value: '', label: 'All chains' },
	{ value: 'solana', label: 'Solana' },
	{ value: 'base', label: 'Base' },
	{ value: 'ethereum', label: 'Ethereum' },
];

function injectStyles() {
	if (document.getElementById('aixbt-term-styles')) return;
	const s = document.createElement('style');
	s.id = 'aixbt-term-styles';
	s.textContent = `
	.npc-svc-card.is-aixbt { max-width: 640px; }
	.npc-svc-card.is-aixbt .npc-svc-title { display: flex; align-items: center; gap: 8px; }
	.aixbt-live { display:inline-flex; align-items:center; gap:5px; font-size:10px; font-weight:800; letter-spacing:0.08em; color:#27e0c4; }
	.aixbt-live::before { content:''; width:7px; height:7px; border-radius:50%; background:#27e0c4; box-shadow:0 0 8px #27e0c4; animation:aixbt-pulse 1.6s ease-in-out infinite; }
	@keyframes aixbt-pulse { 0%,100%{opacity:1} 50%{opacity:0.35} }
	.aixbt-bar { display:flex; gap:8px; margin:4px 0 14px; }
	.aixbt-bar .npc-svc-input { margin:0; }
	.aixbt-bar .aixbt-token { flex:1 1 auto; }
	.aixbt-bar .aixbt-chain { flex:0 0 130px; }
	.aixbt-refresh { flex:0 0 auto; border:1px solid var(--cc-edge, rgba(255,255,255,0.14)); background:rgba(39,224,196,0.12); color:#9ff4e6; font-weight:700; border-radius:var(--cc-radius,4px); padding:0 14px; cursor:pointer; transition:background .15s ease; }
	.aixbt-refresh:hover { background:rgba(39,224,196,0.22); }
	.aixbt-refresh:disabled { opacity:0.5; cursor:default; }
	.aixbt-section-h { font-size:11px; font-weight:800; letter-spacing:0.07em; text-transform:uppercase; color:var(--cc-muted,#9a9aa2); margin:16px 0 8px; }
	.aixbt-row { padding:10px 0; border-top:1px solid var(--cc-edge, rgba(255,255,255,0.08)); }
	.aixbt-row:first-of-type { border-top:0; }
	.aixbt-row-top { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
	.aixbt-tkr { font-weight:800; letter-spacing:0.02em; }
	.aixbt-cat { font-size:10px; font-weight:700; letter-spacing:0.05em; text-transform:uppercase; color:#8fb8ff; background:rgba(120,170,255,0.12); border-radius:3px; padding:1px 6px; }
	.aixbt-chg.up { color:#43d6a0; } .aixbt-chg.down { color:#ff7a8a; } .aixbt-chg.flat { color:var(--cc-muted,#9a9aa2); }
	.aixbt-chg { font-weight:800; font-variant-numeric:tabular-nums; }
	.aixbt-desc { margin:5px 0 0; color:var(--cc-text,#e9e9ec); font-size:13px; line-height:1.45; }
	.aixbt-meta { margin-top:5px; font-size:11px; color:var(--cc-muted,#9a9aa2); display:flex; gap:12px; flex-wrap:wrap; }
	.aixbt-official { color:#43d6a0; }
	.aixbt-scores { margin-top:7px; display:grid; gap:5px; }
	.aixbt-score { display:grid; grid-template-columns:64px 1fr 38px; align-items:center; gap:8px; }
	.aixbt-score-k { font-size:10px; text-transform:uppercase; letter-spacing:0.05em; color:var(--cc-muted,#9a9aa2); }
	.aixbt-score-track { height:5px; border-radius:3px; background:rgba(255,255,255,0.08); overflow:hidden; }
	.aixbt-score-fill { display:block; height:100%; background:linear-gradient(90deg,#27e0c4,#7aa8ff); border-radius:3px; transition:width .4s ease; }
	.aixbt-score-v { font-size:11px; text-align:right; color:var(--cc-text,#e9e9ec); font-variant-numeric:tabular-nums; }
	.aixbt-skel { height:54px; border-radius:6px; background:linear-gradient(90deg,rgba(255,255,255,0.05),rgba(255,255,255,0.11),rgba(255,255,255,0.05)); background-size:200% 100%; animation:aixbt-shimmer 1.2s linear infinite; margin-bottom:8px; }
	@keyframes aixbt-shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
	.aixbt-empty, .aixbt-error { color:var(--cc-muted,#9a9aa2); font-size:13px; padding:14px 0; }
	.aixbt-error { color:#ffb4be; }
	.aixbt-setup { margin-top:8px; font-size:12px; color:var(--cc-muted,#9a9aa2); }`;
	document.head.appendChild(s);
}

// ── panel lifecycle (single instance, ESC, overlay click) ─────────────────────
let openPanel = null;

export function isAixbtPanelOpen() { return !!openPanel; }

function closePanel() {
	if (!openPanel) return;
	const { overlay, onKey, opener } = openPanel;
	document.removeEventListener('keydown', onKey, true);
	overlay.classList.remove('is-in');
	const node = overlay;
	setTimeout(() => node.remove(), 180);
	openPanel = null;
	if (opener && typeof opener.focus === 'function') opener.focus();
}

async function fetchJson(path) {
	const res = await fetch(path, { headers: { accept: 'application/json' } });
	const body = await res.json().catch(() => null);
	if (!res.ok || !body || body.error) {
		const err = new Error(body?.error_description || `request failed (${res.status})`);
		err.code = body?.error || `http_${res.status}`;
		err.setup = body?.setup;
		throw err;
	}
	return body;
}

function renderIntel(items) {
	if (!items.length) return el('div', { class: 'aixbt-empty', text: 'No fresh narratives for that filter.' });
	return el('div', {}, items.map((i) => el('div', { class: 'aixbt-row' }, [
		el('div', { class: 'aixbt-row-top' }, [
			i.ticker ? el('span', { class: 'aixbt-tkr', text: `$${i.ticker}` }) : (i.project ? el('span', { class: 'aixbt-tkr', text: i.project }) : null),
			i.category ? el('span', { class: 'aixbt-cat', text: i.category }) : null,
		]),
		i.description ? el('p', { class: 'aixbt-desc', text: i.description }) : null,
		el('div', { class: 'aixbt-meta' }, [
			i.observations != null ? el('span', { text: `${i.observations} observation${i.observations === 1 ? '' : 's'}` }) : null,
			i.official_source ? el('span', { class: 'aixbt-official', text: '✓ official source' }) : null,
		]),
	])));
}

function renderProjects(items) {
	if (!items.length) return el('div', { class: 'aixbt-empty', text: 'No projects matched that filter.' });
	return el('div', {}, items.map((p) => {
		const chg = p.market?.change_24h;
		const tone = chg == null ? 'flat' : chg > 0 ? 'up' : chg < 0 ? 'down' : 'flat';
		return el('div', { class: 'aixbt-row' }, [
			el('div', { class: 'aixbt-row-top' }, [
				el('span', { class: 'aixbt-tkr', text: p.ticker ? `$${p.ticker}` : (p.name || 'unknown') }),
				p.chain ? el('span', { class: 'aixbt-cat', text: p.chain }) : null,
				el('span', { class: `aixbt-chg ${tone}`, text: fmtPct(chg) }),
				p.market?.price_usd != null ? el('span', { class: 'aixbt-meta', text: fmtUsd(p.market.price_usd) }) : null,
			]),
			el('div', { class: 'aixbt-scores' }, [
				scoreBar('Spiking', p.scores?.spiking),
				scoreBar('Climbing', p.scores?.climbing),
				scoreBar('Active', p.scores?.active),
			]),
		]);
	}));
}

// Open aixbt's intelligence terminal. Auto-loads the live feed; the query bar
// re-runs it. Manages its own lifecycle (no return value).
export function openAixbtTerminal(npc, { ui } = {}) {
	injectStyles();
	closePanel();

	const titleId = 'aixbt-term-title';
	const card = el('div', { class: 'npc-svc-card is-aixbt', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId });
	const overlay = el('div', { class: 'npc-svc-overlay' }, [card]);
	overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) closePanel(); });

	const close = el('button', { class: 'npc-svc-close', type: 'button', 'aria-label': 'Close', text: '✕', onclick: closePanel });
	card.appendChild(el('header', { class: 'npc-svc-head' }, [
		el('div', {}, [
			npc?.def?.name ? el('div', { class: 'npc-svc-who', text: npc.def.name }) : null,
			el('h2', { id: titleId, class: 'npc-svc-title' }, ['Intelligence Terminal', el('span', { class: 'aixbt-live', text: 'LIVE' })]),
		]),
		close,
	]));
	card.appendChild(el('p', { class: 'npc-svc-intro', text: 'Live aixbt feed — narrative intel and momentum movers. Filter by token or chain.' }));

	// Query bar.
	const tokenInput = el('input', { class: 'npc-svc-input aixbt-token', type: 'text', placeholder: 'Token or ticker (optional)' });
	const chainSelect = el('select', { class: 'npc-svc-input aixbt-chain' }, CHAINS.map((c) =>
		el('option', { value: c.value }, [c.label])));
	const refreshBtn = el('button', { class: 'aixbt-refresh', type: 'button', text: 'Refresh' });
	// Keep typing out of the world's movement handlers (window-level keydown).
	for (const node of [tokenInput, chainSelect]) {
		node.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); run(); } });
		node.addEventListener('keyup', (e) => e.stopPropagation());
	}
	card.appendChild(el('div', { class: 'aixbt-bar' }, [tokenInput, chainSelect, refreshBtn]));

	const body = el('div', { class: 'npc-svc-result', style: 'display:block' });
	card.appendChild(body);

	function skeleton() {
		body.textContent = '';
		body.appendChild(el('div', { class: 'aixbt-section-h', text: 'Narratives' }));
		for (let i = 0; i < 3; i++) body.appendChild(el('div', { class: 'aixbt-skel' }));
	}

	let busy = false;
	async function run() {
		if (busy) return;
		busy = true;
		refreshBtn.disabled = true;
		refreshBtn.textContent = 'Loading…';
		skeleton();
		const token = tokenInput.value.trim();
		const chain = chainSelect.value;
		const intelQs = new URLSearchParams({ limit: '6' });
		if (chain) intelQs.set('chain', chain);
		const projQs = new URLSearchParams({ limit: '6' });
		if (chain) projQs.set('chain', chain);
		if (token) projQs.set('names', token);

		try {
			const [intelRes, projRes] = await Promise.all([
				fetchJson(`/api/aixbt/intel?${intelQs}`),
				fetchJson(`/api/aixbt/projects?${projQs}`),
			]);
			body.textContent = '';
			body.appendChild(el('div', { class: 'aixbt-section-h', text: token ? `Momentum · ${token.toUpperCase()}` : 'Momentum' }));
			body.appendChild(renderProjects(projRes.projects || []));
			body.appendChild(el('div', { class: 'aixbt-section-h', text: 'Narratives' }));
			body.appendChild(renderIntel(intelRes.intel || []));
			npc?.say?.(
				(projRes.projects || []).length || (intelRes.intel || []).length
					? 'Here\'s what the feed is showing right now.'
					: 'Quiet on that filter — try a broader chain.',
			);
		} catch (err) {
			body.textContent = '';
			if (err?.code === 'aixbt_not_configured') {
				body.appendChild(el('div', { class: 'aixbt-error', text: 'aixbt isn\'t connected on this deployment yet.' }));
				if (err.setup) body.appendChild(el('div', { class: 'aixbt-setup', text: err.setup }));
				npc?.say?.('My feed isn\'t wired up here yet.');
			} else {
				body.appendChild(el('div', { class: 'aixbt-error', text: `Couldn't reach the aixbt feed: ${err.message}` }));
				body.appendChild(el('button', { class: 'aixbt-refresh', type: 'button', text: 'Retry', style: 'margin-top:10px', onclick: run }));
				ui?.toast?.('aixbt feed unavailable', 'warn');
			}
		} finally {
			busy = false;
			refreshBtn.disabled = false;
			refreshBtn.textContent = 'Refresh';
		}
	}
	refreshBtn.addEventListener('click', run);

	// Mount + ESC + autoload.
	const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
	const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); closePanel(); } };
	document.addEventListener('keydown', onKey, true);
	document.body.appendChild(overlay);
	openPanel = { overlay, onKey, opener };
	requestAnimationFrame(() => {
		overlay.classList.add('is-in');
		run();
	});
}
