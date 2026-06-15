// The $THREE economy page (/three).
//
// One screen that explains and surfaces the whole economy: the no-burn policy,
// the holder-tier ladder (with the signed-in holder's live tier), the pay-per-use
// price catalog, a rare-name lookup, and live economy stats from the settle
// ledger. All data is real — /api/three/{catalog,stats,tier,name-quote} — with
// designed loading, empty, and error states. No mock data, no placeholders.

const API = '/api/three';
const CATEGORY_LABELS = {
	generation: 'Generation & compute',
	data: 'Data & intelligence',
	scarcity: 'Scarcity & collectibles',
	marketplace: 'Creator marketplace',
};

// ── formatters ──────────────────────────────────────────────────────────────
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtUsd = (n) => {
	const v = Number(n);
	if (!Number.isFinite(v)) return '—';
	if (v === 0) return 'Free';
	return v.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: v < 1 ? 2 : 0 });
};
const fmtCompact = (n) => {
	const v = Number(n);
	if (!Number.isFinite(v)) return '—';
	if (Math.abs(v) >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
	if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
	if (Math.abs(v) >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
	return v.toLocaleString('en-US', { maximumFractionDigits: 2 });
};
const atomicsToTokens = (atomics, decimals = 6) => {
	try {
		return Number(BigInt(atomics)) / 10 ** decimals;
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

// ── styles ──────────────────────────────────────────────────────────────────
function injectStyles() {
	const css = `
	:root { color-scheme: dark; }
	* { box-sizing: border-box; }
	body { margin:0; background:#0a0a0d; color:#f5f5f7; font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif; -webkit-font-smoothing:antialiased; }
	a { color:inherit; text-decoration:none; }
	.ec-wrap { max-width:1100px; margin:0 auto; padding:28px 18px 80px; }
	.ec-top { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:28px; }
	.ec-back { color:#8a8a93; font-size:13px; border:1px solid #232329; border-radius:8px; padding:6px 12px; transition:border-color .15s,color .15s; }
	.ec-back:hover { color:#fff; border-color:#3a3a44; }
	.ec-hero { text-align:center; padding:18px 0 30px; }
	.ec-badge { display:inline-block; font-size:11px; letter-spacing:.08em; text-transform:uppercase; color:#7ee787; border:1px solid #1f3a24; background:#0e1a10; border-radius:999px; padding:4px 12px; margin-bottom:14px; }
	.ec-h1 { font-size:clamp(28px,5vw,44px); font-weight:850; letter-spacing:-0.03em; margin:0 0 12px; background:linear-gradient(180deg,#fff,#b8b8c2); -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent; }
	.ec-lede { color:#9a9aa3; font-size:16px; max-width:640px; margin:0 auto; line-height:1.5; }
	.ec-cta { margin-top:20px; display:flex; gap:10px; justify-content:center; flex-wrap:wrap; }
	.ec-btn { font-size:14px; font-weight:600; padding:10px 18px; border-radius:10px; border:1px solid #232329; transition:transform .12s,border-color .15s,background .15s; cursor:pointer; }
	.ec-btn:hover { transform:translateY(-1px); }
	.ec-btn.primary { background:#fff; color:#000; border-color:#fff; }
	.ec-btn.primary:hover { background:#e8e8ee; }
	.ec-section { margin-top:44px; }
	.ec-section h2 { font-size:20px; font-weight:750; letter-spacing:-0.02em; margin:0 0 4px; }
	.ec-section p.ec-desc { color:#8a8a93; font-size:14px; margin:0 0 18px; }
	.ec-grid { display:grid; gap:12px; }
	.ec-stats { grid-template-columns:repeat(auto-fit,minmax(170px,1fr)); }
	.ec-stat { border:1px solid #1c1c22; border-radius:14px; padding:18px; background:linear-gradient(180deg,#101015,#0c0c10); }
	.ec-stat .v { font-size:26px; font-weight:800; letter-spacing:-0.02em; }
	.ec-stat .k { color:#8a8a93; font-size:12.5px; margin-top:4px; }
	.ec-tiers { grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); }
	.ec-tier { border:1px solid #1c1c22; border-radius:14px; padding:18px; background:#0e0e12; position:relative; transition:border-color .15s,transform .12s; }
	.ec-tier:hover { transform:translateY(-2px); border-color:#3a3a44; }
	.ec-tier.is-current { border-color:#7ee787; box-shadow:0 0 0 1px #1f3a24; }
	.ec-tier .badge-you { position:absolute; top:-9px; right:12px; font-size:10px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; color:#0a0a0d; background:#7ee787; border-radius:999px; padding:3px 9px; }
	.ec-tier .tname { font-size:16px; font-weight:750; }
	.ec-tier .tmin { color:#8a8a93; font-size:12.5px; margin:2px 0 12px; }
	.ec-tier ul { list-style:none; margin:0; padding:0; }
	.ec-tier li { font-size:12.5px; color:#c2c2cc; padding:4px 0 4px 18px; position:relative; }
	.ec-tier li::before { content:'›'; position:absolute; left:2px; color:#7ee787; }
	.ec-cat { margin-bottom:22px; }
	.ec-cat h3 { font-size:13px; text-transform:uppercase; letter-spacing:.06em; color:#8a8a93; margin:0 0 10px; }
	.ec-items { display:grid; gap:8px; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); }
	.ec-item { display:flex; align-items:center; justify-content:space-between; gap:12px; border:1px solid #1a1a20; border-radius:11px; padding:12px 14px; background:#0d0d11; }
	.ec-item .label { font-size:13.5px; }
	.ec-item .price { font-size:13.5px; font-weight:700; white-space:nowrap; }
	.ec-item .price.free { color:#7ee787; }
	.ec-item .price.var { color:#9a9aa3; font-weight:500; }
	.ec-name { display:flex; gap:8px; margin-top:6px; max-width:460px; }
	.ec-name input { flex:1; background:#0d0d11; border:1px solid #232329; border-radius:10px; padding:11px 14px; color:#fff; font-size:14px; font-family:ui-monospace,Menlo,monospace; }
	.ec-name input:focus { outline:none; border-color:#3a3a44; }
	.ec-name-out { margin-top:12px; min-height:22px; font-size:14px; }
	.ec-rarity { display:inline-block; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; border-radius:999px; padding:3px 10px; margin-right:8px; }
	.r-legendary { background:#2a1a3a; color:#d6a8ff; } .r-epic { background:#1a2a3a; color:#8ec8ff; }
	.r-rare { background:#1a2a24; color:#7ee7b8; } .r-uncommon { background:#2a261a; color:#e7d68e; } .r-common { background:#1c1c22; color:#9a9aa3; }
	.ec-foot { margin-top:48px; padding-top:20px; border-top:1px solid #1a1a20; color:#6a6a73; font-size:12.5px; text-align:center; line-height:1.6; }
	.ec-skel { background:linear-gradient(90deg,#141419,#1c1c22,#141419); background-size:200% 100%; animation:ec-sh 1.2s infinite; border-radius:11px; }
	@keyframes ec-sh { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
	.ec-err { border:1px solid #3a1f1f; background:#1a0e0e; color:#ff9b9b; border-radius:12px; padding:16px; font-size:13.5px; }
	.ec-muted { color:#8a8a93; }
	.ec-wallets { grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); }
	.ec-wallet { display:block; border:1px solid #1c1c22; border-radius:14px; padding:18px; background:linear-gradient(180deg,#101015,#0c0c10); transition:border-color .15s,transform .12s; }
	a.ec-wallet:hover { border-color:#7ee787; transform:translateY(-2px); }
	.ec-wallet .wlabel { font-size:12.5px; color:#8a8a93; }
	.ec-wallet .wbal { font-size:24px; font-weight:800; letter-spacing:-0.02em; margin:4px 0 6px; }
	.ec-wallet .waddr { font-family:ui-monospace,Menlo,monospace; font-size:11.5px; color:#7ee787; }
	.ec-reflect-head { display:flex; flex-direction:column; gap:2px; }
	.ec-reflect-head .v { font-size:30px; font-weight:850; letter-spacing:-0.02em; color:#7ee787; }
	.ec-reflect-head .k { color:#8a8a93; font-size:13.5px; }
	.ec-reflect-list { margin-top:14px; border:1px solid #1a1a20; border-radius:12px; overflow:hidden; }
	.ec-reflect-row { display:flex; justify-content:space-between; gap:12px; padding:11px 14px; font-size:13px; border-bottom:1px solid #15151a; }
	.ec-reflect-row:last-child { border-bottom:none; }
	@media (prefers-reduced-motion: reduce){ .ec-skel{ animation:none } .ec-btn:hover,.ec-tier:hover{ transform:none } }
	`;
	const el = document.createElement('style');
	el.textContent = css;
	document.head.appendChild(el);
}

// ── sections ──────────────────────────────────────────────────────────────────

function heroHTML() {
	return `
	<div class="ec-hero">
		<span class="ec-badge">$THREE · the only coin · no burns</span>
		<h1 class="ec-h1">The three.ws economy</h1>
		<p class="ec-lede">Everything that costs us compute is priced in $THREE. Hold $THREE for lower fees and bigger perks. Every spend flows to the treasury and reflects back to holders — supply is never burned.</p>
		<div class="ec-cta">
			<a class="ec-btn primary" href="/three-token">Get $THREE</a>
			<a class="ec-btn" href="#tiers">See holder tiers</a>
		</div>
	</div>`;
}

function statsHTML(stats) {
	const dec = stats?.token?.decimals ?? 6;
	const sym = stats?.token?.symbol ?? '$THREE';
	const gross = atomicsToTokens(stats?.gross_atomics ?? '0', dec);
	const rewards = atomicsToTokens(stats?.by_role?.rewards ?? '0', dec);
	const treasury = atomicsToTokens(stats?.by_role?.treasury ?? '0', dec);
	const toCreators = atomicsToTokens(stats?.by_role?.seller ?? '0', dec);
	const cards = [
		{ v: fmtCompact(gross), k: `${sym} settled volume` },
		{ v: fmtCompact(rewards), k: `${sym} reflected to holders` },
		{ v: fmtCompact(treasury), k: `${sym} to treasury → buybacks` },
		{ v: fmtCompact(toCreators), k: `${sym} earned by creators` },
		{ v: (stats?.payment_count ?? 0).toLocaleString('en-US'), k: 'settled payments' },
	];
	return `<div class="ec-grid ec-stats">${cards
		.map((c) => `<div class="ec-stat"><div class="v">${esc(c.v)}</div><div class="k">${esc(c.k)}</div></div>`)
		.join('')}</div>`;
}

// Verifiable on-chain panel — the wallets anyone can inspect. This is the answer
// to "trust us, we burned some": here are the addresses, check them yourself.
function onchainHTML(stats) {
	const dec = stats?.token?.decimals ?? 6;
	const sym = stats?.token?.symbol ?? '$THREE';
	const oc = stats?.onchain || {};
	const wallet = (w, label) => {
		if (!w?.address) {
			return `<div class="ec-wallet"><div class="wlabel">${esc(label)}</div><div class="wbal ec-muted">not configured</div></div>`;
		}
		const bal = fmtCompact(atomicsToTokens(w.balance_atomics ?? '0', dec));
		return `<a class="ec-wallet" href="${esc(w.explorer)}" target="_blank" rel="noopener">
			<div class="wlabel">${esc(label)}</div>
			<div class="wbal">${esc(bal)} ${esc(sym)}</div>
			<div class="waddr">${esc(shortAddr(w.address))} · verify on Solscan ↗</div>
		</a>`;
	};
	return `<div class="ec-grid ec-wallets">
		${wallet(oc.treasury, 'Treasury → buybacks')}
		${wallet(oc.rewards_pool, 'Holder rewards pool')}
	</div>`;
}

// Reflected-to-holders panel — real $THREE returned to holders, with run history.
// Beats a static "0.5% burned" counter: this is value RETURNED, not destroyed.
function reflectedHTML(stats) {
	const dec = stats?.token?.decimals ?? 6;
	const sym = stats?.token?.symbol ?? '$THREE';
	const r = stats?.reflected || { total_atomics: '0', run_count: 0, recent: [] };
	const total = fmtCompact(atomicsToTokens(r.total_atomics ?? '0', dec));
	const head = `<div class="ec-reflect-head"><div class="v">${esc(total)} ${esc(sym)}</div><div class="k">returned to holders across ${r.run_count} distribution${r.run_count === 1 ? '' : 's'} — never burned</div></div>`;
	if (!r.recent?.length) {
		return `${head}<p class="ec-muted" style="margin-top:12px">Distributions begin once the rewards pool funds. Every run will be listed here with an on-chain transaction you can verify.</p>`;
	}
	const rows = r.recent
		.map((d) => {
			const amt = fmtCompact(atomicsToTokens(d.distributed_atomics ?? '0', dec));
			const when = d.created_at ? new Date(d.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
			const status = d.status === 'completed' ? '✓ paid' : 'planned';
			return `<div class="ec-reflect-row"><span>${esc(when)}</span><span>${esc(amt)} ${esc(sym)} → ${d.holder_count} holders</span><span class="ec-muted">${esc(status)}</span></div>`;
		})
		.join('');
	return `${head}<div class="ec-reflect-list">${rows}</div>`;
}

function tiersHTML(tierData) {
	const ladder = tierData?.ladder || [];
	const currentLevel = tierData?.tier?.level ?? null;
	const sub =
		currentLevel != null
			? `You're <strong>${esc(tierData.tier.label)}</strong> — holding ${fmtUsd(tierData.held_usd)} of $THREE.${
					tierData.next ? ` ${fmtUsd(tierData.next.usd_to_go)} more to reach ${esc(tierData.next.label)}.` : ' Top tier reached.'
			  }`
			: 'Sign in and link a Solana wallet to see your tier.';
	const cards = ladder
		.map((t) => {
			const isCurrent = t.level === currentLevel;
			const perks = (t.perks || []).map((p) => `<li>${esc(p)}</li>`).join('');
			return `<div class="ec-tier${isCurrent ? ' is-current' : ''}">
				${isCurrent ? '<span class="badge-you">You</span>' : ''}
				<div class="tname">${esc(t.label)}</div>
				<div class="tmin">${t.min_usd > 0 ? `Hold ${fmtUsd(t.min_usd)}+` : 'Free — everyone'}${
				t.discount_bps > 0 ? ` · ${(t.discount_bps / 100).toFixed(0)}% off compute` : ''
			}</div>
				<ul>${perks}</ul>
			</div>`;
		})
		.join('');
	return `<p class="ec-desc">${sub}</p><div class="ec-grid ec-tiers">${cards}</div>`;
}

function catalogHTML(actions) {
	const byCat = {};
	for (const a of actions) (byCat[a.category] ||= []).push(a);
	const order = ['generation', 'data', 'scarcity', 'marketplace'];
	return order
		.filter((c) => byCat[c]?.length)
		.map((cat) => {
			const items = byCat[cat]
				.map((a) => {
					let price;
					if (a.usd == null) price = `<span class="price var">priced per item</span>`;
					else if (a.usd === 0) price = `<span class="price free">Free</span>`;
					else price = `<span class="price">${fmtUsd(a.usd)}</span>`;
					return `<div class="ec-item"><span class="label">${esc(a.label)}</span>${price}</div>`;
				})
				.join('');
			return `<div class="ec-cat"><h3>${esc(CATEGORY_LABELS[cat] || cat)}</h3><div class="ec-items">${items}</div></div>`;
		})
		.join('');
}

// ── rare-name lookup ────────────────────────────────────────────────────────
function wireNameLookup(root) {
	const input = root.querySelector('#ec-name-input');
	const out = root.querySelector('#ec-name-out');
	if (!input || !out) return;
	let timer = null;
	let seq = 0;
	const run = async () => {
		const name = input.value.trim();
		if (!name) {
			out.innerHTML = '<span class="ec-muted">Type a name to check its rarity and price.</span>';
			return;
		}
		const mine = ++seq;
		out.innerHTML = '<span class="ec-muted">Checking…</span>';
		try {
			const q = await getJSON(`${API}/name-quote?name=${encodeURIComponent(name)}`);
			if (mine !== seq) return; // a newer keystroke superseded this
			const rarity = `<span class="ec-rarity r-${esc(q.rarity)}">${esc(q.rarity_label)}</span>`;
			if (q.free) {
				out.innerHTML = `${rarity}<strong>${esc(q.full_name)}</strong> — <span style="color:#7ee787">free to mint</span> <span class="ec-muted">(common name)</span>`;
			} else {
				const tokens = q.three ? `${fmtCompact(q.three.token_amount)} $THREE` : '';
				out.innerHTML = `${rarity}<strong>${esc(q.full_name)}</strong> — ${fmtUsd(q.usd)} <span class="ec-muted">≈ ${esc(tokens)} · ${esc(q.reasons.join(', '))}</span>`;
			}
		} catch (e) {
			if (mine !== seq) return;
			out.innerHTML =
				e.code === 'invalid_label'
					? '<span class="ec-err" style="display:inline-block;padding:6px 10px">Use letters, digits, and hyphens only.</span>'
					: '<span class="ec-muted">Couldn\'t price that name — try again.</span>';
		}
	};
	input.addEventListener('input', () => {
		clearTimeout(timer);
		timer = setTimeout(run, 280);
	});
}

// ── render ──────────────────────────────────────────────────────────────────
function shell() {
	return `
	<div class="ec-wrap">
		<div class="ec-top">
			<a class="ec-back" href="/">← three.ws</a>
			<a class="ec-back" href="/three-token">$THREE price ↗</a>
		</div>
		${heroHTML()}
		<div class="ec-section" id="stats"><h2>Live economy</h2><p class="ec-desc">Settled on-chain through the $THREE rail. No burns — every spend reflects to holders or funds buybacks.</p><div id="ec-stats"><div class="ec-grid ec-stats">${'<div class="ec-stat ec-skel" style="height:84px"></div>'.repeat(5)}</div></div></div>
		<div class="ec-section" id="verify"><h2>Verify on-chain</h2><p class="ec-desc">No anonymous "trust us." The treasury and the holder-rewards pool are real Solana wallets — open them on Solscan and check the balances against the numbers above.</p><div id="ec-onchain"><div class="ec-grid ec-wallets">${'<div class="ec-wallet ec-skel" style="height:96px"></div>'.repeat(2)}</div></div></div>
		<div class="ec-section" id="reflected"><h2>Reflected to holders</h2><p class="ec-desc">We never burn supply. The rewards pool is distributed pro-rata back to $THREE holders — value returned, not destroyed. Every run is recorded here.</p><div id="ec-reflected"><div class="ec-skel" style="height:80px"></div></div></div>
		<div class="ec-section" id="tiers"><h2>Holder tiers</h2><div id="ec-tiers"><div class="ec-grid ec-tiers">${'<div class="ec-tier ec-skel" style="height:150px"></div>'.repeat(5)}</div></div></div>
		<div class="ec-section" id="names"><h2>Rare names</h2><p class="ec-desc">Common <code>*.threews.sol</code> names are free. Short, dictionary, and reserved names are rare — priced in $THREE.</p>
			<div class="ec-name"><input id="ec-name-input" type="text" placeholder="yourname" autocomplete="off" spellcheck="false" maxlength="63" aria-label="Check a name's rarity" /></div>
			<div class="ec-name-out" id="ec-name-out"><span class="ec-muted">Type a name to check its rarity and price.</span></div>
		</div>
		<div class="ec-section" id="pricing"><h2>What you pay for</h2><p class="ec-desc">Only things that cost real compute or are genuinely scarce. Everything else — creating, discovering, embedding, chatting, basic worlds, draft generation — is free forever.</p><div id="ec-catalog"><div class="ec-grid ec-items">${'<div class="ec-item ec-skel" style="height:46px"></div>'.repeat(8)}</div></div></div>
		<div class="ec-foot">$THREE is the only coin three.ws references. Contract <code>FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump</code>. Prices shown in USD settle in $THREE at the live market price.</div>
	</div>`;
}

async function load() {
	const setErr = (id, msg) => {
		const el = document.getElementById(id);
		if (el) el.innerHTML = `<div class="ec-err">${esc(msg)}</div>`;
	};

	// Stats + catalog are public; tier needs auth (gracefully optional). One stats
	// fetch feeds three panels: the headline cards, the verifiable wallets, and the
	// reflected-to-holders history.
	getJSON(`${API}/stats`)
		.then((s) => {
			const stats = document.getElementById('ec-stats');
			if (stats) stats.innerHTML = statsHTML(s);
			const onchain = document.getElementById('ec-onchain');
			if (onchain) onchain.innerHTML = onchainHTML(s);
			const reflected = document.getElementById('ec-reflected');
			if (reflected) reflected.innerHTML = reflectedHTML(s);
		})
		.catch(() => {
			setErr('ec-stats', 'Economy stats are temporarily unavailable.');
			setErr('ec-onchain', 'On-chain data is temporarily unavailable.');
			setErr('ec-reflected', 'Reflection history is temporarily unavailable.');
		});

	getJSON(`${API}/catalog`)
		.then((c) => {
			const el = document.getElementById('ec-catalog');
			if (el) el.innerHTML = catalogHTML(c.actions || []);
		})
		.catch(() => setErr('ec-catalog', 'Price catalog is temporarily unavailable.'));

	getJSON(`${API}/tier`)
		.then((t) => {
			const el = document.getElementById('ec-tiers');
			if (el) el.innerHTML = tiersHTML(t);
		})
		.catch(async (e) => {
			// 401 isn't an error here — show the ladder without a "current" tier.
			if (e.status === 401 || e.status === 403) {
				try {
					const c = await getJSON(`${API}/catalog`); // cheap warm call already cached
					void c;
				} catch {
					/* ignore */
				}
				// Re-render the ladder from the public stats endpoint's perspective:
				// fetch tier ladder anonymously is not available, so render a sign-in prompt
				// plus the static ladder shape from a tier-pass-less call is impossible;
				// instead show the prompt — the ladder fills once signed in.
				const el = document.getElementById('ec-tiers');
				if (el)
					el.innerHTML =
						'<p class="ec-desc">Sign in and link a Solana wallet to see your tier and unlock holder perks.</p>';
			} else {
				setErr('ec-tiers', 'Tier info is temporarily unavailable.');
			}
		});
}

function init() {
	injectStyles();
	document.title = 'The $THREE economy · three.ws';
	const root = document.createElement('main');
	root.innerHTML = shell();
	document.body.appendChild(root);
	wireNameLookup(root);
	load();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
