// Granite Proof — the on-chain AI notary (frontend logic).
//
// Drives /api/ibm/attest: fetches a live token's Granite TimeSeries forecast,
// shows the Granite Guardian governance verdict, renders the forecast on a
// canvas, makes the 3D agent speak the Granite narration, and notarizes the
// governed forecast on Solana. Plain ES module — no build-time imports — so the
// page also works when served outside the bundler.

// Same-origin by default; ?api=<base> lets a local dev server (see
// scripts/dev-ibm-proof.mjs) point the page at the real endpoint while /api/*
// otherwise proxies to production.
const API = new URLSearchParams(location.search).get('api') || '';
const attestUrl = (qs) => `${API}/api/ibm/attest${qs}`;

const $ = (id) => document.getElementById(id);
const state = { pools: [], current: null, busy: false };

// ── number + label helpers ───────────────────────────────────────────────────
function fmtPrice(n) {
	if (!Number.isFinite(n)) return '—';
	if (n === 0) return '0';
	const abs = Math.abs(n);
	if (abs >= 1000) return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });
	if (abs >= 1) return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 2 });
	if (abs >= 0.001) return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 5 });
	return '$' + n.toExponential(2);
}
function fmtPct(n) {
	if (!Number.isFinite(n)) return '—';
	return (n >= 0 ? '+' : '') + n.toFixed(2) + '%';
}
const MOOD_COLOR = { celebration: '#42be65', curiosity: '#78a9ff', patience: '#8a93a6', empathy: '#f1c21b', concern: '#fa4d56' };
const MOOD_ANIM = { celebration: 'celebrate', curiosity: 'wave', patience: 'idle', empathy: 'idle', concern: 'idle' };
// The embed applies ARKit-52 morphs by name (v1.avatar.morphs). Each mood is a
// blend; we always send the full key set (zeros included) so switching moods
// clears the previous expression rather than stacking.
const NEUTRAL_MORPHS = {
	mouthSmileLeft: 0, mouthSmileRight: 0, cheekSquintLeft: 0, cheekSquintRight: 0,
	mouthFrownLeft: 0, mouthFrownRight: 0, browInnerUp: 0, browDownLeft: 0, browDownRight: 0,
	jawOpen: 0, eyeWideLeft: 0, eyeWideRight: 0,
};
const MOOD_MORPHS = {
	celebration: { ...NEUTRAL_MORPHS, mouthSmileLeft: 0.9, mouthSmileRight: 0.9, cheekSquintLeft: 0.45, cheekSquintRight: 0.45 },
	curiosity: { ...NEUTRAL_MORPHS, browInnerUp: 0.5, eyeWideLeft: 0.5, eyeWideRight: 0.5, mouthSmileLeft: 0.3, mouthSmileRight: 0.3 },
	patience: { ...NEUTRAL_MORPHS },
	empathy: { ...NEUTRAL_MORPHS, mouthSmileLeft: 0.25, mouthSmileRight: 0.25, browInnerUp: 0.4 },
	concern: { ...NEUTRAL_MORPHS, mouthFrownLeft: 0.65, mouthFrownRight: 0.65, browInnerUp: 0.55 },
};

// ── 3D avatar bridge (queue until the iframe handshakes ready) ───────────────
const avatar = (() => {
	const frame = $('avatar');
	const origin = location.origin;
	const q = new URLSearchParams({ model: '/avatars/default.glb', bg: 'transparent', idle: 'on', name: '0', animPicker: '0', chrome: '0' });
	frame.src = `/avatar-embed.html?${q.toString()}`;
	let ready = false;
	const queue = [];
	const send = (msg) => {
		if (ready) frame.contentWindow?.postMessage(msg, origin);
		else queue.push(msg);
	};
	window.addEventListener('message', (e) => {
		const t = e.data?.type;
		if (t === 'v1.avatar.ready' || t === 'v1.avatar.online') {
			ready = true;
			while (queue.length) frame.contentWindow?.postMessage(queue.shift(), origin);
		}
	});
	frame.addEventListener('load', () => {
		frame.contentWindow?.postMessage({ type: 'v1.avatar.hello' }, origin);
		// best-effort flush in case the ready event raced the listener
		setTimeout(() => { while (queue.length) frame.contentWindow?.postMessage(queue.shift(), origin); }, 1200);
	});
	return {
		speak: (text) => text && send({ type: 'v1.avatar.speak', text: String(text).slice(0, 600) }),
		morphs: (weights) => weights && send({ type: 'v1.avatar.morphs', weights }),
		animate: (name) => name && send({ type: 'v1.avatar.animation', name }),
	};
})();

function setMood(mood) {
	const sw = $('mood-sw');
	const tx = $('mood-tx');
	if (!mood) { sw.style.background = 'var(--faint)'; tx.textContent = 'awaiting forecast'; return; }
	sw.style.background = MOOD_COLOR[mood.emotion] || 'var(--faint)';
	tx.textContent = `${mood.emotion} · sentiment ${mood.sentiment >= 0 ? '+' : ''}${mood.sentiment}`;
	avatar.morphs(MOOD_MORPHS[mood.emotion] || NEUTRAL_MORPHS);
	avatar.animate(MOOD_ANIM[mood.emotion] || 'idle');
}
function setCaption(text) {
	const el = $('caption');
	if (!text) { el.classList.remove('on'); return; }
	$('caption-tx').textContent = text;
	el.classList.add('on');
}

// ── canvas forecast chart ─────────────────────────────────────────────────────
const chart = $('chart');
function drawChart(data) {
	const ctx = chart.getContext('2d');
	const dpr = Math.min(window.devicePixelRatio || 1, 2);
	const cssW = chart.clientWidth || chart.parentElement.clientWidth;
	const cssH = 300;
	chart.width = Math.round(cssW * dpr);
	chart.height = Math.round(cssH * dpr);
	ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
	ctx.clearRect(0, 0, cssW, cssH);
	if (!data) return;

	const pad = { l: 12, r: 12, t: 16, b: 14 };
	const W = cssW - pad.l - pad.r;
	const H = cssH - pad.t - pad.b;

	const hist = (data.history || []).map((p) => ({ t: p.t, c: Number(p.c) })).filter((p) => Number.isFinite(p.c));
	// show the tail of history so the forecast is legible
	const histTail = hist.slice(-160);
	const fc = (data.forecast || []).map((p) => ({ t: p.t, c: Number(p.c) })).filter((p) => Number.isFinite(p.c));
	const all = histTail.concat(fc);
	if (all.length < 2) return;

	const ys = all.map((p) => p.c);
	let trueLo = Math.min(...ys), trueHi = Math.max(...ys);
	if (data.stats) { trueLo = Math.min(trueLo, data.stats.forecastLow); trueHi = Math.max(trueHi, data.stats.forecastHigh); }
	const span = trueHi - trueLo || trueHi || 1;
	const lo = trueLo - span * 0.08, hi = trueHi + span * 0.08;
	const n = all.length;
	const x = (i) => pad.l + (i / (n - 1)) * W;
	const y = (v) => pad.t + (1 - (v - lo) / (hi - lo)) * H;

	// gridlines
	ctx.strokeStyle = 'rgba(40,49,66,0.5)';
	ctx.lineWidth = 1;
	for (let g = 0; g <= 3; g++) {
		const gy = pad.t + (g / 3) * H;
		ctx.beginPath(); ctx.moveTo(pad.l, gy); ctx.lineTo(pad.l + W, gy); ctx.stroke();
	}

	const splitX = histTail.length ? x(histTail.length - 1) : pad.l;

	// forecast range band
	if (fc.length && data.stats) {
		ctx.fillStyle = 'rgba(120,169,255,0.10)';
		ctx.fillRect(splitX, y(data.stats.forecastHigh), pad.l + W - splitX, y(data.stats.forecastLow) - y(data.stats.forecastHigh));
	}

	// history line
	ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.strokeStyle = '#8a93a6';
	ctx.beginPath();
	histTail.forEach((p, i) => { const px = x(i), py = y(p.c); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
	ctx.stroke();

	// forecast line (bright), continuing from the last history point
	if (fc.length) {
		ctx.strokeStyle = '#78a9ff'; ctx.lineWidth = 2.4;
		ctx.beginPath();
		const startI = histTail.length - 1;
		ctx.moveTo(x(startI), y(histTail[startI].c));
		fc.forEach((p, i) => ctx.lineTo(x(histTail.length + i), y(p.c)));
		ctx.stroke();

		// now divider
		ctx.strokeStyle = 'rgba(120,169,255,0.4)'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
		ctx.beginPath(); ctx.moveTo(splitX, pad.t); ctx.lineTo(splitX, pad.t + H); ctx.stroke();
		ctx.setLineDash([]);

		// endpoint dot
		const last = fc[fc.length - 1];
		ctx.fillStyle = '#78a9ff';
		ctx.beginPath(); ctx.arc(x(n - 1), y(last.c), 3.5, 0, Math.PI * 2); ctx.fill();
		ctx.beginPath(); ctx.arc(x(n - 1), y(last.c), 8, 0, Math.PI * 2); ctx.fillStyle = 'rgba(120,169,255,0.18)'; ctx.fill();
	} else {
		// no forecast — mark the current price
		const li = histTail.length - 1;
		ctx.fillStyle = '#8a93a6';
		ctx.beginPath(); ctx.arc(x(li), y(histTail[li].c), 3, 0, Math.PI * 2); ctx.fill();
	}

	// axis labels — true price range + the now / horizon markers
	ctx.font = '11px ui-monospace, "SF Mono", monospace';
	ctx.textAlign = 'left';
	ctx.fillStyle = '#5a6376';
	ctx.textBaseline = 'top'; ctx.fillText(fmtPrice(trueHi), pad.l + 3, y(trueHi) + 2);
	ctx.textBaseline = 'bottom'; ctx.fillText(fmtPrice(trueLo), pad.l + 3, y(trueLo) - 2);
	if (fc.length) {
		ctx.fillStyle = '#78a9ff';
		ctx.textBaseline = 'top'; ctx.textAlign = 'center';
		ctx.fillText('now', splitX, pad.t + 2);
		const hz = data.stats?.horizonHours;
		if (hz) { ctx.textAlign = 'right'; ctx.fillText(`+${hz}h`, pad.l + W - 3, pad.t + 2); }
		ctx.textAlign = 'left';
	}
}

// ── render: stats / governance / proof / action ──────────────────────────────
function renderStats(data) {
	const s = data.stats;
	if (!s) { ['s-cur', 's-fc', 's-chg', 's-hz'].forEach((id) => ($(id).textContent = '—')); $('s-cur').textContent = fmtPrice(Number(data.history?.at(-1)?.c)); return; }
	$('s-cur').textContent = fmtPrice(s.currentPrice);
	$('s-fc').textContent = fmtPrice(s.forecastEnd);
	const chg = $('s-chg');
	chg.textContent = fmtPct(s.changePct);
	chg.className = 'v ' + (s.changePct >= 0 ? 'up' : 'down');
	$('s-hz').textContent = `${s.horizonHours}h`;
}

function renderGovernance(data) {
	const gov = $('gov'), shield = $('gov-shield'), title = $('gov-title'), sub = $('gov-sub'), model = $('gov-model');
	gov.classList.remove('passed', 'flagged');
	const g = data.governance;
	if (!g) {
		title.textContent = data.ibm?.configured === false ? 'Granite offline' : 'Forecast unavailable';
		sub.textContent = data.ibm?.reason || data.ibm?.error || 'Showing live history only.';
		model.textContent = '';
		return;
	}
	if (g.passed === true) {
		gov.classList.add('passed');
		shield.querySelector('svg').setAttribute('stroke', 'var(--up)');
		title.textContent = 'Passed Granite Guardian';
		sub.textContent = 'The narration cleared the governance check and may be notarized.';
	} else if (g.passed === false) {
		gov.classList.add('flagged');
		shield.querySelector('svg').setAttribute('stroke', 'var(--down)');
		title.textContent = 'Flagged by Granite Guardian';
		sub.textContent = 'Governance veto — the agent will not put this statement on-chain.';
	} else {
		title.textContent = 'Guardian inconclusive';
		sub.textContent = g.error ? String(g.error).slice(0, 80) : 'Could not reach Granite Guardian.';
	}
	model.textContent = g.model || '';
}

function renderProof(data) {
	const proof = $('proof');
	if (!data.proof) { proof.hidden = true; return; }
	proof.hidden = false;
	$('p-digest').textContent = data.proof.digest;
	$('p-memo').textContent = data.proof.memo;
	const m = data.proof.claim?.models || {};
	$('p-models').innerHTML = [
		['TimeSeries', m.timeseries],
		['Narrator', m.narrator],
		['Guardian', m.guardian],
	].filter(([, v]) => v).map(([k, v]) => `<span class="m"><b>${k}</b> ${v}</span>`).join('');
	const at = data.attester?.address;
	$('p-attester').innerHTML = at
		? `<a href="${data.attester.explorer}" target="_blank" rel="noopener" style="color:var(--ibm-light);text-decoration:none">${at}</a>`
		: '<span style="color:var(--faint)">not configured — set AVATAR_WALLET_SECRET to enable notarization</span>';
}

function renderAction(data) {
	const action = $('action');
	const oc = data.onchain || {};
	action.innerHTML = '';
	hideNotice();

	if (!data.proof) {
		// nothing to notarize yet
		if (data.ibm?.configured === false) {
			showNotice('warn', 'Granite is offline in this deployment — showing live history only. Set <code>WATSONX_API_KEY</code> + <code>WATSONX_PROJECT_ID</code> to forecast, govern, and notarize.');
		}
		return;
	}
	if (data.governance?.passed === false) {
		showNotice('warn', 'Granite Guardian flagged this narration. The agent refuses to notarize a statement that fails governance — that is the point.');
		return;
	}

	const btn = document.createElement('button');
	btn.className = 'btn btn-primary';
	if (!oc.ready || !data.attester?.address) {
		btn.disabled = true;
		btn.innerHTML = svgLock() + 'Notarize on Solana';
		showNotice('warn', oc.reason === 'attester wallet not configured (AVATAR_WALLET_SECRET)' || !data.attester?.address
			? 'The attester wallet is not configured here. Set <code>AVATAR_WALLET_SECRET</code> (a funded Solana key) to let the agent sign proofs on-chain.'
			: (oc.reason || 'Notarization unavailable.'));
	} else {
		btn.innerHTML = svgChain() + `Notarize on Solana (${data.attester.network})`;
		btn.addEventListener('click', () => notarize(data));
	}
	action.appendChild(btn);
}

function svgChain() { return '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg>'; }
function svgLock() { return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>'; }

function showNotice(kind, html) { const n = $('notice'); n.hidden = false; n.className = 'notice ' + (kind || ''); n.innerHTML = html; }
function hideNotice() { const n = $('notice'); n.hidden = true; n.innerHTML = ''; }

// ── notarize (POST submit) ───────────────────────────────────────────────────
async function notarize(data) {
	if (state.busy) return;
	state.busy = true;
	const btn = $('action').querySelector('button');
	if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Signing &amp; broadcasting…'; }
	avatar.speak('Signing the forecast and committing it to Solana.');
	try {
		const r = await fetch(attestUrl(''), {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ pool: data.token.pool, network: data.token.network, submit: true }),
		});
		const out = await r.json();
		const oc = out.onchain || {};
		if (oc.submitted && oc.signature) {
			showNotice('ok', `Notarized on-chain. <a href="${oc.explorer}" target="_blank" rel="noopener">View on Solscan ↗</a>`);
			avatar.speak('Done. The forecast is now permanently on-chain — anyone can verify it.');
			avatar.animate('celebrate');
			addToFeed(out);
		} else {
			showNotice('warn', oc.error || oc.reason || 'Notarization did not complete.');
		}
	} catch (e) {
		showNotice('warn', 'Network error while notarizing: ' + (e?.message || e));
	} finally {
		state.busy = false;
		if (btn) { btn.disabled = false; btn.innerHTML = svgChain() + 'Notarize again'; }
	}
}

// ── session feed (localStorage) ───────────────────────────────────────────────
const FEED_KEY = 'ibm-proof-feed-v1';
function loadFeed() { try { return JSON.parse(localStorage.getItem(FEED_KEY) || '[]'); } catch { return []; } }
function saveFeed(items) { try { localStorage.setItem(FEED_KEY, JSON.stringify(items.slice(0, 30))); } catch { /* quota */ } }
function addToFeed(out) {
	const items = loadFeed();
	items.unshift({
		symbol: out.token?.symbol || '?',
		dir: out.stats?.direction || 'flat',
		changePct: out.stats?.changePct ?? 0,
		digest: out.proof?.digest || '',
		signature: out.onchain?.signature || '',
		explorer: out.onchain?.explorer || '',
		at: out.generatedAt || new Date().toISOString(),
	});
	saveFeed(items);
	renderFeed();
}
function renderFeed() {
	const el = $('feed');
	const items = loadFeed();
	if (!items.length) { el.innerHTML = '<div class="feed-empty">No proofs yet. Run a forecast and notarize it — each one lands here with a Solscan link.</div>'; return; }
	el.innerHTML = items.map((it) => {
		const cls = it.dir === 'up' ? 'up' : it.dir === 'down' ? 'down' : '';
		const arrow = it.dir === 'up' ? '▲' : it.dir === 'down' ? '▼' : '—';
		return `<div class="attestation">
			<div class="badge2 ${cls}">${arrow}</div>
			<div class="meta"><div class="l1">${it.symbol} · ${fmtPct(it.changePct)}</div><div class="l2">${it.digest.slice(0, 40)}…</div></div>
			${it.explorer ? `<a class="tx" href="${it.explorer}" target="_blank" rel="noopener">Solscan ↗</a>` : '<span class="l2">pending</span>'}
		</div>`;
	}).join('');
}

// ── token picker ──────────────────────────────────────────────────────────────
function renderPicker() {
	const el = $('picker');
	el.innerHTML = state.pools.map((p, i) => {
		const sym = (p.name || '?').split('/')[0].trim() || '?';
		const nm = p.name || '';
		const px = p.priceUsd != null ? fmtPrice(Number(p.priceUsd)) : '';
		const chg = p.change24h != null
			? `<span style="color:${p.change24h >= 0 ? 'var(--up)' : 'var(--down)'};margin-left:7px">${p.change24h >= 0 ? '+' : ''}${Number(p.change24h).toFixed(1)}%</span>`
			: '';
		return `<button class="chip" role="tab" data-pool="${p.pool}" aria-selected="${i === 0 ? 'true' : 'false'}">
			<span class="sym">${sym}</span><span class="nm">${nm}</span><span class="px">${px}${chg}</span>
		</button>`;
	}).join('');
	el.querySelectorAll('.chip').forEach((c) => c.addEventListener('click', () => {
		el.querySelectorAll('.chip').forEach((x) => x.setAttribute('aria-selected', 'false'));
		c.setAttribute('aria-selected', 'true');
		select(c.dataset.pool);
	}));
}

async function select(pool) {
	if (!pool) return;
	$('token-tag').textContent = 'loading…';
	setCaption(''); setMood(null);
	try {
		const r = await fetch(attestUrl(`?pool=${encodeURIComponent(pool)}&timeframe=hour`));
		if (!r.ok) throw new Error(`endpoint ${r.status}`);
		const data = await r.json();
		state.current = data;
		$('token-tag').textContent = `${data.token.symbol} · ${data.token.network}`;
		$('agent-net').textContent = data.attester?.network || 'mainnet';
		drawChart(data);
		renderStats(data);
		renderGovernance(data);
		renderProof(data);
		renderAction(data);
		setMood(data.mood);
		if (data.narration?.text) { setCaption(data.narration.text); avatar.speak(data.narration.text); }
		else setCaption('');
	} catch (e) {
		$('token-tag').textContent = '';
		showNotice('warn', `Could not load the forecast (${e?.message || e}). In local dev, /api/* proxies to production — this endpoint resolves once deployed, or run scripts/dev-ibm-proof.mjs.`);
		drawChart(null);
	}
}

// ── copy buttons ──────────────────────────────────────────────────────────────
document.addEventListener('click', (e) => {
	const btn = e.target.closest('.copy');
	if (!btn) return;
	const which = btn.dataset.copy;
	const val = which === 'digest' ? state.current?.proof?.digest : state.current?.proof?.memo;
	if (val) navigator.clipboard?.writeText(val).then(() => { const o = btn.textContent; btn.textContent = 'copied'; setTimeout(() => (btn.textContent = o), 1200); });
});

let resizeT;
window.addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(() => state.current && drawChart(state.current), 120); });

// ── boot ──────────────────────────────────────────────────────────────────────
(async function boot() {
	renderFeed();
	try {
		const r = await fetch(attestUrl('?list=trending'));
		const j = await r.json();
		state.pools = (j.pools || []).slice(0, 8);
		if (!state.pools.length) throw new Error('no trending pools');
		renderPicker();
		select(state.pools[0].address || state.pools[0].pool);
	} catch (e) {
		$('picker').innerHTML = `<div class="notice warn" style="flex:1">Could not load trending tokens (${e?.message || e}). In local dev, /api/* proxies to production; this resolves once the endpoint is deployed, or run <code>node scripts/dev-ibm-proof.mjs</code>.</div>`;
	}
})();
