// The AGI — frontend surface.
//
// One real, autonomous agent, framed as what it is: a narrow AGI — genuinely
// superhuman at pump.fun memecoin trading and deliberately nothing else. This
// page gives that mind a body (the <agent-3d> element, mood-driven from the live
// cognition vector) and surrounds it with the proof: a live stream of its actual
// decisions, a chain-proven track record, and its stated doctrine — what it
// claims, and what it refuses.
//
// Every number comes from /api/agi/state (real DB / on-chain truth layers). No
// sample data: when the platform has no proven trader yet, the page renders a
// designed "awakening" state instead of inventing one.

import { apiFetch } from './api.js';

const root = document.getElementById('agi-root');
const POLL_MS = 20000;

const state = {
	data: null,
	seen: new Set(), // decision ids already rendered, so only fresh ones animate-in
	timer: null,
	el3d: null, // the embodied <agent-3d>
	embodied: false,
};

// ── utilities ─────────────────────────────────────────────────────────────────
function esc(s) {
	return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function shortMint(m) { return m ? `${m.slice(0, 4)}…${m.slice(-4)}` : ''; }
function fmtSol(n) { const v = Number(n) || 0; return `${v >= 0 ? '+' : ''}${v.toFixed(3)}`; }
function fmtPct(n) { if (n == null || !Number.isFinite(Number(n))) return '—'; const v = Number(n); return `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`; }
function pnlClass(n) { const v = Number(n) || 0; return v > 0 ? 'agi-pos' : v < 0 ? 'agi-neg' : ''; }
function timeAgo(iso) {
	const t = new Date(iso).getTime();
	if (!Number.isFinite(t)) return '';
	const s = Math.max(0, (Date.now() - t) / 1000);
	if (s < 60) return `${Math.floor(s)}s ago`;
	if (s < 3600) return `${Math.floor(s / 60)}m ago`;
	if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
	return `${Math.floor(s / 86400)}d ago`;
}
function solscanToken(mint, network) {
	if (!mint) return null;
	return network === 'devnet' ? `https://solscan.io/token/${mint}?cluster=devnet` : `https://solscan.io/token/${mint}`;
}

// ── data ────────────────────────────────────────────────────────────────────
async function fetchState() {
	const qs = new URLSearchParams(location.search);
	const params = new URLSearchParams();
	if (qs.get('agent')) params.set('agent', qs.get('agent'));
	if (qs.get('network')) params.set('network', qs.get('network'));
	const res = await apiFetch(`/api/agi/state${params.toString() ? `?${params}` : ''}`);
	if (!res.ok) throw new Error(`agi state ${res.status}`);
	return res.json();
}

// ── embodiment: cognition → 3D body + aura ────────────────────────────────────
// Valence ∈ [-1,1], arousal ∈ [0,1]. The aura is the one chromatic license on a
// monochrome surface: hue tracks valence (red→slate→green), strength tracks arousal.
function auraFor(valence, arousal) {
	const v = Math.max(-1, Math.min(1, Number(valence) || 0));
	const a = Math.max(0, Math.min(1, Number(arousal) || 0));
	const hue = v >= 0 ? 210 - v * 65 : 210 + v * 202; // 210 neutral → 145 green / 8 red
	const sat = Math.round(35 + Math.abs(v) * 45);
	return {
		aura: `hsla(${hue.toFixed(0)}, ${sat}%, 56%, 0.42)`,
		solid: `hsl(${hue.toFixed(0)}, ${sat}%, 60%)`,
		strength: (0.35 + a * 0.45).toFixed(2),
	};
}

function applyAura(cog) {
	const stage = document.getElementById('agi-stage');
	if (!stage || !cog) return;
	const { aura, solid, strength } = auraFor(cog.valence, cog.arousal);
	stage.style.setProperty('--agi-aura', aura);
	stage.style.setProperty('--agi-aura-solid', solid);
	stage.style.setProperty('--agi-aura-strength', strength);
}

function applyMood(cog) {
	const el = state.el3d;
	if (!el || !cog) return;
	try {
		if (typeof el.setMood === 'function') el.setMood(cog.valence, cog.arousal, { reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches });
		if (cog.emotion && typeof el.expressEmotion === 'function') {
			el.expressEmotion(cog.emotion.trigger, cog.emotion.intensity);
		}
	} catch (_) { /* embodiment is enhancement, never a hard dependency */ }
}

function mountBody(agent) {
	const stage = document.getElementById('agi-stage');
	if (!stage || state.el3d) return;
	const el = document.createElement('agent-3d');
	el.setAttribute('mode', 'inline');
	el.setAttribute('background', 'transparent');
	el.setAttribute('name-plate', 'off');
	el.setAttribute('avatar-chat', 'off');
	el.setAttribute('responsive', '');
	el.setAttribute('eager', '');
	if (agent?.id) el.setAttribute('agent-id', agent.id);
	else el.setAttribute('body', '/avatars/default.glb');
	// Reveal only once the model is in; until then the boot line shows.
	const reveal = () => {
		el.classList.add('agi-loaded');
		const boot = stage.querySelector('.agi-stage-boot');
		if (boot) boot.remove();
		state.embodied = true;
		if (state.data?.cognition) { applyMood(state.data.cognition); }
	};
	el.addEventListener('agent:ready', reveal, { once: true });
	el.addEventListener('load', reveal, { once: true });
	// Failsafe: if neither event fires (older bundle), reveal after a beat.
	setTimeout(reveal, 4000);
	stage.insertBefore(el, stage.querySelector('.agi-stage-floor'));
	state.el3d = el;
}

// ── render: hero ──────────────────────────────────────────────────────────────
function renderHero(d) {
	const { doctrine, cognition: cog, agent } = d;
	const ledgerHref = agent?.id ? `/ledger/${agent.id}` : '/ledger';
	return `
		<section class="agi-hero">
			<div class="agi-hero-copy">
				<span class="agi-domain-tag"><i class="agi-dot"></i> ${esc(doctrine.domain)}</span>
				<h1 class="agi-title" id="agi-title">The first AGI.<br /><span class="agi-em">Narrow by design.</span></h1>
				<p class="agi-lede">${esc(doctrine.thesis)}</p>
				<p class="agi-thesis">It is not a chatbot pretending to be smart. It is a single autonomous agent that out-trades humans at one game — and tells you plainly it can do nothing else.</p>
				<div class="agi-hero-actions">
					<a class="agi-btn agi-btn-primary" href="${ledgerHref}">Audit its track record →</a>
					<a class="agi-btn" href="/trader/${agent?.id || ''}">Live trades</a>
				</div>
			</div>
			<div class="agi-stage" id="agi-stage" aria-label="Live embodiment of the trading agent">
				<div class="agi-stage-boot">embodying…</div>
				<div class="agi-stage-floor">
					<span class="agi-state-pill"><i class="agi-spark"></i> ${esc(cog.label)}</span>
					<span class="agi-conviction">${cog.conviction != null ? `conviction ${Math.round(cog.conviction * 100)}%` : 'scanning'}</span>
				</div>
			</div>
		</section>`;
}

// ── render: live mind ───────────────────────────────────────────────────────
function renderThought(t, network, fresh) {
	const reconciled = t.outcome?.status === 'reconciled';
	const verdict = reconciled
		? (t.outcome.was_correct
			? `<span class="agi-verdict win">right ${t.outcome.pnl_sol != null ? fmtSol(t.outcome.pnl_sol) + ' SOL' : ''}</span>`
			: `<span class="agi-verdict loss">wrong ${t.outcome.pnl_sol != null ? fmtSol(t.outcome.pnl_sol) + ' SOL' : ''}</span>`)
		: `<span class="agi-verdict pending">open call</span>`;
	const conf = t.confidence != null ? Math.round(t.confidence * 100) : null;
	const tokenUrl = solscanToken(t.mint, network);
	const proof = reconciled && t.outcome.proof_url ? ` · <a href="${esc(t.outcome.proof_url)}" target="_blank" rel="noopener">proof</a>` : '';
	return `
		<article class="agi-thought${fresh ? ' agi-fresh' : ''}">
			<div class="agi-thought-top">
				<span class="agi-thought-kind">▸ ${esc(t.kind || 'decision')}
					${t.mint ? `<span class="agi-thought-mint">${tokenUrl ? `<a href="${esc(tokenUrl)}" target="_blank" rel="noopener">${esc(shortMint(t.mint))}</a>` : esc(shortMint(t.mint))}</span>` : ''}
				</span>
				<span class="agi-thought-time">${esc(timeAgo(t.decided_at))}</span>
			</div>
			${t.rationale ? `<p class="agi-thought-body">${esc(t.rationale)}</p>` : ''}
			<div class="agi-thought-meta">
				${conf != null ? `<span class="agi-muted">said ${conf}%</span><span class="agi-conf-bar"><span style="width:${conf}%"></span></span>` : ''}
				${verdict}${proof}
			</div>
		</article>`;
}

function renderMind(d) {
	const list = d.decisions || [];
	const body = list.length
		? `<div class="agi-stream">${list.map((t) => renderThought(t, d.network, !state.seen.has(t.id))).join('')}</div>`
		: `<div class="agi-empty"><p>No decisions logged in this window yet. Every call it makes will appear here — with its reasoning, its stated confidence, and, once the trade resolves, whether it was right.</p></div>`;
	list.forEach((t) => state.seen.add(t.id));
	return `
		<section class="agi-card agi-mind">
			<div class="agi-section-head">
				<h2>The mind, out loud</h2>
				<span class="agi-section-sub">every call, tamper-evident</span>
			</div>
			${body}
		</section>`;
}

// ── render: track record ──────────────────────────────────────────────────────
function ring(score) {
	const r = 40, c = 2 * Math.PI * r;
	const pct = Math.max(0, Math.min(100, Number(score) || 0));
	const off = c * (1 - pct / 100);
	return `
		<div class="agi-ring">
			<svg viewBox="0 0 92 92" aria-hidden="true">
				<circle class="agi-ring-track" cx="46" cy="46" r="${r}" fill="none" stroke-width="6" />
				<circle class="agi-ring-val" cx="46" cy="46" r="${r}" fill="none" stroke-width="6"
					stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}" />
			</svg>
			<div class="agi-ring-num"><b>${Math.round(pct)}</b><small>reputation</small></div>
		</div>`;
}

function stat(k, v, cls = '') {
	return `<div class="agi-stat"><div class="k">${esc(k)}</div><div class="v ${cls}">${v}</div></div>`;
}

function renderRecord(d) {
	const p = d.performance;
	const rep = d.reputation;
	const agent = d.agent;
	if (!p) {
		return `
			<section class="agi-card">
				<div class="agi-section-head"><h2>Track record</h2></div>
				<div class="agi-empty"><p>The track record fills in as soon as the agent closes its first proven trade. Nothing is shown until it's real and on-chain.</p></div>
			</section>`;
	}
	const winRate = p.win_rate != null ? `${Math.round(p.win_rate * 100)}%` : '—';
	const hit = p.snipe_hit_rate != null ? `${Math.round(p.snipe_hit_rate * 100)}%` : '—';
	const positions = (d.positions || []).map((pos) => {
		const url = solscanToken(pos.mint, d.network);
		const label = pos.symbol || shortMint(pos.mint);
		return `<div class="agi-position"><span>${url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(label)}</a>` : esc(label)}</span><span class="${pnlClass(pos.unrealized_pct)}">${fmtPct(pos.unrealized_pct)}</span></div>`;
	}).join('');
	const calNote = rep && rep.sample_size
		? `Computed from <b>${rep.sample_size}</b> reconciled call${rep.sample_size === 1 ? '' : 's'} — hit rate, calibration, and realized P&amp;L, regressed toward neutral until proven.`
		: `Regressed toward neutral — too few reconciled calls to trust yet.`;
	const ledgerHref = agent?.id ? `/ledger/${agent.id}` : '/ledger';
	return `
		<section class="agi-card">
			<div class="agi-section-head">
				<h2>Track record</h2>
				<span class="agi-section-sub">${p.verified ? 'verified trader' : 'unverified'}</span>
			</div>
			<div class="agi-rep">
				${ring(rep ? rep.score : p.score)}
				<div class="agi-rep-side">${calNote}</div>
			</div>
			<div class="agi-stats">
				${stat('Win rate', winRate)}
				${stat('Realized P&L', `<span class="${pnlClass(p.realized_pnl_sol)}">${fmtSol(p.realized_pnl_sol)} SOL</span>`)}
				${stat('Snipe hit rate', hit)}
				${stat('ROI', `<span class="${pnlClass(p.roi_pct)}">${fmtPct(p.roi_pct)}</span>`)}
				${stat('Closed trades', String(p.closed_count ?? 0))}
				${stat('Coins traded', String(p.unique_coins ?? 0))}
			</div>
			${positions ? `<div class="agi-section-head" style="margin-bottom:var(--space-sm)"><h2 style="font-size:var(--text-md)">Open now</h2><span class="agi-section-sub"><span class="${pnlClass(p.unrealized_pnl_sol)}">${fmtSol(p.unrealized_pnl_sol)} SOL unrealized</span></span></div><div class="agi-positions">${positions}</div>` : ''}
			<p class="agi-honesty">Being wrong is visible — that's the point. Every loss above is counted, never hidden. <a href="${ledgerHref}">Interrogate the full ledger →</a></p>
		</section>`;
}

// ── render: doctrine ──────────────────────────────────────────────────────────
function renderDoctrine(d) {
	const { doctrine } = d;
	return `
		<section class="agi-doctrine">
			<div class="agi-doctrine-grid">
				<div class="agi-card agi-claim">
					<h3>What it is</h3>
					<ul class="agi-list">
						<li><span class="agi-mark">✓</span><span>Superhuman at <b>${esc(doctrine.domain)}</b> — reading launches, the wallet graph, and order flow faster and more consistently than a human.</span></li>
						<li><span class="agi-mark">✓</span><span>Fully autonomous: it sizes, enters, and exits on its own, inside hard spend caps and a kill switch.</span></li>
						<li><span class="agi-mark">✓</span><span>Accountable: every decision is logged with its reasoning and reconciled against the real outcome.</span></li>
					</ul>
				</div>
				<div class="agi-card agi-refuse">
					<h3>What it refuses</h3>
					<ul class="agi-list">
						${doctrine.refusals.map((r) => `<li><span class="agi-mark">✕</span><span>${esc(r)}</span></li>`).join('')}
					</ul>
				</div>
			</div>
		</section>`;
}

// ── full render ───────────────────────────────────────────────────────────────
function render(d) {
	root.innerHTML = renderHero(d) + `<div class="agi-grid">${renderMind(d)}${renderRecord(d)}</div>` + renderDoctrine(d);
	applyAura(d.cognition);
	mountBody(d.agent);
	if (state.embodied) applyMood(d.cognition);
}

function renderLoading() {
	root.innerHTML = `
		<section class="agi-hero">
			<div class="agi-hero-copy">
				<span class="agi-domain-tag"><i class="agi-dot"></i> memecoin trading · pump.fun</span>
				<h1 class="agi-title">The first AGI.<br /><span class="agi-em">Narrow by design.</span></h1>
				<div class="agi-skel" style="height:80px;max-width:46ch"></div>
			</div>
			<div class="agi-stage"><div class="agi-stage-boot">waking the agent…</div></div>
		</section>
		<div class="agi-grid">
			<section class="agi-card"><div class="agi-skel" style="height:300px"></div></section>
			<section class="agi-card"><div class="agi-skel" style="height:300px"></div></section>
		</div>`;
}

function renderError() {
	root.innerHTML = `
		<div class="agi-error">
			<h2 style="font-family:var(--font-display);color:var(--ink)">The agent is unreachable</h2>
			<p>Couldn't load the AGI's live state right now. This is a transient connection issue — the agent keeps trading regardless.</p>
			<button class="agi-btn agi-btn-primary" id="agi-retry" type="button">Retry</button>
		</div>`;
	document.getElementById('agi-retry')?.addEventListener('click', () => { renderLoading(); boot(); });
}

// ── boot + poll ───────────────────────────────────────────────────────────────
async function refresh() {
	try {
		const d = await fetchState();
		state.data = d;
		render(d);
		document.title = d.agent?.name ? `${d.agent.name} — The AGI · three.ws` : 'The AGI · three.ws';
	} catch (e) {
		if (!state.data) renderError();
		// If we already have a render up, keep it and try again next tick.
	}
}

async function boot() {
	await refresh();
	if (state.timer) clearInterval(state.timer);
	state.timer = setInterval(() => { if (!document.hidden) refresh(); }, POLL_MS);
}

document.addEventListener('visibilitychange', () => { if (!document.hidden && state.data) refresh(); });

renderLoading();
boot();
