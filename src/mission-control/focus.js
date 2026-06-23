/**
 * Mission Control — focus / detail pane.
 *
 * The center cockpit. When a coin is selected anywhere (feed row, position, or
 * keyboard), this pane fuses everything three.ws knows about it:
 *   • identity + market stats (GET /api/pump/coin)
 *   • a real price sparkline (GET /api/pump/price-history — never fabricated)
 *   • the intel breakdown (organic vs bundle, risk flags, verdict)
 *   • the firewall safety verdict (reused createSafetyPanel → /api/pump/safety)
 *   • smart-money flow (GET /api/intel/smart-money)
 *   • a buy/sell desk with size presets, a live quote, and real guarded execution
 *
 * The shell mounts ONCE per selection; enrichment patches update individual
 * sections in place so the safety panel and live quote never thrash. Buy is
 * disabled on a firewall `block`; the server enforces it regardless.
 */

import { createSafetyPanel } from '../shared/safety-panel.js';
import { buy, sell, quote } from './trade.js';
import {
	escapeHtml,
	shortAddress,
	copyToClipboard,
	formatCompactUsd,
	formatCompact,
	ageFrom,
	formatPct,
	explorerAddressUrl,
	formatSol,
} from './format.js';

export function createFocusPane({ store, bus, enrich, mount }) {
	mount.classList.add('mc-pane', 'mc-pane--focus');
	mount.setAttribute('role', 'region');
	mount.setAttribute('aria-label', 'Coin detail');
	mount.innerHTML = `
		<div class="mc-pane-head">
			<span class="mc-pane-title">Focus</span>
			<span class="mc-pane-head-spacer"></span>
			<span class="mc-pane-count" data-host="net"></span>
		</div>
		<div class="mc-pane-body" data-host="body"></div>
	`;
	const body = mount.querySelector('[data-host="body"]');
	const netEl = mount.querySelector('[data-host="net"]');
	netEl.textContent = store.getNetwork();

	let currentMint = null;
	let seq = 0;
	let safety = null;
	let buyDisabled = false;
	let coinDetail = null;
	let quoteTimer = null;

	const $ = (sel) => body.querySelector(sel);

	function showIdle() {
		currentMint = null;
		teardownSafety();
		body.innerHTML = `
			<div class="mc-empty">
				<div class="mc-empty-ico" aria-hidden="true">⌖</div>
				<h3>Select a coin</h3>
				<p>Click a launch in the feed, or use <kbd style="font-family:var(--font-mono)">j</kbd> / <kbd style="font-family:var(--font-mono)">k</kbd> to move and watch it light up here — intel, safety, smart-money, and one-keystroke trading.</p>
			</div>`;
	}

	function teardownSafety() {
		if (safety) { safety.destroy(); safety = null; }
	}

	function load(mint) {
		if (!mint) { showIdle(); return; }
		const fresh = mint !== currentMint;
		currentMint = mint;
		const mySeq = ++seq;
		const row = store.getRow(mint) || { mint };
		coinDetail = null;
		if (fresh) renderShell(row);
		else { updateHead(row); updateIntel(row); updateSmart(row); }

		enrich.ensureIntel(mint);
		enrich.ensureSmart(mint);

		fetchCoin(mint).then((coin) => {
			if (mySeq !== seq) return;
			coinDetail = coin;
			updateHead(store.getRow(mint) || row);
		});
		fetchSpark(mint).then((pts) => {
			if (mySeq !== seq) return;
			renderSpark(pts);
		});
	}

	async function fetchCoin(mint) {
		try {
			const r = await fetch(`/api/pump/coin?mint=${encodeURIComponent(mint)}`, { headers: { accept: 'application/json' } });
			if (!r.ok) return null;
			return await r.json();
		} catch { return null; }
	}

	async function fetchSpark(mint) {
		try {
			const to = Math.floor(Date.now() / 1000);
			const from = to - 6 * 3600;
			const r = await fetch(`/api/pump/price-history?mint=${encodeURIComponent(mint)}&interval=5m&from=${from}&to=${to}`, { headers: { accept: 'application/json' } });
			if (!r.ok) return null;
			const j = await r.json();
			const arr = Array.isArray(j?.data) ? j.data : [];
			return arr.map((d) => Number(d.c)).filter((n) => Number.isFinite(n));
		} catch { return null; }
	}

	// ── shell (built once per selection) ────────────────────────────────────────
	function renderShell(row) {
		const mint = row.mint;
		body.innerHTML = `
			<div class="mc-focus">
				<div class="mc-focus-head" data-host="head"></div>
				<div class="mc-stats" data-host="stats"></div>
				<div class="mc-spark-wrap"><div class="mc-section-h">Price · 6h</div><div data-host="sparkbody" style="color:var(--ink-faint,#666);font-size:.72rem">Loading chart…</div></div>
				<div data-host="intel"></div>
				<div data-host="safety"></div>
				<div data-host="smart"></div>
				<div class="mc-trade" data-host="trade"></div>
			</div>`;
		updateHead(row);
		updateIntel(row);
		updateSmart(row);
		mountSafety(mint);
		mountTrade();
	}

	function updateHead(row) {
		const head = $('[data-host="head"]');
		const stats = $('[data-host="stats"]');
		if (!head || !stats) return;
		const coin = coinDetail || {};
		const mint = row.mint;
		const sym = escapeHtml(row.symbol || coin.symbol || mint.slice(0, 4));
		const name = escapeHtml(row.name || coin.name || '');
		const img = row.image_uri || coin.image_uri || coin.image || '';
		const mcUsd = coin.usd_market_cap ?? coin.market_cap ?? row.market_cap_usd ?? null;
		const created = coin.created_timestamp ? Math.floor(coin.created_timestamp / 1000) : row.created_at;
		const intel = row.intel && !row.intel._none ? row.intel : null;
		const smart = row.smart;
		const socials = [
			(row.twitter || coin.twitter) && { href: row.twitter || coin.twitter, label: 'X' },
			(row.telegram || coin.telegram) && { href: row.telegram || coin.telegram, label: 'TG' },
			(row.website || coin.website) && { href: row.website || coin.website, label: 'Web' },
		].filter(Boolean);

		head.innerHTML = `
			${img ? `<img class="mc-focus-img" src="${escapeHtml(img)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'" />` : '<div class="mc-focus-img" aria-hidden="true"></div>'}
			<div class="mc-focus-id">
				<h2>${sym} <span class="mc-focus-name">${name}</span></h2>
				<div class="mc-focus-addr">
					<span class="mc-mono" title="${escapeHtml(mint)}">${escapeHtml(shortAddress(mint, 6, 6))}</span>
					<button class="mc-iconbtn" data-act="copy" title="Copy mint" style="min-width:24px;height:22px;padding:0 6px;font-size:.7rem">⧉</button>
					<a href="${escapeHtml(explorerAddressUrl(mint, store.getNetwork()))}" target="_blank" rel="noopener">Explorer ↗</a>
				</div>
				${socials.length ? `<div class="mc-focus-socials">${socials.map((s) => `<a href="${escapeHtml(s.href)}" target="_blank" rel="noopener">${escapeHtml(s.label)}</a>`).join('')}</div>` : ''}
			</div>`;
		head.querySelector('[data-act="copy"]')?.addEventListener('click', async () => {
			const ok = await copyToClipboard(mint);
			const b = head.querySelector('[data-act="copy"]');
			if (b) { b.textContent = ok ? '✓' : '⧉'; setTimeout(() => { if (b) b.textContent = '⧉'; }, 1100); }
		});

		stats.innerHTML = `
			<div class="mc-stat"><span>Market cap</span><b>${formatCompactUsd(mcUsd)}</b></div>
			<div class="mc-stat"><span>Age</span><b>${created ? ageFrom(created) : '—'}</b></div>
			<div class="mc-stat"><span>Intel</span><b>${intel?.quality_score != null ? Math.round(intel.quality_score) : '—'}</b></div>
			<div class="mc-stat"><span>Smart $</span><b>${smart?.computed ? Math.round(smart.smart_money_score || 0) : '—'}</b></div>
			<div class="mc-stat"><span>Buyers</span><b>${intel?.unique_buyers != null ? formatCompact(intel.unique_buyers) : '—'}</b></div>
			<div class="mc-stat"><span>B/S ratio</span><b>${intel?.buy_sell_ratio != null ? Number(intel.buy_sell_ratio).toFixed(2) : '—'}</b></div>`;
	}

	function updateIntel(row) {
		const host = $('[data-host="intel"]');
		if (!host) return;
		const intel = row.intel && !row.intel._none ? row.intel : (row.intel === undefined ? undefined : null);
		if (intel === undefined) { host.innerHTML = `<div class="mc-section-h">Intel</div><div class="mc-chip-skel" style="width:100%"></div>`; return; }
		if (!intel) {
			host.innerHTML = `<div class="mc-section-h">Intel</div><p style="color:var(--ink-faint,#666);font-size:.75rem;margin:0">Structural intel is still being gathered for this launch.</p>`;
			return;
		}
		const flags = Array.isArray(intel.risk_flags) ? intel.risk_flags : [];
		const v = intel.verdict;
		const tone = v?.tone === 'success' ? 'allow' : v?.tone === 'danger' ? 'block' : v?.tone === 'warn' ? 'warn' : 'unknown';
		const bars = [
			['Organic', intel.organic_score],
			['Bundle', intel.bundle_score],
			['Snipe', intel.snipe_ratio != null ? intel.snipe_ratio * 100 : null],
			['Top-10', intel.concentration_top10 != null ? intel.concentration_top10 * 100 : null],
		].filter(([, val]) => val != null);
		host.innerHTML = `
			<div class="mc-section-h">Intel breakdown ${v?.label ? `<span class="mc-chip mc-chip--${tone}" style="margin-left:6px">${escapeHtml(v.label)}</span>` : ''}</div>
			<div class="mc-stats" style="grid-template-columns:repeat(auto-fit,minmax(76px,1fr))">
				${bars.map(([label, val]) => `<div class="mc-stat"><span>${escapeHtml(label)}</span><b>${Math.round(Number(val))}${label === 'Organic' || label === 'Bundle' ? '' : '%'}</b></div>`).join('')}
			</div>
			${flags.length ? `<ul class="mc-smart-wallets" style="margin-top:8px">${flags.slice(0, 5).map((f) => `<li style="color:var(--warn,#fbbf24)">⚠ ${escapeHtml(String(f).replace(/_/g, ' '))}</li>`).join('')}</ul>` : ''}`;
	}

	function updateSmart(row) {
		const host = $('[data-host="smart"]');
		if (!host) return;
		const smart = row.smart;
		if (smart === undefined) { host.innerHTML = `<div class="mc-section-h">Smart money</div><div class="mc-chip-skel" style="width:100%"></div>`; return; }
		if (!smart || smart.computed === false) {
			host.innerHTML = `<div class="mc-section-h">Smart money</div><p style="color:var(--ink-faint,#666);font-size:.75rem;margin:0">Not enough on-chain history yet to score who's buying this coin.</p>`;
			return;
		}
		const score = Math.round(smart.smart_money_score || 0);
		const wallets = Array.isArray(smart.wallets) ? smart.wallets.slice(0, 4) : [];
		host.innerHTML = `
			<div class="mc-section-h">Smart money <span class="mc-num" style="margin-left:auto;color:var(--accent,#7dd3fc)">${score}/100${smart.count ? ` · ${smart.count} wallets` : ''}</span></div>
			<div class="mc-smart-bar"><i style="width:${Math.max(2, score)}%"></i></div>
			${smart.sybil_flag ? `<p style="color:var(--warn,#fbbf24);font-size:.72rem;margin:8px 0 0">⚠ One funder cluster dominates the buyers (${Math.round((smart.sybil_share || 0) * 100)}%) — possible sybil.</p>` : ''}
			${wallets.length ? `<ul class="mc-smart-wallets">${wallets.map((w) => `<li><span class="mc-mono">${escapeHtml(shortAddress(w.address))}</span> <b>${Math.round(w.realized_score || 0)}</b> score${w.win_rate != null ? ` · ${Math.round(w.win_rate * 100)}% win` : ''}${w.buy_sol ? ` · ${formatSol(w.buy_sol)}◎` : ''}</li>`).join('')}</ul>` : ''}`;
	}

	function mountSafety(mint) {
		teardownSafety();
		const host = $('[data-host="safety"]');
		if (!host) return;
		safety = createSafetyPanel({
			onVerdict: (v) => { buyDisabled = v?.verdict === 'block'; updateTradeButtons(); },
		});
		host.innerHTML = `<div class="mc-section-h">Safety firewall</div>`;
		host.appendChild(safety.el);
		safety.loadForMint({ mint, network: store.getNetwork(), amountSol: store.getActiveSize() });
	}

	function mountTrade() {
		const host = $('[data-host="trade"]');
		if (!host) return;
		const presets = store.getPresets();
		const active = store.getActiveSize();
		host.innerHTML = `
			<div class="mc-section-h">Trade · from ${escapeHtml(store.getAgent()?.name || 'agent')}</div>
			<div class="mc-sizes" role="group" aria-label="Buy size (SOL)">
				${presets.map((p, i) => `<button class="mc-size" data-size="${p}" aria-pressed="${p === active}">${p}<span class="mc-size-kbd">${i + 1}</span></button>`).join('')}
				<span style="color:var(--ink-faint,#666);font-size:.72rem">SOL</span>
			</div>
			<div class="mc-trade-actions">
				<button class="mc-btn mc-btn--buy" data-act="buy"><kbd>b</kbd> Buy</button>
				<button class="mc-btn mc-btn--sell" data-act="sell"><kbd>s</kbd> Sell all</button>
			</div>
			<div class="mc-trade-note is-dim" data-host="note" role="status" aria-live="polite">Pick a size — a live quote appears here.</div>`;
		host.querySelectorAll('[data-size]').forEach((b) => {
			b.addEventListener('click', () => store.setActiveSize(Number(b.dataset.size)));
		});
		host.querySelector('[data-act="buy"]').addEventListener('click', () => doBuy());
		host.querySelector('[data-act="sell"]').addEventListener('click', () => doSell());
		updateTradeButtons();
		refreshQuote();
	}

	function updateTradeButtons() {
		const buyBtn = $('[data-act="buy"]');
		if (!buyBtn) return;
		const noAgent = !store.getAgent();
		buyBtn.disabled = buyDisabled || noAgent;
		buyBtn.title = buyDisabled ? 'Firewall blocked — buying disabled' : noAgent ? 'Select an agent first' : '';
		body.querySelectorAll('[data-size]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.size) === store.getActiveSize())));
	}

	function refreshQuote() {
		const note = $('[data-host="note"]');
		if (!note || !currentMint) return;
		clearTimeout(quoteTimer);
		const size = store.getActiveSize();
		note.className = 'mc-trade-note is-dim';
		note.textContent = 'Pricing…';
		const mySeq = seq;
		const mint = currentMint;
		quoteTimer = setTimeout(async () => {
			try {
				const q = await quote({ store, side: 'buy', mint, solAmount: size });
				if (mySeq !== seq || !$('[data-host="note"]')) return;
				const n = $('[data-host="note"]');
				const out = q?.out;
				const impact = q?.price_impact_pct;
				const guard = q?.guard;
				if (guard) { n.className = 'mc-trade-note is-err'; n.textContent = `⚠ ${guard.message}`; return; }
				n.className = impact >= 8 ? 'mc-trade-note is-warn' : 'mc-trade-note is-dim';
				n.innerHTML = `${size} SOL → <b style="color:var(--ink-bright,#fff)">${formatCompact(out?.amount)}</b> tokens · impact ${impact != null ? Number(impact).toFixed(1) + '%' : '—'}${impact >= 8 ? ' ⚠' : ''}`;
			} catch (e) {
				if (mySeq !== seq || !$('[data-host="note"]')) return;
				const n = $('[data-host="note"]');
				n.className = 'mc-trade-note is-dim';
				n.textContent = e?.code === 'no_agent' ? 'Select a trading agent to quote.' : 'Quote unavailable right now.';
			}
		}, 350);
	}

	function renderSpark(pts) {
		const host = $('[data-host="sparkbody"]');
		if (!host) return;
		if (!pts || pts.length < 2) { host.textContent = 'No price history yet for this coin.'; return; }
		const w = 100, h = 36;
		const min = Math.min(...pts), max = Math.max(...pts);
		const span = max - min || 1;
		const step = w / (pts.length - 1);
		const d = pts.map((p, i) => `${(i * step).toFixed(2)},${(h - ((p - min) / span) * h).toFixed(2)}`).join(' ');
		const up = pts[pts.length - 1] >= pts[0];
		const col = up ? 'var(--success,#4ade80)' : 'var(--danger,#f87171)';
		const change = pts[0] ? ((pts[pts.length - 1] - pts[0]) / pts[0]) * 100 : 0;
		host.innerHTML = `
			<svg class="mc-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="Price chart, ${formatPct(change)} over 6 hours">
				<polyline points="${d}" fill="none" stroke="${col}" stroke-width="1.4" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round" />
			</svg>
			<div class="mc-num" style="margin-top:4px;color:${col};font-size:.74rem">${formatPct(change)} · 6h</div>`;
	}

	async function doBuy() {
		if (!currentMint) { return; }
		await buy({ store, bus, mint: currentMint, solAmount: store.getActiveSize() });
	}
	async function doSell() {
		if (!currentMint) { return; }
		await sell({ store, bus, mint: currentMint });
	}

	const unsubs = [
		bus.on('select', (mint) => load(mint)),
		bus.on('size', () => { updateTradeButtons(); refreshQuote(); if (safety && currentMint) safety.loadForMint({ mint: currentMint, network: store.getNetwork(), amountSol: store.getActiveSize() }); }),
		bus.on('presets', () => { if (currentMint) mountTrade(); }),
		bus.on('agent', () => { if (currentMint) mountTrade(); }),
		bus.on('network', () => { netEl.textContent = store.getNetwork(); if (currentMint) load(currentMint); }),
		bus.on('feed:update', (row) => { if (row.mint === currentMint) { updateHead(row); updateIntel(row); updateSmart(row); } }),
		bus.on('action:buy', () => doBuy()),
		bus.on('action:sell', () => doSell()),
	];

	showIdle();

	return {
		destroy() {
			teardownSafety();
			clearTimeout(quoteTimer);
			unsubs.forEach((u) => u());
		},
	};
}
