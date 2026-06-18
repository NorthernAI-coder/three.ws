// $THREE Intel (/three-intel) — the live on-chain intelligence terminal.
//
// The first real *use* of $THREE beyond Forge: holding the coin unlocks the live
// signal feed; spending it buys a synthesized per-token Deep Report. This module
// is the page: a live radar feed (server-gated live vs 30-min-delayed by holder
// tier), a free per-token scanner, a holder-only narrative panel (aixbt), and the
// pay-per-use Deep Report. Every datum is real — the feed is the Coin Intelligence
// Engine's on-chain observations, market is the shared keyless market module, and
// sentiment is live pump.fun commentary. Every state is designed.
//
// Identity reuses the platform's shared wallet/tier plumbing (the hidden global
// connect button + the tier pass), so a connected holder is recognized here
// exactly as in the nav and Forge — one source of truth.

import './three-intel.css';
import { createThreeTokenData } from './pump/three-token-data.js';
import { initWalletButton, getConnectedWalletAddress } from './wallet.js';
import { mountTierBadge, attachTierPass, primeTierPass, getTierPass } from './three-access.js';
import { payForDeepReport } from './intel-pay.js';

const FEED_URL = '/api/three-intel/feed';
const TOKEN_URL = '/api/three-intel/token';
const REPORT_URL = '/api/three-intel/deep-report';
const ECONOMY_URL = '/three';
const THREE_MINT_DEFAULT = 'FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump';
const JUPITER_URL = `https://jup.ag/swap/SOL-${THREE_MINT_DEFAULT}`;

// ── formatters ──────────────────────────────────────────────────────────────
const esc = (s) =>
	String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtUsd = (n, max = 2) => {
	const v = Number(n);
	if (!Number.isFinite(v)) return '—';
	return v.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: v !== 0 && Math.abs(v) < 1 ? 6 : max });
};
const fmtCompact = (n) => {
	const v = Number(n);
	if (!Number.isFinite(v)) return '—';
	if (Math.abs(v) >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
	if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
	if (Math.abs(v) >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
	return fmtUsd(v);
};
const fmtPct = (n) => {
	const v = Number(n);
	if (!Number.isFinite(v)) return '';
	return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
};
function timeAgo(ts) {
	const t = new Date(ts).getTime();
	if (!Number.isFinite(t)) return '';
	const s = Math.max(0, (Date.now() - t) / 1000);
	if (s < 60) return `${Math.floor(s)}s ago`;
	if (s < 3600) return `${Math.floor(s / 60)}m ago`;
	if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
	return `${Math.floor(s / 86400)}d ago`;
}
const pct100 = (v) => {
	const n = Number(v);
	if (!Number.isFinite(n) || n <= 0) return 0;
	return n <= 1 ? Math.round(n * 100) : Math.min(100, Math.round(n));
};
const scoreColor = (s) => (s >= 66 ? '#6ee7a8' : s <= 38 ? '#ff8a8a' : '#f5c451');

// authed fetch — carries the cached holder tier pass (so a connected holder gets
// the live feed) and the session cookie.
function intelFetch(url, opts = {}) {
	const headers = attachTierPass({ ...(opts.headers || {}) });
	return fetch(url, { credentials: 'include', ...opts, headers });
}

// ── signal chips ──────────────────────────────────────────────────────────────
function signalChips(row) {
	const chips = [];
	const bundle = pct100(row.bundle_score);
	const organic = pct100(row.organic_score);
	const conc = pct100(row.concentration_top10);
	if (Number.isFinite(Number(row.quality_score))) chips.push(`<span class="ti-chip">Q ${Math.round(Number(row.quality_score))}</span>`);
	if (organic >= 55) chips.push(`<span class="ti-chip good">Organic ${organic}%</span>`);
	if (bundle >= 45) chips.push(`<span class="ti-chip warn">Bundle ${bundle}%</span>`);
	if (conc >= 50) chips.push(`<span class="ti-chip warn">Top10 ${conc}%</span>`);
	if (row.dev_sold) chips.push('<span class="ti-chip bad">Dev sold</span>');
	for (const f of (row.risk_flags || []).slice(0, 2)) chips.push(`<span class="ti-chip bad">${esc(String(f).replace(/_/g, ' '))}</span>`);
	if (row.category) chips.push(`<span class="ti-chip">${esc(row.category)}</span>`);
	return chips.join('');
}

function coinRow(row) {
	const a = row.assessment || {};
	const img = row.image_uri
		? `<img class="ti-av" src="${esc(row.image_uri)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">`
		: '<div class="ti-av"></div>';
	return `
<div class="ti-row" data-mint="${esc(row.mint)}" data-sym="${esc(row.symbol || '')}">
  ${img}
  <div class="ti-row-main">
    <div class="ti-row-top">
      <span class="ti-sym">${esc(row.symbol || row.mint.slice(0, 4))}</span>
      <span class="ti-name">${esc(row.name || '')}${row.first_seen_at ? ' · ' + timeAgo(row.first_seen_at) : ''}</span>
    </div>
    <div class="ti-chips">${signalChips(row)}</div>
  </div>
  <div class="ti-row-end">
    ${a.verdict ? `<span class="ti-verdict ${esc(a.verdict)}">${esc(a.verdictLabel)}</span>` : ''}
    <div class="ti-row-actions">
      <button class="ti-mini" data-scan="${esc(row.mint)}">Scan</button>
      <button class="ti-mini violet" data-report="${esc(row.mint)}" data-rsym="${esc(row.symbol || '')}">Report</button>
    </div>
  </div>
</div>`;
}

function skeletonRows(n = 6) {
	return Array.from({ length: n })
		.map(
			() => `<div class="ti-sk-row"><div class="ti-sk ti-sk-av"></div>
      <div><div class="ti-sk ti-sk-line" style="width:42%"></div><div class="ti-sk ti-sk-line" style="width:70%;margin-top:8px"></div></div>
      <div class="ti-sk ti-sk-line" style="width:54px;height:18px"></div></div>`,
		)
		.join('');
}

// ── feed ──────────────────────────────────────────────────────────────────────
let _lastMinQuality = '';

async function loadFeed() {
	const feedEl = document.getElementById('ti-feed');
	const headEl = document.getElementById('ti-feed-status');
	const unlockEl = document.getElementById('ti-unlock');
	if (!feedEl) return;
	feedEl.innerHTML = skeletonRows();
	try {
		const qs = _lastMinQuality ? `?min_quality=${encodeURIComponent(_lastMinQuality)}` : '';
		const r = await intelFetch(`${FEED_URL}${qs}`);
		const data = await r.json();
		if (!r.ok || !data?.ok) throw new Error(data?.message || `feed ${r.status}`);
		renderFeed(data, { feedEl, headEl, unlockEl });
		renderNarrative(data);
	} catch {
		feedEl.innerHTML = `<div class="ti-error"><b>Couldn't load the feed</b>The intelligence feed is unreachable right now. <button class="ti-mini" id="ti-feed-retry">Retry</button></div>`;
		document.getElementById('ti-feed-retry')?.addEventListener('click', loadFeed);
	}
}

function renderFeed(data, { feedEl, headEl, unlockEl }) {
	const acc = data.access || {};
	if (headEl) {
		headEl.className = `ti-status-pill ${acc.eligible ? 'live' : 'delayed'}`;
		headEl.innerHTML = acc.eligible
			? '<span class="ti-dot"></span>Live'
			: `Delayed ${acc.delay_minutes || 30}m`;
	}
	// Unlock banner for non-holders.
	if (unlockEl) {
		if (acc.eligible) {
			unlockEl.hidden = true;
			unlockEl.innerHTML = '';
		} else {
			unlockEl.hidden = false;
			const hasWallet = Boolean(getConnectedWalletAddress());
			unlockEl.innerHTML = `
        <div class="ti-unlock-txt">You're seeing signals on a <b>${acc.delay_minutes || 30}-minute delay</b>. Hold $THREE (Bronze+) to unlock the <b>live</b> feed and the holder narrative layer.</div>
        <a class="ti-cta ti-cta--gold" href="${JUPITER_URL}" target="_blank" rel="noopener">Get $THREE</a>
        ${hasWallet ? '<button class="ti-cta ti-cta--ghost" id="ti-verify">I hold — verify</button>' : `<a class="ti-cta ti-cta--ghost" href="${ECONOMY_URL}">Tiers</a>`}`;
			document.getElementById('ti-verify')?.addEventListener('click', async (e) => {
				const btn = e.currentTarget;
				btn.textContent = 'Verifying…';
				btn.disabled = true;
				try {
					await getTierPass({ interactive: true });
				} catch {
					/* user may cancel the signature — fall through to reload */
				}
				loadFeed();
			});
		}
	}
	if (!data.feed || data.feed.length === 0) {
		feedEl.innerHTML = `<div class="ti-feed-empty"><b>No coins in the window yet</b>The intelligence engine surfaces coins as they're observed on-chain. Check back in a moment, or scan a specific mint on the right.</div>`;
		return;
	}
	feedEl.innerHTML = data.feed.map(coinRow).join('');
	feedEl.querySelectorAll('[data-scan]').forEach((b) =>
		b.addEventListener('click', () => runScan(b.getAttribute('data-scan'))),
	);
	feedEl.querySelectorAll('[data-report]').forEach((b) =>
		b.addEventListener('click', () => runDeepReport(b.getAttribute('data-report'), b.getAttribute('data-rsym'))),
	);
}

function renderNarrative(data) {
	const panel = document.getElementById('ti-narrative-panel');
	const body = document.getElementById('ti-narrative');
	if (!panel || !body) return;
	const items = data.narrative_intel;
	if (!data.access?.eligible) {
		panel.hidden = false;
		body.innerHTML = `<div class="ti-scan-empty">Narrative intelligence is a <b>holder</b> layer. Hold $THREE to see the live narrative feed alongside the signals.</div>`;
		return;
	}
	if (!data.aixbt_enabled) {
		panel.hidden = true; // no narrative source configured — hide rather than show an empty promise
		return;
	}
	panel.hidden = false;
	if (!Array.isArray(items) || items.length === 0) {
		body.innerHTML = `<div class="ti-scan-empty">No fresh narrative items right now.</div>`;
		return;
	}
	body.innerHTML = items
		.slice(0, 6)
		.map((it) => {
			const title = it.title || it.headline || it.summary || it.text || 'Intel';
			const meta = [it.category, it.chain, it.created_at ? timeAgo(it.created_at) : '']
				.filter(Boolean)
				.join(' · ');
			return `<div class="ti-narr-item"><div class="t">${esc(String(title).slice(0, 180))}</div>${meta ? `<div class="m">${esc(meta)}</div>` : ''}</div>`;
		})
		.join('');
}

// ── scanner ─────────────────────────────────────────────────────────────────
const MINT_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

async function runScan(mint) {
	const body = document.getElementById('ti-scan-body');
	const input = document.getElementById('ti-scan-input');
	if (input && mint) input.value = mint;
	if (!body) return;
	mint = String(mint || '').trim();
	if (!MINT_RE.test(mint)) {
		body.innerHTML = `<div class="ti-scan-empty"><b>Enter a token mint</b>Paste a Solana mint address to pull its on-chain signals, market, and sentiment.</div>`;
		return;
	}
	body.innerHTML = `<div class="ti-scan-card"><div class="ti-sk ti-sk-line" style="height:40px"></div><div class="ti-sk ti-sk-line" style="height:60px;margin-top:10px"></div><div class="ti-sk ti-sk-line" style="height:80px;margin-top:10px"></div></div>`;
	try {
		const r = await intelFetch(`${TOKEN_URL}?mint=${encodeURIComponent(mint)}`);
		const data = await r.json();
		if (!r.ok || !data?.ok) throw new Error(data?.message || `scan ${r.status}`);
		renderScan(data);
	} catch {
		body.innerHTML = `<div class="ti-error"><b>Scan failed</b>Couldn't read that token. Check the mint and try again.</div>`;
	}
}

function renderScan(data) {
	const body = document.getElementById('ti-scan-body');
	if (!body) return;
	const { coin, assessment: a, market: m, sentiment: s, observed } = data;
	const sym = coin?.symbol || data.mint.slice(0, 4);
	const head = `
<div class="ti-scan-head">
  ${coin?.image_uri ? `<img src="${esc(coin.image_uri)}" alt="" onerror="this.style.visibility='hidden'">` : '<div class="ti-av"></div>'}
  <div><div class="s">${esc(sym)}${a ? ` <span class="ti-verdict ${esc(a.verdict)}" style="vertical-align:middle">${esc(a.verdictLabel)}</span>` : ''}</div>
  <div class="n">${esc(coin?.name || data.mint.slice(0, 10) + '…')}</div></div>
</div>`;

	const metrics = m
		? `<div class="ti-metrics">
      <div class="ti-metric"><div class="k">Price</div><div class="v">${fmtUsd(m.price_usd, 6)}</div></div>
      <div class="ti-metric"><div class="k">24h</div><div class="v ${Number(m.price_change_24h) >= 0 ? 'pos' : 'neg'}">${m.price_change_24h != null ? fmtPct(m.price_change_24h) : '—'}</div></div>
      <div class="ti-metric"><div class="k">Mkt cap</div><div class="v">${fmtCompact(m.market_cap)}</div></div>
      <div class="ti-metric"><div class="k">Liquidity</div><div class="v">${fmtCompact(m.liquidity)}</div></div>
    </div>`
		: '<div class="ti-scan-empty">No live market data for this mint.</div>';

	const gauges = a
		? `<div class="ti-gauge">
      <div class="ti-gauge-row"><span>Risk</span><span>${a.risk}/100</span></div>
      <div class="ti-bar risk"><i style="width:${a.risk}%"></i></div>
      <div class="ti-gauge-row" style="margin-top:8px"><span>Organic strength</span><span>${a.organic}/100</span></div>
      <div class="ti-bar org"><i style="width:${a.organic}%"></i></div>
    </div>`
		: `<div class="ti-scan-empty">${observed ? '' : 'Not observed by the intelligence engine (launched before it, or too old). Market + sentiment shown above.'}</div>`;

	const sentiment = s
		? `<div class="ti-sec"><h4>Sentiment · ${s.count} comments</h4>
       <div class="ti-gauge-row"><span class="ti-chip good">${s.posPct}% pos</span><span class="ti-chip bad">${s.negPct}% neg</span><span class="ti-chip">${s.neuPct}% neu</span></div></div>`
		: '';

	const reasons = a?.reasons?.length
		? `<div class="ti-sec"><h4>Signal read</h4><ul class="ti-reasons">${a.reasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ul></div>`
		: '';

	body.innerHTML = `<div class="ti-scan-card">${head}${metrics}${gauges}${sentiment}${reasons}
    <button class="ti-cta ti-cta--violet" id="ti-scan-report" data-rsym="${esc(coin?.symbol || '')}">Deep Report · pay in $THREE</button></div>`;
	document.getElementById('ti-scan-report')?.addEventListener('click', () => runDeepReport(data.mint, coin?.symbol || ''));
}

// ── deep report (paid) ────────────────────────────────────────────────────────
let _reportPrice = null;
async function reportPrice() {
	if (_reportPrice != null) return _reportPrice;
	try {
		const r = await fetch(REPORT_URL);
		const d = await r.json();
		_reportPrice = Number(d?.usd) || 0.1;
	} catch {
		_reportPrice = 0.1;
	}
	return _reportPrice;
}

async function runDeepReport(mint, symbol) {
	mint = String(mint || '').trim();
	if (!MINT_RE.test(mint)) return;
	const usd = await reportPrice();
	const pay = await payForDeepReport({ usd, symbol });
	if (!pay.ok) return;
	const loading = openDossier(null, { loading: true, symbol });
	try {
		const r = await intelFetch(REPORT_URL, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ mint, payment_id: pay.paymentId, ref_id: pay.refId }),
		});
		const data = await r.json();
		if (!r.ok || !data?.ok) throw new Error(data?.message || 'report failed');
		loading.update(data.report);
	} catch (err) {
		loading.error(err);
	}
}

function openDossier(report, { loading = false, symbol = '' } = {}) {
	const overlay = document.createElement('div');
	overlay.className = 'ti-dossier-overlay';
	overlay.setAttribute('role', 'dialog');
	overlay.setAttribute('aria-modal', 'true');
	overlay.setAttribute('aria-label', 'Deep Report');
	overlay.innerHTML = `<div class="ti-dossier"><button class="ti-dossier-x" aria-label="Close">×</button><div class="ti-dossier-inner"></div></div>`;
	document.body.appendChild(overlay);
	const inner = overlay.querySelector('.ti-dossier-inner');
	const close = () => {
		document.removeEventListener('keydown', onKey);
		overlay.classList.remove('in');
		setTimeout(() => overlay.remove(), 240);
	};
	const onKey = (e) => e.key === 'Escape' && close();
	document.addEventListener('keydown', onKey);
	overlay.addEventListener('click', (e) => e.target === overlay && close());
	overlay.querySelector('.ti-dossier-x').addEventListener('click', close);
	requestAnimationFrame(() => overlay.classList.add('in'));

	const renderLoading = () => {
		inner.innerHTML = `<h3>Building report${symbol ? ` · ${esc(symbol)}` : ''}</h3><div class="sc">Synthesizing on-chain signals, market data, and sentiment…</div>
      <div class="ti-sk ti-sk-line" style="height:72px"></div><div class="ti-sk ti-sk-line" style="height:60px;margin-top:12px"></div><div class="ti-sk ti-sk-line" style="height:90px;margin-top:12px"></div>`;
	};
	if (loading) renderLoading();
	else if (report) inner.innerHTML = dossierHtml(report);

	return {
		update: (rep) => {
			inner.innerHTML = dossierHtml(rep);
		},
		error: (err) => {
			inner.innerHTML = `<h3>Report unavailable</h3><div class="sc">${esc(err?.message || 'Something went wrong building the report.')} Your payment is recorded — retry from the same token to claim it without paying again.</div><button class="ti-cta ti-cta--ghost" id="ti-dossier-close">Close</button>`;
			inner.querySelector('#ti-dossier-close')?.addEventListener('click', close);
		},
		close,
	};
}

function dossierHtml(rep) {
	const syn = rep.synthesis || {};
	const subj = rep.subject || {};
	const m = rep.market;
	const a = rep.assessment;
	const s = rep.sentiment;
	const sym = subj.symbol || rep.mint.slice(0, 4);
	const col = scoreColor(syn.score ?? 50);
	const market = m
		? `<div class="ti-metrics" style="margin-top:4px">
      <div class="ti-metric"><div class="k">Price</div><div class="v">${fmtUsd(m.price_usd, 6)}</div></div>
      <div class="ti-metric"><div class="k">24h</div><div class="v ${Number(m.price_change_24h) >= 0 ? 'pos' : 'neg'}">${m.price_change_24h != null ? fmtPct(m.price_change_24h) : '—'}</div></div>
      <div class="ti-metric"><div class="k">Mkt cap</div><div class="v">${fmtCompact(m.market_cap)}</div></div>
      <div class="ti-metric"><div class="k">Liquidity</div><div class="v">${fmtCompact(m.liquidity)}</div></div>
    </div>`
		: '';
	const findings = (syn.findings || []).length
		? `<div class="ti-sec"><h4>Key findings</h4><ul class="ti-reasons">${syn.findings.map((f) => `<li>${esc(f.text)}</li>`).join('')}</ul></div>`
		: '';
	const dist =
		rep.distribution?.top_wallets?.length
			? `<div class="ti-sec"><h4>Distribution · top observed wallets</h4><ul class="ti-reasons">${rep.distribution.top_wallets
					.slice(0, 5)
					.map((w) => `<li>${esc(w.wallet.slice(0, 4))}…${esc(w.wallet.slice(-4))} — ${(Number(w.buy_sol) || 0).toFixed(2)} SOL in${w.is_creator ? ' · creator' : ''}</li>`)
					.join('')}</ul></div>`
			: '';
	const sent = s
		? `<div class="ti-sec"><h4>Sentiment · ${s.count} comments</h4><div class="ti-gauge-row"><span class="ti-chip good">${s.posPct}% pos</span><span class="ti-chip bad">${s.negPct}% neg</span><span class="ti-chip">${s.neuPct}% neu</span></div></div>`
		: '';
	const gauges = a
		? `<div class="ti-sec"><h4>On-chain</h4><div class="ti-gauge">
       <div class="ti-gauge-row"><span>Risk</span><span>${a.risk}/100</span></div><div class="ti-bar risk"><i style="width:${a.risk}%"></i></div>
       <div class="ti-gauge-row" style="margin-top:8px"><span>Organic strength</span><span>${a.organic}/100</span></div><div class="ti-bar org"><i style="width:${a.organic}%"></i></div></div></div>`
		: '';
	return `
<h3>${esc(sym)} · Deep Report</h3>
<div class="sc">${esc(subj.name || rep.mint.slice(0, 12) + '…')}${subj.category ? ' · ' + esc(subj.category) : ''}</div>
<div class="ti-score-wrap">
  <div class="ti-score-ring" style="background:conic-gradient(${col} ${(syn.score ?? 50) * 3.6}deg, rgba(255,255,255,.07) 0);color:${col}"><span style="background:#14151d;width:56px;height:56px;border-radius:50%;display:grid;place-items:center">${syn.score ?? '—'}</span></div>
  <div><div class="ti-stance" style="color:${col}">${esc(syn.stanceLabel || '—')}</div><div class="ti-stance-sub">${esc(syn.headline || '')}</div></div>
</div>
${market}${gauges}${findings}${sent}${dist}
<div class="ti-disc">${esc(syn.disclaimer || 'Signal-based intelligence. Not financial advice.')}</div>`;
}

// ── shell ─────────────────────────────────────────────────────────────────────
function buildShell() {
	const root = document.createElement('div');
	root.className = 'ti-root';
	root.innerHTML = `
<div class="ti-wrap">
  <div class="ti-top">
    <div class="ti-brand">
      <a href="/three-token"><div class="ti-brand-title"><span class="ti-dot"></span>$THREE Intel</div></a>
      <div class="ti-brand-sub">Live on-chain intelligence — hold to unlock, spend for the deep read.</div>
    </div>
    <div class="ti-ticker" id="ti-ticker" hidden></div>
    <span class="ti-badge-slot" id="ti-badge"></span>
    <button class="ti-connect" id="ti-connect-chip" type="button">Connect</button>
  </div>

  <div class="ti-grid">
    <section class="ti-panel">
      <div class="ti-panel-head">
        <h2>Live Terminal</h2>
        <span class="ti-status-pill delayed" id="ti-feed-status">·</span>
        <span class="ti-spacer"></span>
        <select class="ti-select" id="ti-quality" aria-label="Minimum quality">
          <option value="">All signals</option>
          <option value="50">Quality ≥ 50</option>
          <option value="70">Quality ≥ 70</option>
          <option value="85">Quality ≥ 85</option>
        </select>
      </div>
      <div class="ti-unlock" id="ti-unlock" hidden></div>
      <div class="ti-feed" id="ti-feed"></div>
    </section>

    <aside class="ti-aside">
      <section class="ti-panel">
        <div class="ti-panel-head"><h2>Token Scanner</h2></div>
        <form class="ti-scan-form" id="ti-scan-form">
          <input class="ti-input" id="ti-scan-input" placeholder="Paste a Solana mint…" autocomplete="off" spellcheck="false" />
          <button class="ti-cta ti-cta--violet" type="submit">Scan</button>
        </form>
        <div class="ti-scan-body" id="ti-scan-body">
          <div class="ti-scan-empty"><b>Scan any token</b>On-chain signals, live market, sentiment, and a verdict — free. Or open a paid Deep Report for the full synthesis.</div>
        </div>
      </section>

      <section class="ti-panel" id="ti-narrative-panel" hidden>
        <div class="ti-panel-head"><h2>Narrative</h2><span class="ti-status-pill live" style="margin-left:auto">Holder</span></div>
        <div class="ti-scan-body" id="ti-narrative"></div>
      </section>
    </aside>
  </div>

  <div class="ti-foot">
    Powered by the three.ws Coin Intelligence Engine, live market data, and on-chain sentiment. $THREE is the only coin.
    · <a href="/three">How the economy works</a> · <a href="/three-token">$THREE price &amp; chart</a>
  </div>
</div>

<button id="connect-wallet-btn" type="button" hidden aria-hidden="true" tabindex="-1"><span data-wallet-label>Connect wallet</span></button>`;
	document.body.appendChild(root);
}

function wireTicker() {
	const el = document.getElementById('ti-ticker');
	if (!el) return;
	const store = createThreeTokenData({ pollMs: 30000 });
	store.subscribe((state) => {
		const t = state.protocol?.token;
		if (!t || !(Number(t.price_usd) > 0)) return;
		const chg = Number(t.price_change_24h);
		el.hidden = false;
		el.innerHTML = `$THREE <b>${fmtUsd(t.price_usd, 6)}</b>${
			Number.isFinite(chg) ? ` <span class="${chg >= 0 ? 'ti-chg-pos' : 'ti-chg-neg'}">${fmtPct(chg)}</span>` : ''
		}`;
	});
	window.addEventListener('beforeunload', () => store.destroy());
}

function init() {
	buildShell();
	try {
		initWalletButton();
	} catch {
		/* wallet button is best-effort */
	}
	mountTierBadge('#ti-badge').catch(() => {});
	primeTierPass();
	wireTicker();

	document.getElementById('ti-connect-chip')?.addEventListener('click', () =>
		document.getElementById('connect-wallet-btn')?.click(),
	);
	document.getElementById('ti-scan-form')?.addEventListener('submit', (e) => {
		e.preventDefault();
		runScan(document.getElementById('ti-scan-input')?.value || '');
	});
	document.getElementById('ti-quality')?.addEventListener('change', (e) => {
		_lastMinQuality = e.target.value || '';
		loadFeed();
	});

	// A wallet connect/switch can change live vs delayed — re-read the feed + badge.
	window.addEventListener('wallet:changed', () => {
		primeTierPass();
		mountTierBadge('#ti-badge').catch(() => {});
		loadFeed();
	});

	loadFeed();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
