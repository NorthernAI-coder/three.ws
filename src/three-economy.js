// The $THREE economy (/three) — the flagship surface for the platform economy.
//
// One page that makes the whole economy legible and verifiable: a live canvas
// visualization of value flowing through the protocol ("The Flow"), animated live
// stats, on-chain-verifiable treasury + rewards wallets, a real reflected-to-
// holders history with a personal projector, an interactive holder-tier ladder,
// an interactive pricing explorer that applies your tier discount live, and a
// rare-name studio. All data is real — /api/three/{catalog,stats,tier,name-quote}
// and /api/token/price. No mock data, no placeholders; every state is designed.
//
// Design language: dark, premium, minimal. Split roles have a fixed color
// identity used everywhere — treasury=gold, rewards=green, creators=blue,
// scarcity=violet — so the same value is recognizable in the flow, the stats, and
// the catalog. Motion is purposeful and fully reduced-motion aware.

const API = '/api/three';
const MINT = 'FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump';
const REDUCED_MOTION =
	typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// Fixed color identity per split role — the page's visual grammar.
const ROLE = {
	treasury: { color: '#f5c451', glow: 'rgba(245,196,81,.5)', label: 'Treasury' },
	rewards: { color: '#6ee7a8', glow: 'rgba(110,231,168,.55)', label: 'Holder rewards' },
	seller: { color: '#7cc4ff', glow: 'rgba(124,196,255,.5)', label: 'Creators' },
	scarcity: { color: '#c4a8ff', glow: 'rgba(196,168,255,.5)', label: 'Scarcity' },
};
const CATEGORY_LABELS = {
	generation: 'Generation & compute',
	data: 'Data & intelligence',
	scarcity: 'Scarcity & collectibles',
	marketplace: 'Creator marketplace',
};

// ── formatters ──────────────────────────────────────────────────────────────
const esc = (s) =>
	String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtUsd = (n) => {
	const v = Number(n);
	if (!Number.isFinite(v)) return '—';
	if (v === 0) return 'Free';
	return v.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: v < 1 ? 2 : 0 });
};
const fmtCompact = (n) => {
	const v = Number(n);
	if (!Number.isFinite(v)) return '0';
	const a = Math.abs(v);
	if (a >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
	if (a >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
	if (a >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
	return v.toLocaleString('en-US', { maximumFractionDigits: v < 1 && v > 0 ? 4 : 2 });
};
const atomicsToTokens = (atomics, decimals = 6) => {
	try {
		// Avoid Number overflow on huge atomics: split integer/fraction via BigInt.
		const a = BigInt(atomics);
		const d = 10n ** BigInt(decimals);
		return Number(a / d) + Number(a % d) / Number(d);
	} catch {
		return 0;
	}
};
const shortAddr = (a) => {
	const s = String(a || '');
	return s.length > 9 ? `${s.slice(0, 4)}…${s.slice(-4)}` : s;
};

async function getJSON(path, opts = {}) {
	const r = await fetch(path, { credentials: 'include', ...opts });
	if (!r.ok) {
		const body = await r.json().catch(() => ({}));
		const err = new Error(body.message || `${r.status}`);
		err.status = r.status;
		err.code = body.code;
		throw err;
	}
	return r.json();
}

// Animate a number element from 0 (or its current value) to `target`, easing the
// rollup. Respects reduced-motion (sets the final value immediately). `format`
// renders the running value. Cancels cleanly if re-invoked on the same element.
function rollup(el, target, format = fmtCompact, ms = 900) {
	if (!el) return;
	const to = Number(target) || 0;
	if (REDUCED_MOTION || ms <= 0) {
		el.textContent = format(to);
		return;
	}
	if (el._rollupRAF) cancelAnimationFrame(el._rollupRAF);
	const from = Number(el._rollupValue) || 0;
	let start = null;
	const ease = (t) => 1 - Math.pow(1 - t, 3); // easeOutCubic
	const step = (ts) => {
		if (start === null) start = ts;
		const p = Math.min(1, (ts - start) / ms);
		const v = from + (to - from) * ease(p);
		el.textContent = format(v);
		if (p < 1) el._rollupRAF = requestAnimationFrame(step);
		else {
			el._rollupValue = to;
			el.textContent = format(to);
		}
	};
	el._rollupRAF = requestAnimationFrame(step);
}

// Reveal-on-scroll: fade/slide sections in as they enter the viewport. No-op under
// reduced motion (everything is simply visible).
function observeReveal(root) {
	if (REDUCED_MOTION || typeof IntersectionObserver !== 'function') {
		root.querySelectorAll('.ec-reveal').forEach((el) => el.classList.add('in'));
		return;
	}
	const io = new IntersectionObserver(
		(entries) => {
			for (const e of entries) {
				if (e.isIntersecting) {
					e.target.classList.add('in');
					io.unobserve(e.target);
				}
			}
		},
		{ rootMargin: '0px 0px -10% 0px', threshold: 0.08 },
	);
	root.querySelectorAll('.ec-reveal').forEach((el) => io.observe(el));
}

// ── styles ──────────────────────────────────────────────────────────────────
function injectStyles() {
	const css = `
	:root {
		--bg:#08080b; --panel:#0e0e13; --panel-2:#0b0b0f; --line:#1a1a22; --line-2:#23232c;
		--ink:#f6f6f8; --muted:#9a9aa4; --muted-2:#80808b;
		--gold:#f5c451; --green:#6ee7a8; --blue:#7cc4ff; --violet:#c4a8ff;
		--ease:cubic-bezier(.22,1,.36,1);
		color-scheme: dark;
	}
	* { box-sizing:border-box; }
	body { margin:0; background:var(--bg); color:var(--ink);
		font-family:Inter,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
		-webkit-font-smoothing:antialiased; text-rendering:optimizeLegibility; }
	body::before { /* ambient top glow */
		content:''; position:fixed; inset:0; pointer-events:none; z-index:0;
		background:radial-gradient(900px 500px at 50% -8%, rgba(110,231,168,.10), transparent 60%),
		           radial-gradient(700px 500px at 85% 0%, rgba(124,196,255,.06), transparent 55%); }
	a { color:inherit; text-decoration:none; }
	code { font-family:ui-monospace,Menlo,monospace; }
	::selection { background:rgba(110,231,168,.25); }
	:focus-visible { outline:2px solid var(--green); outline-offset:3px; border-radius:6px; }

	.ec-wrap { position:relative; z-index:1; max-width:1120px; margin:0 auto; padding:24px 20px 100px; }
	.ec-top { display:flex; align-items:center; justify-content:space-between; gap:12px; }
	.ec-pill { display:inline-flex; align-items:center; gap:7px; font-size:12.5px; color:var(--muted);
		border:1px solid var(--line); border-radius:999px; padding:7px 13px; transition:.18s var(--ease); }
	.ec-pill:hover { color:var(--ink); border-color:var(--line-2); transform:translateY(-1px); }
	.ec-pill .dot { width:7px; height:7px; border-radius:50%; background:var(--green);
		box-shadow:0 0 10px var(--green); animation:ec-pulse 2.4s infinite; }
	@keyframes ec-pulse { 0%,100%{opacity:1} 50%{opacity:.35} }

	/* Hero */
	.ec-hero { padding:56px 0 8px; text-align:center; }
	.ec-badge { display:inline-flex; gap:8px; align-items:center; font-size:11.5px; letter-spacing:.1em;
		text-transform:uppercase; color:var(--green); border:1px solid rgba(110,231,168,.25);
		background:rgba(110,231,168,.06); border-radius:999px; padding:6px 14px; margin-bottom:20px; }
	.ec-h1 { font-size:clamp(34px,6.2vw,60px); line-height:1.02; font-weight:840; letter-spacing:-.035em;
		margin:0 0 16px; background:linear-gradient(180deg,#fff 30%,#a9a9b4); -webkit-background-clip:text;
		background-clip:text; -webkit-text-fill-color:transparent; }
	.ec-lede { color:var(--muted); font-size:clamp(15px,2vw,18px); line-height:1.55; max-width:620px; margin:0 auto; }
	.ec-hero-stat { margin:30px auto 4px; display:inline-flex; flex-direction:column; gap:4px;
		border:1px solid rgba(110,231,168,.22); background:rgba(110,231,168,.05); border-radius:18px; padding:18px 30px; }
	.ec-hero-stat .hs-num { font-size:clamp(30px,5vw,46px); font-weight:850; letter-spacing:-.03em; color:var(--green);
		font-variant-numeric:tabular-nums; line-height:1; }
	.ec-hero-stat .hs-num .hs-sym { font-size:16px; font-weight:600; color:var(--muted); }
	.ec-hero-stat .hs-lbl { font-size:12.5px; color:var(--muted); }
	.ec-cta { margin-top:26px; display:flex; gap:11px; justify-content:center; flex-wrap:wrap; }
	.ec-btn { font-size:14px; font-weight:600; padding:11px 20px; border-radius:11px; border:1px solid var(--line-2);
		background:var(--panel); transition:.16s var(--ease); cursor:pointer; color:var(--ink); }
	.ec-btn:hover { transform:translateY(-1px); border-color:#34343f; }
	.ec-btn.primary { background:var(--ink); color:#06060a; border-color:var(--ink); font-weight:700; }
	.ec-btn.primary:hover { background:#fff; }

	/* Sections */
	.ec-section { margin-top:64px; }
	.ec-reveal { opacity:0; transform:translateY(16px); transition:opacity .6s var(--ease), transform .6s var(--ease); }
	.ec-reveal.in { opacity:1; transform:none; }
	.ec-htitle { font-size:13px; text-transform:uppercase; letter-spacing:.12em; color:var(--green); margin:0 0 8px; font-weight:700; }
	.ec-h2 { font-size:clamp(22px,3vw,30px); font-weight:780; letter-spacing:-.025em; margin:0 0 8px; }
	.ec-desc { color:var(--muted); font-size:14.5px; line-height:1.55; max-width:660px; margin:0 0 22px; }

	/* The Flow */
	.ec-flow-shell { position:relative; border:1px solid var(--line); border-radius:20px; overflow:hidden;
		background:linear-gradient(180deg,#0c0c11,#090a0d); }
	.ec-flow-canvas { display:block; width:100%; height:340px; }
	.ec-flow-legend { display:flex; flex-wrap:wrap; gap:14px 22px; padding:14px 18px; border-top:1px solid var(--line);
		font-size:12.5px; color:var(--muted); background:rgba(0,0,0,.2); }
	.ec-leg { display:inline-flex; align-items:center; gap:7px; }
	.ec-leg .sw { width:9px; height:9px; border-radius:50%; }
	.ec-flow-note { position:absolute; bottom:62px; left:18px; right:18px; font-size:12px; color:var(--muted-2);
		pointer-events:none; }
	.ec-flow-pause { position:absolute; top:14px; right:14px; z-index:2; display:inline-flex; align-items:center; gap:6px;
		font-size:12px; color:var(--muted); background:rgba(0,0,0,.45); border:1px solid var(--line-2);
		border-radius:999px; padding:6px 12px; cursor:pointer; transition:.15s var(--ease); backdrop-filter:blur(6px); }
	.ec-flow-pause:hover { color:var(--ink); border-color:#3a3a44; }

	/* Stat band */
	.ec-stats { display:grid; gap:13px; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); }
	.ec-stat { border:1px solid var(--line); border-radius:16px; padding:20px;
		background:linear-gradient(180deg,var(--panel),var(--panel-2)); position:relative; overflow:hidden; }
	.ec-stat::after { content:''; position:absolute; left:0; top:0; height:2px; width:100%;
		background:linear-gradient(90deg,transparent,var(--accent,var(--green)),transparent); opacity:.5; }
	.ec-stat .v { font-size:28px; font-weight:820; letter-spacing:-.02em; font-variant-numeric:tabular-nums; }
	.ec-stat .v .sym { font-size:14px; font-weight:600; color:var(--muted); margin-left:5px; }
	.ec-stat .k { color:var(--muted); font-size:12.5px; margin-top:5px; }

	/* Verify wallets */
	.ec-wallets { display:grid; gap:13px; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); }
	.ec-wallet { display:block; border:1px solid var(--line); border-radius:16px; padding:20px;
		background:linear-gradient(180deg,var(--panel),var(--panel-2)); transition:.16s var(--ease); }
	a.ec-wallet:hover { transform:translateY(-2px); border-color:var(--accent); box-shadow:0 8px 30px -12px var(--accent-glow); }
	.ec-wallet .wlabel { font-size:12.5px; color:var(--muted); display:flex; align-items:center; gap:8px; }
	.ec-wallet .wlabel .sw { width:9px; height:9px; border-radius:50%; background:var(--accent); }
	.ec-wallet .wbal { font-size:26px; font-weight:820; letter-spacing:-.02em; margin:8px 0 7px; font-variant-numeric:tabular-nums; }
	.ec-wallet .wbal .sym { font-size:13px; color:var(--muted); margin-left:5px; font-weight:600; }
	.ec-wallet .waddr { font-family:ui-monospace,Menlo,monospace; font-size:11.5px; color:var(--accent); }

	/* Reflections + projector */
	.ec-reflect { display:grid; gap:16px; grid-template-columns:1.1fr .9fr; align-items:start; }
	@media (max-width:760px){ .ec-reflect{ grid-template-columns:1fr; } }
	.ec-card { border:1px solid var(--line); border-radius:16px; padding:22px;
		background:linear-gradient(180deg,var(--panel),var(--panel-2)); }
	.ec-reflect-big { font-size:38px; font-weight:850; letter-spacing:-.025em; color:var(--green);
		font-variant-numeric:tabular-nums; }
	.ec-reflect-sub { color:var(--muted); font-size:13.5px; margin-top:4px; }
	.ec-reflect-list { margin-top:16px; border-top:1px solid var(--line); }
	.ec-reflect-row { display:flex; justify-content:space-between; gap:12px; padding:11px 0; font-size:13px;
		border-bottom:1px solid var(--line); }
	.ec-reflect-row:last-child { border-bottom:none; }
	.ec-tag { font-size:10.5px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; padding:2px 8px;
		border-radius:999px; }
	.ec-tag.paid { background:rgba(110,231,168,.12); color:var(--green); }
	.ec-tag.planned { background:rgba(139,139,150,.12); color:var(--muted); }
	.ec-proj label { font-size:12.5px; color:var(--muted); display:block; margin-bottom:8px; }
	.ec-proj input[type=range] { width:100%; accent-color:var(--green); }
	.ec-proj-out { margin-top:14px; font-size:14px; line-height:1.6; }
	.ec-proj-out b { color:var(--green); font-variant-numeric:tabular-nums; }

	/* Tiers */
	.ec-tiers { display:grid; gap:13px; grid-template-columns:repeat(auto-fit,minmax(190px,1fr)); }
	.ec-tier { border:1px solid var(--line); border-radius:16px; padding:20px; background:var(--panel);
		position:relative; transition:.16s var(--ease); }
	.ec-tier:hover { transform:translateY(-3px); border-color:var(--line-2); }
	.ec-tier.cur { border-color:var(--green); box-shadow:0 0 0 1px rgba(110,231,168,.3), 0 12px 40px -16px rgba(110,231,168,.4); }
	.ec-tier .you { position:absolute; top:-10px; right:14px; font-size:10px; font-weight:800; letter-spacing:.07em;
		text-transform:uppercase; color:#06060a; background:var(--green); border-radius:999px; padding:3px 10px; }
	.ec-tier .tn { font-size:17px; font-weight:780; }
	.ec-tier .tm { color:var(--muted); font-size:12.5px; margin:3px 0 14px; }
	.ec-tier ul { list-style:none; margin:0; padding:0; }
	.ec-tier li { font-size:12.5px; color:#c9c9d2; padding:5px 0 5px 19px; position:relative; }
	.ec-tier li::before { content:''; position:absolute; left:3px; top:11px; width:6px; height:6px; border-radius:50%;
		background:var(--green); }
	.ec-progress { margin:20px 0 0; }
	.ec-progress .bar { height:8px; border-radius:999px; background:var(--line); overflow:hidden; }
	.ec-progress .fill { height:100%; border-radius:999px; background:linear-gradient(90deg,var(--green),#a8f0c8);
		width:0; transition:width 1s var(--ease); }
	.ec-progress .lbl { display:flex; justify-content:space-between; font-size:12.5px; color:var(--muted); margin-top:9px; }

	/* Pricing explorer */
	.ec-px { display:grid; gap:16px; grid-template-columns:1fr 1fr; }
	@media (max-width:760px){ .ec-px{ grid-template-columns:1fr; } }
	.ec-px-list { border:1px solid var(--line); border-radius:16px; overflow:hidden; max-height:420px; overflow-y:auto; }
	.ec-px-cat { font-size:11px; text-transform:uppercase; letter-spacing:.09em; color:var(--muted-2);
		padding:12px 16px 6px; }
	.ec-px-item { display:flex; align-items:center; justify-content:space-between; gap:12px; width:100%;
		padding:12px 16px; background:none; border:none; border-top:1px solid var(--line); color:var(--ink);
		font:inherit; text-align:left; cursor:pointer; transition:background .14s var(--ease); }
	.ec-px-item:hover, .ec-px-item.sel { background:rgba(110,231,168,.06); }
	.ec-px-item .pl { font-size:13.5px; }
	.ec-px-item .pp { font-size:13px; font-weight:700; white-space:nowrap; font-variant-numeric:tabular-nums; }
	.ec-px-item .pp.free { color:var(--green); }
	.ec-px-item .pp.var { color:var(--muted); font-weight:500; }
	.ec-px-detail { border:1px solid var(--line); border-radius:16px; padding:22px;
		background:linear-gradient(180deg,var(--panel),var(--panel-2)); align-self:start; position:sticky; top:18px; }
	.ec-px-detail .dt { font-size:16px; font-weight:740; }
	.ec-px-row { display:flex; justify-content:space-between; padding:11px 0; border-bottom:1px solid var(--line); font-size:14px; }
	.ec-px-row:last-child { border-bottom:none; }
	.ec-px-row .val { font-weight:700; font-variant-numeric:tabular-nums; }
	.ec-px-row .val.save { color:var(--green); }
	.ec-px-three { font-size:13px; color:var(--muted); }

	/* Name studio */
	.ec-name { display:flex; gap:10px; max-width:520px; }
	.ec-name input { flex:1; background:var(--panel); border:1px solid var(--line-2); border-radius:12px;
		padding:14px 16px; color:var(--ink); font-size:16px; font-family:ui-monospace,Menlo,monospace; transition:.16s var(--ease); }
	.ec-name input:focus { outline:none; border-color:var(--green); box-shadow:0 0 0 3px rgba(110,231,168,.12); }
	.ec-name .suffix { align-self:center; color:var(--muted-2); font-family:ui-monospace,Menlo,monospace; font-size:13px; }
	.ec-name-out { margin-top:18px; min-height:90px; }
	.ec-rare-meter { height:8px; border-radius:999px; background:var(--line); overflow:hidden; margin:14px 0 12px; max-width:520px; }
	.ec-rare-fill { height:100%; border-radius:999px; transition:width .5s var(--ease), background .3s; }
	.ec-rare-head { display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
	.ec-rarity { font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:.06em; border-radius:999px; padding:4px 11px; }
	.r-legendary{background:rgba(196,168,255,.14);color:#d6b8ff} .r-epic{background:rgba(124,196,255,.14);color:#9ed0ff}
	.r-rare{background:rgba(110,231,168,.14);color:#8af0c0} .r-uncommon{background:rgba(245,196,81,.14);color:#f0d488}
	.r-common{background:rgba(139,139,150,.12);color:#a7a7b2}

	/* Catalog grid (compact, full list) */
	.ec-cat { margin-bottom:24px; }
	.ec-cat h3 { font-size:12px; text-transform:uppercase; letter-spacing:.09em; color:var(--muted); margin:0 0 11px; }
	.ec-items { display:grid; gap:9px; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); }
	.ec-item { display:flex; align-items:center; justify-content:space-between; gap:12px; border:1px solid var(--line);
		border-radius:12px; padding:13px 15px; background:var(--panel); }
	.ec-item .label { font-size:13.5px; }
	.ec-item .price { font-size:13.5px; font-weight:700; white-space:nowrap; font-variant-numeric:tabular-nums; }
	.ec-item .price.free { color:var(--green); } .ec-item .price.var { color:var(--muted); font-weight:500; }

	/* States */
	.ec-skel { background:linear-gradient(90deg,#101015,#191920,#101015); background-size:200% 100%;
		animation:ec-sh 1.3s infinite; border-radius:14px; }
	@keyframes ec-sh { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
	.ec-err { border:1px solid #3a1f1f; background:#160d0d; color:#ff9b9b; border-radius:14px; padding:16px; font-size:13.5px; }
	.ec-muted { color:var(--muted); }
	.ec-foot { margin-top:64px; padding-top:24px; border-top:1px solid var(--line); color:var(--muted-2);
		font-size:12.5px; text-align:center; line-height:1.7; }
	.ec-foot code { color:var(--muted); }

	@media (prefers-reduced-motion: reduce){
		.ec-skel{animation:none} .ec-pill .dot{animation:none}
		.ec-btn:hover,.ec-tier:hover,a.ec-wallet:hover,.ec-pill:hover{transform:none}
	}
	`;
	const el = document.createElement('style');
	el.textContent = css;
	document.head.appendChild(el);
}

// ── The Flow: live canvas economy visualization ───────────────────────────────
//
// Value enters from the left (a particle per "spend", colored by category), hits
// the protocol splitter, and forks into three beneficiary lanes — treasury (gold),
// holder rewards (green), creators (blue). Reward particles rain onto a row of
// holder dots that pulse on contact. NOTHING is destroyed: there is no burn sink,
// and the note under the canvas says so. Emission rate + lane weights are seeded
// from real /api/three/stats so the picture reflects the actual economy. Pauses
// when offscreen; under reduced-motion it renders a clean static diagram instead.
class FlowViz {
	constructor(canvas) {
		this.canvas = canvas;
		this.ctx = canvas.getContext('2d');
		this.particles = [];
		this.holders = [];
		this.running = false;
		this.userPaused = false; // WCAG 2.2.2 — explicit user pause overrides auto start/stop
		this.lastEmit = 0;
		this.emitInterval = 520; // ms between spends (tuned by activity)
		this.weights = { treasury: 0.5, rewards: 0.4, seller: 0.1 };
		this.categoryColors = ['#6ee7a8', '#7cc4ff', '#c4a8ff', '#f5c451'];
		this._resize = this._resize.bind(this);
		this._frame = this._frame.bind(this);
	}

	seed(stats) {
		const r = stats?.by_role || {};
		const t = Number(r.treasury || 0);
		const rw = Number(r.rewards || 0);
		const s = Number(r.seller || 0);
		const sum = t + rw + s;
		if (sum > 0) this.weights = { treasury: t / sum, rewards: rw / sum, seller: s / sum };
		// Busier economies emit faster (bounded). payment_count drives tempo.
		const pc = Number(stats?.payment_count || 0);
		this.emitInterval = pc > 0 ? Math.max(220, 620 - Math.min(380, pc * 6)) : 760;
	}

	start() {
		if (this.running || REDUCED_MOTION || this.userPaused) {
			if (REDUCED_MOTION) this._renderStatic();
			return;
		}
		this.running = true;
		this._resize();
		addEventListener('resize', this._resize, { passive: true });
		this._initHolders();
		this._raf = requestAnimationFrame(this._frame);
	}

	stop() {
		this.running = false;
		if (this._raf) cancelAnimationFrame(this._raf);
		removeEventListener('resize', this._resize);
	}

	_resize() {
		const dpr = Math.min(2, window.devicePixelRatio || 1);
		const rect = this.canvas.getBoundingClientRect();
		this.w = rect.width;
		this.h = rect.height || 340;
		this.canvas.width = Math.round(this.w * dpr);
		this.canvas.height = Math.round(this.h * dpr);
		this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		this.splitX = this.w * 0.42;
		this.midY = this.h * 0.5;
		this.lanes = {
			treasury: this.h * 0.22,
			rewards: this.h * 0.5,
			seller: this.h * 0.78,
		};
		this._initHolders();
	}

	_initHolders() {
		const n = Math.min(26, Math.max(10, Math.floor((this.w || 600) / 34)));
		const x0 = this.w * 0.74;
		const x1 = this.w - 26;
		this.holders = Array.from({ length: n }, (_, i) => ({
			x: x0 + ((x1 - x0) * (i % Math.ceil(n / 2))) / Math.max(1, Math.ceil(n / 2) - 1),
			y: this.lanes.rewards + 34 + Math.floor(i / Math.ceil(n / 2)) * 22,
			pulse: 0,
		}));
	}

	_emit(now) {
		// Pick a beneficiary lane by the real split weights.
		const r = Math.random();
		let role = 'treasury';
		if (r < this.weights.rewards) role = 'rewards';
		else if (r < this.weights.rewards + this.weights.seller) role = 'seller';
		this.particles.push({
			x: -8,
			y: this.midY + (Math.random() - 0.5) * 30,
			role,
			phase: 'in', // in → split → out
			t: 0,
			cat: this.categoryColors[(Math.random() * this.categoryColors.length) | 0],
			speed: 0.6 + Math.random() * 0.5,
			targetHolder: role === 'rewards' ? (Math.random() * this.holders.length) | 0 : -1,
		});
		this.lastEmit = now;
	}

	_frame(now) {
		if (!this.running) return;
		const ctx = this.ctx;
		ctx.clearRect(0, 0, this.w, this.h);

		// Static scaffold: source, splitter, lanes.
		this._drawScaffold(ctx);

		if (now - this.lastEmit > this.emitInterval) this._emit(now);

		const treasuryC = ROLE.treasury.color,
			rewardsC = ROLE.rewards.color,
			sellerC = ROLE.seller.color;
		for (let i = this.particles.length - 1; i >= 0; i--) {
			const p = this.particles[i];
			p.t += 0.016 * p.speed;
			let alive = true;
			if (p.phase === 'in') {
				p.x += (this.splitX - p.x) * 0.06 * p.speed;
				p.y += (this.midY - p.y) * 0.06;
				if (p.x >= this.splitX - 3) {
					p.phase = 'out';
					p.y = this.midY;
				}
			} else {
				const laneY = this.lanes[p.role];
				const endX = p.role === 'rewards' && p.targetHolder >= 0 && this.holders[p.targetHolder]
					? this.holders[p.targetHolder].x
					: this.w + 10;
				const endY = p.role === 'rewards' && p.targetHolder >= 0 && this.holders[p.targetHolder]
					? this.holders[p.targetHolder].y
					: laneY;
				p.x += (endX - p.x) * 0.05 * p.speed;
				p.y += (endY - p.y) * 0.08;
				if (Math.abs(p.x - endX) < 4) {
					if (p.role === 'rewards' && this.holders[p.targetHolder]) this.holders[p.targetHolder].pulse = 1;
					alive = false;
				}
			}
			const color = p.phase === 'in' ? p.cat : p.role === 'treasury' ? treasuryC : p.role === 'rewards' ? rewardsC : sellerC;
			ctx.beginPath();
			ctx.arc(p.x, p.y, 2.6, 0, Math.PI * 2);
			ctx.fillStyle = color;
			ctx.shadowColor = color;
			ctx.shadowBlur = 8;
			ctx.fill();
			ctx.shadowBlur = 0;
			if (!alive) this.particles.splice(i, 1);
		}

		// Holder dots (rewards recipients) — pulse green on contact.
		for (const hh of this.holders) {
			hh.pulse *= 0.92;
			const rad = 3 + hh.pulse * 4;
			ctx.beginPath();
			ctx.arc(hh.x, hh.y, rad, 0, Math.PI * 2);
			ctx.fillStyle = `rgba(110,231,168,${0.35 + hh.pulse * 0.65})`;
			if (hh.pulse > 0.05) {
				ctx.shadowColor = ROLE.rewards.color;
				ctx.shadowBlur = 10 * hh.pulse;
			}
			ctx.fill();
			ctx.shadowBlur = 0;
		}

		// Cap particle count defensively.
		if (this.particles.length > 240) this.particles.splice(0, this.particles.length - 240);
		this._raf = requestAnimationFrame(this._frame);
	}

	_drawScaffold(ctx) {
		// Source node (left).
		ctx.fillStyle = 'rgba(255,255,255,.04)';
		ctx.strokeStyle = 'rgba(255,255,255,.10)';
		this._roundRect(ctx, 6, this.midY - 26, 64, 52, 10);
		ctx.fill();
		ctx.stroke();
		ctx.fillStyle = '#8b8b96';
		ctx.font = '600 10px Inter, sans-serif';
		ctx.textAlign = 'center';
		ctx.fillText('SPENDS', 38, this.midY + 3);

		// Splitter node (center).
		ctx.beginPath();
		ctx.arc(this.splitX, this.midY, 16, 0, Math.PI * 2);
		ctx.fillStyle = 'rgba(110,231,168,.10)';
		ctx.strokeStyle = 'rgba(110,231,168,.5)';
		ctx.lineWidth = 1.5;
		ctx.fill();
		ctx.stroke();
		ctx.fillStyle = '#cfeede';
		ctx.font = '700 9px Inter, sans-serif';
		ctx.fillText('$THREE', this.splitX, this.midY + 3);

		// Lane labels (right).
		ctx.textAlign = 'left';
		ctx.font = '600 11px Inter, sans-serif';
		const labels = [
			['treasury', ROLE.treasury.color, 'Treasury'],
			['rewards', ROLE.rewards.color, 'Holders'],
			['seller', ROLE.seller.color, 'Creators'],
		];
		for (const [k, c, txt] of labels) {
			ctx.fillStyle = c;
			ctx.globalAlpha = 0.8;
			ctx.fillText(txt, this.w * 0.6, this.lanes[k] - 8);
			ctx.globalAlpha = 1;
		}
	}

	_roundRect(ctx, x, y, w, h, r) {
		ctx.beginPath();
		ctx.moveTo(x + r, y);
		ctx.arcTo(x + w, y, x + w, y + h, r);
		ctx.arcTo(x + w, y + h, x, y + h, r);
		ctx.arcTo(x, y + h, x, y, r);
		ctx.arcTo(x, y, x + w, y, r);
		ctx.closePath();
	}

	// Reduced-motion: a calm, labeled static diagram (no animation).
	_renderStatic() {
		this._resize();
		const ctx = this.ctx;
		ctx.clearRect(0, 0, this.w, this.h);
		this._drawScaffold(ctx);
		ctx.strokeStyle = 'rgba(255,255,255,.12)';
		ctx.lineWidth = 1.5;
		for (const k of ['treasury', 'rewards', 'seller']) {
			ctx.beginPath();
			ctx.moveTo(this.splitX + 14, this.midY);
			ctx.lineTo(this.w * 0.6, this.lanes[k]);
			ctx.stroke();
		}
	}
}

// ── section renderers ─────────────────────────────────────────────────────────

function statCards(stats) {
	const dec = stats?.token?.decimals ?? 6;
	const reflected = atomicsToTokens(stats?.reflected?.total_atomics ?? '0', dec);
	const treasuryLive = atomicsToTokens(stats?.onchain?.treasury?.balance_atomics ?? '0', dec);
	const gross = atomicsToTokens(stats?.gross_atomics ?? '0', dec);
	const toCreators = atomicsToTokens(stats?.by_role?.seller ?? '0', dec);
	return [
		{ key: 'gross', v: gross, accent: 'var(--green)', k: 'settled volume', sym: true },
		{ key: 'reflected', v: reflected, accent: 'var(--green)', k: 'reflected to holders', sym: true },
		{ key: 'treasury', v: treasuryLive, accent: 'var(--gold)', k: 'in treasury (live)', sym: true },
		{ key: 'creators', v: toCreators, accent: 'var(--blue)', k: 'earned by creators', sym: true },
		{ key: 'count', v: Number(stats?.payment_count || 0), accent: 'var(--violet)', k: 'settled payments', sym: false },
	];
}

function onchainHTML(stats) {
	const dec = stats?.token?.decimals ?? 6;
	const oc = stats?.onchain || {};
	const wallet = (w, role) => {
		const r = ROLE[role === 'rewards' ? 'rewards' : 'treasury'];
		if (!w?.address) {
			return `<div class="ec-wallet" style="--accent:${r.color};--accent-glow:${r.glow}"><div class="wlabel"><span class="sw"></span>${esc(r.label)}</div><div class="wbal ec-muted" style="font-size:15px">not yet configured</div></div>`;
		}
		const bal = fmtCompact(atomicsToTokens(w.balance_atomics ?? '0', dec));
		const sub = role === 'rewards' ? 'distributed pro-rata to holders' : 'funds buybacks — never burned';
		return `<a class="ec-wallet" style="--accent:${r.color};--accent-glow:${r.glow}" href="${esc(w.explorer)}" target="_blank" rel="noopener">
			<div class="wlabel"><span class="sw"></span>${esc(r.label)} · ${esc(sub)}</div>
			<div class="wbal">${esc(bal)}<span class="sym">$THREE</span></div>
			<div class="waddr">${esc(shortAddr(w.address))} · verify on Solscan ↗</div>
		</a>`;
	};
	return `<div class="ec-wallets">${wallet(oc.treasury, 'treasury')}${wallet(oc.rewards_pool, 'rewards')}</div>`;
}

function reflectedHTML(stats) {
	const dec = stats?.token?.decimals ?? 6;
	const r = stats?.reflected || { total_atomics: '0', run_count: 0, recent: [] };
	const total = fmtCompact(atomicsToTokens(r.total_atomics ?? '0', dec));
	let history;
	if (!r.recent?.length) {
		history = `<p class="ec-muted" style="margin-top:14px;font-size:13px">Distributions begin once the rewards pool funds. Every run will appear here with an on-chain transaction you can verify — value returned to holders, never destroyed.</p>`;
	} else {
		history = `<div class="ec-reflect-list">${r.recent
			.map((d) => {
				const amt = fmtCompact(atomicsToTokens(d.distributed_atomics ?? '0', dec));
				const when = d.created_at ? new Date(d.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
				const paid = d.status === 'completed';
				return `<div class="ec-reflect-row"><span class="ec-muted">${esc(when)}</span><span>${esc(amt)} $THREE → ${d.holder_count} holders</span><span class="ec-tag ${paid ? 'paid' : 'planned'}">${paid ? 'paid' : 'planned'}</span></div>`;
			})
			.join('')}</div>`;
	}
	return `
	<div class="ec-card">
		<div class="ec-reflect-big" id="ec-reflect-total">${esc(total)} <span style="font-size:18px;color:var(--muted)">$THREE</span></div>
		<div class="ec-reflect-sub">returned to holders across ${r.run_count} distribution${r.run_count === 1 ? '' : 's'} — we never burn supply</div>
		${history}
	</div>
	<div class="ec-card ec-proj">
		<label for="ec-proj-range">If you held this much $THREE…</label>
		<input id="ec-proj-range" type="range" min="0" max="6" step="0.1" value="3" aria-label="Amount of $THREE held" />
		<div class="ec-proj-out" id="ec-proj-out"></div>
	</div>`;
}

function tiersHTML(tierData) {
	const ladder = tierData?.ladder || [];
	const cur = tierData?.tier?.level ?? null;
	const cards = ladder
		.map((t) => {
			const is = t.level === cur;
			const perks = (t.perks || []).slice(0, 4).map((p) => `<li>${esc(p)}</li>`).join('');
			return `<div class="ec-tier${is ? ' cur' : ''}">
				${is ? '<span class="you">You</span>' : ''}
				<div class="tn">${esc(t.label)}</div>
				<div class="tm">${t.min_usd > 0 ? `Hold ${fmtUsd(t.min_usd)}+` : 'Free — everyone'}${t.discount_bps > 0 ? ` · ${(t.discount_bps / 100).toFixed(0)}% off` : ''}</div>
				<ul>${perks}</ul>
			</div>`;
		})
		.join('');
	let progress = '';
	if (cur != null && tierData?.next) {
		const next = tierData.next;
		const held = Number(tierData.held_usd || 0);
		const prevMin = ladder.find((t) => t.level === cur)?.min_usd || 0;
		const pct = Math.max(0, Math.min(100, ((held - prevMin) / Math.max(1, next.min_usd - prevMin)) * 100));
		progress = `<div class="ec-progress">
			<div class="bar"><div class="fill" id="ec-tier-fill"></div></div>
			<div class="lbl"><span>You hold ${fmtUsd(held)}</span><span>${fmtUsd(next.usd_to_go)} to ${esc(next.label)}</span></div>
		</div>`;
		setTimeout(() => {
			const f = document.getElementById('ec-tier-fill');
			if (f) f.style.width = `${pct}%`;
		}, 80);
	} else if (cur == null) {
		progress = `<p class="ec-muted" style="margin-top:18px;font-size:13px">Sign in and link a Solana wallet to see your tier and track progress to the next one.</p>`;
	}
	return `<div class="ec-tiers">${cards}</div>${progress}`;
}

function catalogGroups(actions) {
	const byCat = {};
	for (const a of actions) (byCat[a.category] ||= []).push(a);
	return ['generation', 'data', 'scarcity', 'marketplace']
		.filter((c) => byCat[c]?.length)
		.map((cat) => ({ cat, label: CATEGORY_LABELS[cat] || cat, items: byCat[cat] }));
}

// ── page ──────────────────────────────────────────────────────────────────────
function shell() {
	return `
	<div class="ec-wrap">
		<div class="ec-top">
			<a class="ec-pill" href="/"><span class="dot"></span>three.ws</a>
			<a class="ec-pill" href="/three-token">$THREE price ↗</a>
		</div>

		<header class="ec-hero ec-reveal">
			<span class="ec-badge">◆ $THREE · the only coin · zero burns</span>
			<h1 class="ec-h1">An economy you can<br/>watch and verify.</h1>
			<p class="ec-lede">You pay in $THREE only for real compute. Hold it for lower fees and bigger perks. <strong style="color:var(--ink)">30% of every compute fee goes straight back to holders</strong> — funded by real usage, never minted, never burned.</p>
			<div class="ec-hero-stat" id="ec-hero-stat" aria-live="polite">
				<div class="hs-num"><span data-roll>0</span> <span class="hs-sym">$THREE</span></div>
				<div class="hs-lbl">returned to holders &amp; counting · 0 burned</div>
			</div>
			<div class="ec-cta">
				<a class="ec-btn primary" href="/three-token">Get $THREE</a>
				<a class="ec-btn" href="#tiers">See holder tiers</a>
			</div>
		</header>

		<section class="ec-section ec-reveal" id="flow">
			<p class="ec-htitle">The Flow</p>
			<h2 class="ec-h2">Where every $THREE goes</h2>
			<p class="ec-desc">Live. Each particle is value entering the protocol — it splits to the treasury, to creators, and rains back onto holders. There is no burn lane: nothing is destroyed.</p>
			<div class="ec-flow-shell">
				<button class="ec-flow-pause" id="ec-flow-pause" type="button" aria-pressed="false" aria-label="Pause the animation">❚❚ Pause</button>
				<canvas class="ec-flow-canvas" id="ec-flow" role="img" aria-label="Live visualization of $THREE flowing from spends to treasury, creators, and holders"></canvas>
				<div class="ec-flow-note">Lane width reflects the real split of settled volume.</div>
				<div class="ec-flow-legend">
					<span class="ec-leg"><span class="sw" style="background:var(--gold)"></span>Treasury → buybacks</span>
					<span class="ec-leg"><span class="sw" style="background:var(--green)"></span>Holder rewards</span>
					<span class="ec-leg"><span class="sw" style="background:var(--blue)"></span>Creators</span>
					<span class="ec-leg ec-muted">No burn lane — supply is never destroyed.</span>
				</div>
			</div>
		</section>

		<section class="ec-section ec-reveal" id="stats">
			<p class="ec-htitle">Live economy</p>
			<h2 class="ec-h2">The numbers, settled on-chain</h2>
			<div id="ec-stats" class="ec-stats">${'<div class="ec-stat ec-skel" style="height:96px"></div>'.repeat(5)}</div>
			<p class="ec-stamp" id="ec-stamp" aria-live="polite">Loading live figures…</p>
		</section>

		<section class="ec-section ec-reveal" id="verify">
			<p class="ec-htitle">Don't trust — verify</p>
			<h2 class="ec-h2">The real wallets, on Solscan</h2>
			<p class="ec-desc">No anonymous "trust us." The treasury and the holder-rewards pool are real Solana accounts. Open them and check the balances against the numbers above.</p>
			<div id="ec-onchain"><div class="ec-wallets">${'<div class="ec-wallet ec-skel" style="height:108px"></div>'.repeat(2)}</div></div>
		</section>

		<section class="ec-section ec-reveal" id="reflected">
			<p class="ec-htitle">Real yield, not burns</p>
			<h2 class="ec-h2">Value returned to holders</h2>
			<p class="ec-desc">Other tokens burn supply and call it a number. We route real usage fees back to holders pro-rata — never minted, never a tax on your transfers — and record every distribution on-chain. Drag the slider to see what a bag would have earned from past distributions.</p>
			<div id="ec-reflected" class="ec-reflect"><div class="ec-card ec-skel" style="height:200px"></div><div class="ec-card ec-skel" style="height:200px"></div></div>
		</section>

		<section class="ec-section ec-reveal" id="tiers">
			<p class="ec-htitle">Hold to unlock</p>
			<h2 class="ec-h2">Holder tiers</h2>
			<p class="ec-desc">Holding $THREE — not spending it — lowers your fees and raises your limits. The more you hold, the more you keep.</p>
			<div id="ec-tiers"><div class="ec-tiers">${'<div class="ec-tier ec-skel" style="height:170px"></div>'.repeat(5)}</div></div>
		</section>

		<section class="ec-section ec-reveal" id="pricing">
			<p class="ec-htitle">What you pay for</p>
			<h2 class="ec-h2">Pricing explorer</h2>
			<p class="ec-desc">Only real compute and genuinely scarce things cost $THREE. Pick one to see its price — and what your tier discount would make it. Everything else (creating, discovering, embedding, chatting, basic worlds, draft generation) is free forever.</p>
			<div class="ec-px">
				<div id="ec-px-list" class="ec-px-list">${'<div class="ec-skel" style="height:46px;margin:8px;border-radius:10px"></div>'.repeat(6)}</div>
				<div id="ec-px-detail" class="ec-px-detail"><p class="ec-muted">Select an action to see its price.</p></div>
			</div>
		</section>

		<section class="ec-section ec-reveal" id="names">
			<p class="ec-htitle">Scarcity</p>
			<h2 class="ec-h2">Rare name studio</h2>
			<p class="ec-desc">Common <code>*.threews.sol</code> names mint free. Short, dictionary, and reserved names are rare — priced in $THREE by how rare they are.</p>
			<div class="ec-name">
				<input id="ec-name-input" type="text" placeholder="yourname" autocomplete="off" spellcheck="false" maxlength="63" aria-label="Check a name's rarity and price" />
				<span class="suffix">.threews.sol</span>
			</div>
			<div class="ec-name-out" id="ec-name-out"><span class="ec-muted">Type a name to see its rarity and price.</span></div>
		</section>

		<section class="ec-section ec-reveal" id="catalog">
			<p class="ec-htitle">Full price list</p>
			<h2 class="ec-h2">Everything priced in $THREE</h2>
			<div id="ec-catalog">${'<div class="ec-skel" style="height:46px;margin-bottom:9px;border-radius:12px"></div>'.repeat(6)}</div>
		</section>

		<div class="ec-foot">$THREE is the only coin three.ws references. Contract <code>${MINT}</code>. Prices shown in USD settle in $THREE at the live market price. No burns — ever.</div>
	</div>`;
}

// ── interactivity ───────────────────────────────────────────────────────────

let LIVE_PRICE = 0; // $THREE/USD, fetched once for conversions
let DISCOUNT_BPS = 0; // current holder's tier discount

function discountedUsd(usd) {
	if (!(usd > 0) || DISCOUNT_BPS <= 0) return usd;
	return Math.max(0.01, Math.round(usd * (10000 - DISCOUNT_BPS)) / 10000);
}
const usdToThree = (usd) => (LIVE_PRICE > 0 && usd > 0 ? usd / LIVE_PRICE : null);

function renderPriceDetail(action) {
	const el = document.getElementById('ec-px-detail');
	if (!el) return;
	if (action.usd == null) {
		el.innerHTML = `<div class="dt">${esc(action.label)}</div>
			<p class="ec-muted" style="margin-top:12px">Priced per item — set by the seller (marketplace) or by rarity (scarcity). 90% goes to the creator on a sale; the rest splits to treasury and holder rewards.</p>`;
		return;
	}
	if (action.usd === 0) {
		el.innerHTML = `<div class="dt">${esc(action.label)}</div><p style="margin-top:12px;color:var(--green);font-weight:600">Free forever.</p>`;
		return;
	}
	const full = action.usd;
	const yours = discountedUsd(full);
	const saved = full - yours;
	const three = usdToThree(yours);
	el.innerHTML = `<div class="dt">${esc(action.label)}</div>
		<div class="ec-px-row"><span>List price</span><span class="val">${fmtUsd(full)}</span></div>
		<div class="ec-px-row"><span>Your tier price${DISCOUNT_BPS > 0 ? ` <span class="ec-muted">(−${(DISCOUNT_BPS / 100).toFixed(0)}%)</span>` : ''}</span><span class="val${saved > 0 ? ' save' : ''}">${fmtUsd(yours)}</span></div>
		${saved > 0 ? `<div class="ec-px-row"><span>You save</span><span class="val save">${fmtUsd(saved)}</span></div>` : ''}
		<div class="ec-px-row"><span>Settles in</span><span class="val ec-px-three">${three != null ? `≈ ${fmtCompact(three)} $THREE` : 'live $THREE'}</span></div>
		<p class="ec-muted" style="margin-top:14px;font-size:12.5px">Splits 70% treasury / 30% holder rewards. ${DISCOUNT_BPS > 0 ? 'Your discount is applied automatically at checkout.' : 'Hold $THREE to unlock a tier discount on this.'}</p>`;
}

function wirePricing(actions) {
	const list = document.getElementById('ec-px-list');
	if (!list) return;
	const groups = catalogGroups(actions);
	list.innerHTML = groups
		.map(
			(g) =>
				`<div class="ec-px-cat">${esc(g.label)}</div>` +
				g.items
					.map((a, i) => {
						const price =
							a.usd == null ? `<span class="pp var">per item</span>` : a.usd === 0 ? `<span class="pp free">Free</span>` : `<span class="pp">${fmtUsd(a.usd)}</span>`;
						return `<button class="ec-px-item" data-id="${esc(a.id)}"><span class="pl">${esc(a.label)}</span>${price}</button>`;
					})
					.join(''),
		)
		.join('');
	const byId = Object.fromEntries(actions.map((a) => [a.id, a]));
	const buttons = [...list.querySelectorAll('.ec-px-item')];
	const select = (btn) => {
		buttons.forEach((b) => b.classList.toggle('sel', b === btn));
		renderPriceDetail(byId[btn.dataset.id]);
	};
	buttons.forEach((b) => b.addEventListener('click', () => select(b)));
	// Auto-select the first paid action so the detail panel isn't empty.
	const firstPaid = buttons.find((b) => byId[b.dataset.id]?.usd > 0) || buttons[0];
	if (firstPaid) select(firstPaid);
}

function wireProjector(stats) {
	const range = document.getElementById('ec-proj-range');
	const out = document.getElementById('ec-proj-out');
	if (!range || !out) return;
	const dec = stats?.token?.decimals ?? 6;
	const reflectedTotal = atomicsToTokens(stats?.reflected?.total_atomics ?? '0', dec);
	// Eligible supply from the most recent run (best estimate of the holder base).
	const recent = stats?.reflected?.recent?.[0];
	const eligibleSupply = recent ? atomicsToTokens(recent.eligible_supply_atomics ?? '0', dec) : 0;
	// Map slider 0–6 to a $THREE bag on a log scale (1 → 1,000,000).
	const update = () => {
		const v = Number(range.value);
		const bag = Math.round(Math.pow(10, v));
		const bagUsd = LIVE_PRICE > 0 ? bag * LIVE_PRICE : null;
		let earned = null;
		if (eligibleSupply > 0 && reflectedTotal > 0) earned = (bag / eligibleSupply) * reflectedTotal;
		out.innerHTML = `Holding <b>${fmtCompact(bag)} $THREE</b>${bagUsd != null ? ` <span class="ec-muted">(${fmtUsd(bagUsd)})</span>` : ''}<br/>` +
			(earned != null && earned > 0
				? `you'd have earned <b>≈ ${fmtCompact(earned)} $THREE</b> from reflections so far — and a fee discount on everything you buy.`
				: `<span class="ec-muted">earns a share of every future reflection, plus a fee discount that grows with your tier.</span>`);
	};
	range.addEventListener('input', update);
	update();
}

function wireNameStudio(root) {
	const input = root.querySelector('#ec-name-input');
	const out = root.querySelector('#ec-name-out');
	if (!input || !out) return;
	const RANK = { common: 0.18, uncommon: 0.42, rare: 0.64, epic: 0.84, legendary: 1 };
	let timer = null;
	let seq = 0;
	const run = async () => {
		const name = input.value.trim();
		if (!name) {
			out.innerHTML = '<span class="ec-muted">Type a name to see its rarity and price.</span>';
			return;
		}
		const mine = ++seq;
		try {
			const q = await getJSON(`${API}/name-quote?name=${encodeURIComponent(name)}`);
			if (mine !== seq) return;
			const pct = (RANK[q.rarity] || 0.18) * 100;
			const color = q.free ? 'var(--muted)' : `var(--${q.rarity === 'legendary' ? 'violet' : q.rarity === 'epic' ? 'blue' : q.rarity === 'rare' ? 'green' : 'gold'})`;
			const priceLine = q.free
				? `<span style="color:var(--green);font-weight:700">Free to mint</span> <span class="ec-muted">— common name</span>`
				: `<strong>${fmtUsd(q.usd)}</strong> <span class="ec-muted">${q.three ? `≈ ${fmtCompact(q.three.token_amount)} $THREE` : ''}</span>`;
			out.innerHTML = `
				<div class="ec-rare-head">
					<span class="ec-rarity r-${esc(q.rarity)}">${esc(q.rarity_label)}</span>
					<strong style="font-family:ui-monospace,Menlo,monospace">${esc(q.full_name)}</strong>
				</div>
				<div class="ec-rare-meter"><div class="ec-rare-fill" style="width:${pct}%;background:${color}"></div></div>
				<div style="font-size:14px">${priceLine}</div>
				<div class="ec-muted" style="font-size:12.5px;margin-top:6px">${esc((q.reasons || []).join(' · '))}</div>`;
		} catch (e) {
			if (mine !== seq) return;
			out.innerHTML =
				e.code === 'invalid_label'
					? '<div class="ec-err">Use letters, digits, and hyphens only (no leading/trailing hyphen).</div>'
					: '<span class="ec-muted">Couldn\'t price that name — try again in a moment.</span>';
		}
	};
	input.addEventListener('input', () => {
		clearTimeout(timer);
		timer = setTimeout(run, 260);
	});
}

// ── load orchestration ─────────────────────────────────────────────────────────
async function load(root) {
	const setErr = (id, msg) => {
		const el = document.getElementById(id);
		if (el) el.innerHTML = `<div class="ec-err">${esc(msg)}</div>`;
	};

	// Live $THREE price (for conversions) — best-effort, non-blocking.
	getJSON('/api/token/price')
		.then((p) => {
			LIVE_PRICE = Number(p?.price_usd) || 0;
		})
		.catch(() => {});

	// Stats drive the flow viz, the stat band, on-chain wallets, reflections + projector.
	getJSON(`${API}/stats`)
		.then((s) => {
			const band = document.getElementById('ec-stats');
			if (band) {
				band.innerHTML = statCards(s)
					.map(
						(c) =>
							`<div class="ec-stat" style="--accent:${c.accent}"><div class="v" style="--accent:${c.accent}"><span data-roll>0</span>${c.sym ? '<span class="sym">$THREE</span>' : ''}</div><div class="k">${esc(c.k)}</div></div>`,
					)
					.join('');
				const cards = statCards(s);
				band.querySelectorAll('[data-roll]').forEach((el, i) => {
					rollup(el, cards[i].v, cards[i].sym ? fmtCompact : (n) => Math.round(n).toLocaleString('en-US'));
				});
			}
			// Hero north-star metric: total $THREE returned to holders.
			const heroEl = document.querySelector('#ec-hero-stat [data-roll]');
			if (heroEl) {
				const dec = s?.token?.decimals ?? 6;
				rollup(heroEl, atomicsToTokens(s?.reflected?.total_atomics ?? '0', dec), fmtCompact, 1400);
			}
			const oc = document.getElementById('ec-onchain');
			if (oc) oc.innerHTML = onchainHTML(s);
			const rf = document.getElementById('ec-reflected');
			if (rf) {
				rf.innerHTML = reflectedHTML(s);
				wireProjector(s);
			}
			// Trust stamp: when the data is from and where it comes from.
			const stamp = document.getElementById('ec-stamp');
			if (stamp) {
				const when = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
				stamp.textContent = `Updated ${when} · source: Solana RPC + settle ledger`;
			}
			if (window._ecFlow) window._ecFlow.seed(s);
		})
		.catch(() => {
			setErr('ec-stats', 'Economy stats are temporarily unavailable.');
			setErr('ec-onchain', 'On-chain data is temporarily unavailable.');
			setErr('ec-reflected', 'Reflection history is temporarily unavailable.');
		});

	getJSON(`${API}/catalog`)
		.then((c) => {
			const actions = c.actions || [];
			wirePricing(actions);
			const cat = document.getElementById('ec-catalog');
			if (cat) {
				cat.innerHTML = catalogGroups(actions)
					.map(
						(g) =>
							`<div class="ec-cat"><h3>${esc(g.label)}</h3><div class="ec-items">${g.items
								.map((a) => {
									const price = a.usd == null ? `<span class="price var">per item</span>` : a.usd === 0 ? `<span class="price free">Free</span>` : `<span class="price">${fmtUsd(a.usd)}</span>`;
									return `<div class="ec-item"><span class="label">${esc(a.label)}</span>${price}</div>`;
								})
								.join('')}</div></div>`,
					)
					.join('');
			}
		})
		.catch(() => {
			setErr('ec-px-list', 'Price catalog is temporarily unavailable.');
			setErr('ec-catalog', 'Price catalog is temporarily unavailable.');
		});

	getJSON(`${API}/tier`)
		.then((t) => {
			DISCOUNT_BPS = Number(t?.tier?.discount_bps) || 0;
			const el = document.getElementById('ec-tiers');
			if (el) el.innerHTML = tiersHTML(t);
			// Re-render the price detail now that the discount is known.
			const sel = document.querySelector('.ec-px-item.sel');
			if (sel) sel.click();
		})
		.catch((e) => {
			if (e.status === 401 || e.status === 403) {
				const el = document.getElementById('ec-tiers');
				// Render the ladder without a "current" marker, plus a sign-in nudge.
				if (el)
					el.innerHTML = tiersHTML({
						ladder: DEFAULT_LADDER,
						tier: null,
						next: null,
					});
			} else {
				setErr('ec-tiers', 'Tier info is temporarily unavailable.');
			}
		});

	wireNameStudio(root);
}

// Static ladder shape so a signed-out visitor still sees the tiers (the live
// endpoint returns the authoritative copy; this mirrors api/_lib/three-tier.js).
const DEFAULT_LADDER = [
	{ level: 0, id: 'member', label: 'Member', min_usd: 0, discount_bps: 0, perks: ['Everything free-forever: create, discover, embed, social, basic worlds'] },
	{ level: 1, id: 'bronze', label: 'Bronze', min_usd: 25, discount_bps: 500, perks: ['5% off all $THREE compute', '2× free generation quota', 'Bronze profile badge'] },
	{ level: 2, id: 'silver', label: 'Silver', min_usd: 100, discount_bps: 1000, perks: ['10% off all $THREE compute', '3× free generation quota', 'Private worlds', 'Priority MCP routing'] },
	{ level: 3, id: 'gold', label: 'Gold', min_usd: 500, discount_bps: 2000, perks: ['20% off all $THREE compute', '5× free generation quota', 'Branded worlds', 'Early access to drops'] },
	{ level: 4, id: 'genesis', label: 'Genesis', min_usd: 2500, discount_bps: 3000, perks: ['30% off all $THREE compute', '10× free generation quota', 'First dibs on rare names', 'Genesis-only cosmetics'] },
];

function init() {
	injectStyles();
	document.title = 'The $THREE economy · three.ws';
	const root = document.createElement('main');
	root.innerHTML = shell();
	document.body.appendChild(root);

	// The Flow: start it, and pause when offscreen to save battery/CPU.
	const canvas = document.getElementById('ec-flow');
	if (canvas) {
		const flow = new FlowViz(canvas);
		window._ecFlow = flow;
		flow.start();
		if (typeof IntersectionObserver === 'function' && !REDUCED_MOTION) {
			new IntersectionObserver(
				(entries) => {
					for (const e of entries) {
						if (e.isIntersecting) flow.start();
						else flow.stop();
					}
				},
				{ threshold: 0.01 },
			).observe(canvas);
		}
		// WCAG 2.2.2 Pause/Stop/Hide — a control for the perpetual motion.
		const pauseBtn = document.getElementById('ec-flow-pause');
		if (pauseBtn) {
			if (REDUCED_MOTION) pauseBtn.style.display = 'none'; // nothing animating to pause
			pauseBtn.addEventListener('click', () => {
				flow.userPaused = !flow.userPaused;
				pauseBtn.setAttribute('aria-pressed', String(flow.userPaused));
				if (flow.userPaused) {
					flow.stop();
					pauseBtn.innerHTML = '▶ Play';
					pauseBtn.setAttribute('aria-label', 'Play the animation');
				} else {
					pauseBtn.innerHTML = '❚❚ Pause';
					pauseBtn.setAttribute('aria-label', 'Pause the animation');
					flow.start();
				}
			});
		}
	}

	observeReveal(root);
	load(root);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
