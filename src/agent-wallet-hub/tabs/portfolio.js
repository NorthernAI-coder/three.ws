/**
 * Agent Wallet hub — Portfolio Command tab (owner-only).
 *
 * One real-time, unified view of everything the agent wallet holds and has done:
 *   - a net-worth header (SOL + USD) with a live sparkline built from the stream,
 *   - a holdings table (live value, FIFO cost basis, unrealized P&L, liquidity
 *     warning) with a one-click jump to trade/exit,
 *   - a PnL attribution breakdown (what's making / losing money, by source),
 *   - a risk panel (concentration, exposure, drawdown, realized vol) with
 *     plain-language flags.
 *
 * Every figure is real, from GET /api/agents/:id/portfolio (api/_lib/portfolio.js):
 * live on-chain valuation + the sniper position ledger + the custody/spend ledger.
 * Unpriceable holdings are flagged, never guessed. Live updates arrive over the
 * SSE stream at …/portfolio/stream. Every state is designed; accessible; responsive.
 */

import { registerWalletTab } from '../registry.js';
import { formatSol, formatUsd } from '../util.js';

const PORT_STYLE_ID = 'awh-portfolio-style';
const PORT_STYLE = `
.awh-port { display: flex; flex-direction: column; gap: var(--awh-gap, 16px); }
.awh-port-nw { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-4,16px); flex-wrap: wrap; }
.awh-port-nw-main { min-width: 0; }
.awh-port-nw-label { font-size: var(--text-2xs,.6875rem); text-transform: uppercase; letter-spacing: .06em; color: var(--ink-dim,#888); }
.awh-port-nw-usd { font-family: var(--font-display, system-ui); font-size: var(--text-xl, 1.618rem); font-weight: 700; color: var(--ink-bright,#fff); line-height: 1.1; margin-top: 4px; }
.awh-port-nw-sol { font-size: var(--text-sm,.764rem); color: var(--ink-dim,#888); margin-top: 4px; }
.awh-port-spark { flex: 0 0 auto; }
.awh-port-spark svg { display: block; }
.awh-port-pnl-row { display: flex; gap: var(--space-4,16px); flex-wrap: wrap; margin-top: var(--space-3,12px); }
.awh-port-pnl { font-size: var(--text-sm,.764rem); color: var(--ink-dim,#888); }
.awh-port-pnl b { font-family: var(--font-mono, ui-monospace, monospace); font-weight: 600; }
.awh-pos { color: var(--success,#4ade80); }
.awh-neg { color: var(--danger,#f87171); }
.awh-live { display: inline-flex; align-items: center; gap: 5px; font-size: var(--text-2xs,.6875rem); color: var(--ink-dim,#888); }
.awh-live::before { content: ''; width: 7px; height: 7px; border-radius: 50%; background: var(--success,#4ade80); box-shadow: 0 0 0 0 color-mix(in srgb, var(--success,#4ade80) 60%, transparent); animation: awh-live-pulse 2s ease-out infinite; }
@keyframes awh-live-pulse { 0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--success,#4ade80) 50%, transparent); } 70% { box-shadow: 0 0 0 6px transparent; } 100% { box-shadow: 0 0 0 0 transparent; } }
@media (prefers-reduced-motion: reduce) { .awh-live::before { animation: none; } }

.awh-port-table { width: 100%; border-collapse: collapse; font-size: var(--text-sm,.764rem); }
.awh-port-table th { text-align: right; font-weight: 500; color: var(--ink-dim,#888); font-size: var(--text-2xs,.6875rem); text-transform: uppercase; letter-spacing: .04em; padding: 0 0 8px; border-bottom: 1px solid var(--stroke, rgba(255,255,255,.08)); }
.awh-port-table th:first-child { text-align: left; }
.awh-port-table td { text-align: right; padding: 9px 0; border-bottom: 1px solid var(--stroke, rgba(255,255,255,.06)); font-family: var(--font-mono, ui-monospace, monospace); }
.awh-port-table td:first-child { text-align: left; font-family: inherit; }
.awh-port-table tr:last-child td { border-bottom: none; }
.awh-port-asset { display: flex; align-items: center; gap: 9px; min-width: 0; }
.awh-port-asset img { width: 22px; height: 22px; border-radius: 50%; flex: none; background: var(--surface-2, rgba(255,255,255,.05)); object-fit: cover; }
.awh-port-asset .ph { width: 22px; height: 22px; border-radius: 50%; flex: none; background: var(--surface-3, rgba(255,255,255,.08)); display: inline-flex; align-items: center; justify-content: center; font-size: 9px; color: var(--ink-dim,#888); font-family: var(--font-mono, ui-monospace, monospace); }
.awh-port-sym { color: var(--ink-bright,#fff); font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.awh-port-sub { color: var(--ink-faint,#666); font-size: var(--text-2xs,.6875rem); }
.awh-port-warn { display: inline-block; margin-left: 6px; font-size: var(--text-2xs,.6875rem); color: var(--warn,#fbbf24); border: 1px solid color-mix(in srgb, var(--warn,#fbbf24) 40%, transparent); border-radius: var(--radius-pill,999px); padding: 1px 7px; vertical-align: middle; }
.awh-port-trade { font-size: var(--text-2xs,.6875rem); padding: 5px 10px; }
.awh-muted { color: var(--ink-faint,#666); }

.awh-attr { display: flex; flex-direction: column; gap: 2px; }
.awh-attr-row { display: grid; grid-template-columns: 1fr auto auto; gap: var(--space-3,12px); align-items: center; padding: 9px 0; border-bottom: 1px solid var(--stroke, rgba(255,255,255,.06)); }
.awh-attr-row:last-child { border-bottom: none; }
.awh-attr-label { color: var(--ink,#e8e8e8); font-size: var(--text-sm,.764rem); }
.awh-attr-bar { grid-column: 1 / -1; height: 4px; border-radius: var(--radius-pill,999px); background: var(--surface-2, rgba(255,255,255,.05)); overflow: hidden; }
.awh-attr-bar > span { display: block; height: 100%; border-radius: inherit; }
.awh-attr-val { font-family: var(--font-mono, ui-monospace, monospace); font-size: var(--text-sm,.764rem); }
.awh-attr-sub { font-size: var(--text-2xs,.6875rem); color: var(--ink-dim,#888); font-family: var(--font-mono, ui-monospace, monospace); }

.awh-risk-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: var(--space-3,12px); }
.awh-risk-cell { background: var(--surface-1, rgba(255,255,255,.03)); border: 1px solid var(--stroke, rgba(255,255,255,.08)); border-radius: var(--radius-md,10px); padding: var(--space-3,12px); }
.awh-risk-k { font-size: var(--text-2xs,.6875rem); text-transform: uppercase; letter-spacing: .04em; color: var(--ink-dim,#888); }
.awh-risk-v { font-family: var(--font-mono, ui-monospace, monospace); font-size: var(--text-lg,1.236rem); font-weight: 700; color: var(--ink-bright,#fff); margin-top: 4px; }
.awh-flags { list-style: none; margin: var(--space-3,12px) 0 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.awh-flag { display: flex; gap: 9px; align-items: flex-start; font-size: var(--text-sm,.764rem); padding: 9px 11px; border-radius: var(--radius-md,10px); border: 1px solid var(--stroke, rgba(255,255,255,.08)); background: var(--surface-1, rgba(255,255,255,.03)); }
.awh-flag::before { content: '•'; flex: none; }
.awh-flag.is-danger { border-color: color-mix(in srgb, var(--danger,#ef4444) 45%, transparent); color: var(--danger,#f87171); }
.awh-flag.is-warn { border-color: color-mix(in srgb, var(--warn,#fbbf24) 45%, transparent); color: var(--warn,#fbbf24); }
.awh-flag.is-info { color: var(--ink-dim,#888); }
.awh-port-note { font-size: var(--text-2xs,.6875rem); color: var(--ink-faint,#666); margin-top: var(--space-3,12px); }

.awh-port-skel span { display: block; background: var(--surface-2, rgba(255,255,255,.05)); border-radius: var(--radius-sm,6px); animation: awh-skel 1.4s ease-in-out infinite; }
.awh-port-skel .a { height: 30px; width: 46%; margin-bottom: 10px; }
.awh-port-skel .b { height: 14px; width: 28%; margin-bottom: 20px; }
.awh-port-skel .c { height: 18px; width: 100%; margin-bottom: 10px; }
.awh-port-skel .c:nth-child(4) { width: 82%; }
@keyframes awh-skel { 0%,100% { opacity: .5; } 50% { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .awh-port-skel span, .awh-port-table td { animation: none; } }
@media (max-width: 480px) {
	.awh-port-table .col-basis, .awh-port-table .col-amt { display: none; }
}
`;

function injectStyle() {
	if (typeof document === 'undefined' || document.getElementById(PORT_STYLE_ID)) return;
	const tag = document.createElement('style');
	tag.id = PORT_STYLE_ID;
	tag.textContent = PORT_STYLE;
	document.head.appendChild(tag);
}

const SPARK_MAX = 40; // points retained for the live net-worth sparkline

function fmtSolSigned(sol) {
	if (sol == null || !Number.isFinite(sol)) return '—';
	const s = formatSol(Math.abs(sol));
	return `${sol > 0 ? '+' : sol < 0 ? '−' : ''}${s} SOL`;
}
function pnlClass(n) { return n > 0 ? 'awh-pos' : n < 0 ? 'awh-neg' : ''; }

function sparkline(points, w = 132, h = 38) {
	const vals = points.filter((v) => Number.isFinite(v));
	if (vals.length < 2) return '';
	const min = Math.min(...vals);
	const max = Math.max(...vals);
	const span = max - min || 1;
	const stepX = w / (vals.length - 1);
	const pts = vals.map((v, i) => {
		const x = i * stepX;
		const y = h - ((v - min) / span) * (h - 4) - 2;
		return `${x.toFixed(1)},${y.toFixed(1)}`;
	});
	const up = vals[vals.length - 1] >= vals[0];
	const stroke = up ? 'var(--success,#4ade80)' : 'var(--danger,#f87171)';
	return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="Net worth trend">
		<polyline fill="none" stroke="${stroke}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" points="${pts.join(' ')}" />
	</svg>`;
}

registerWalletTab({
	id: 'portfolio',
	label: 'Portfolio',
	order: 15,
	ownerOnly: true,
	mount({ panel, ctx }) {
		injectStyle();
		const { escapeHtml, toast, copyToClipboard } = ctx;

		let destroyed = false;
		let visible = false;
		let detachNet = null;
		let es = null;
		const state = {
			loaded: false,
			error: null,
			data: null,
			spark: [], // net-worth USD history for the sparkline
			live: false,
			streamDown: false, // SSE permanently closed → live updates paused
		};

		function pushSpark(usd) {
			if (!Number.isFinite(usd)) return;
			state.spark.push(usd);
			if (state.spark.length > SPARK_MAX) state.spark.shift();
		}

		function isEmpty(d) {
			const nw = d?.net_worth?.usd ?? 0;
			const nwSol = d?.net_worth?.sol ?? 0;
			return (!d?.holdings || d.holdings.length === 0) && (d?.metrics?.closed_count ?? 0) === 0 && nw <= 0 && nwSol <= 0;
		}

		function render() {
			if (destroyed) return;
			if (!state.loaded) {
				panel.innerHTML = `<div class="awh-card awh-port-skel" aria-busy="true" aria-label="Loading portfolio">
					<span class="a"></span><span class="b"></span><span class="c"></span><span class="c"></span><span class="c"></span>
				</div>`;
				return;
			}
			if (state.error) {
				panel.innerHTML = `<div class="awh-card">
					<div class="awh-empty">Could not load the portfolio — ${escapeHtml(state.error)}.
					<button class="awh-btn awh-port-trade" type="button" data-act="retry">Retry</button></div>
				</div>`;
				panel.querySelector('[data-act="retry"]')?.addEventListener('click', () => { reload(); });
				return;
			}
			const d = state.data;
			if (isEmpty(d)) {
				panel.innerHTML = `<div class="awh-card">
					<h2 class="awh-card-h">Portfolio Command</h2>
					<div class="awh-empty">
						This wallet is empty. Once it holds SOL or tokens — or makes its first trade or snipe —
						its live net worth, cost basis, P&amp;L attribution, and risk metrics appear here.
						<div style="margin-top:12px; display:flex; gap:8px; flex-wrap:wrap;">
							<button class="awh-btn awh-port-trade" type="button" data-go="deposit">Deposit funds</button>
							<button class="awh-btn awh-port-trade" type="button" data-go="trade">Make a trade</button>
						</div>
					</div>
				</div>`;
				panel.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => ctx.openTab(b.dataset.go)));
				return;
			}

			panel.innerHTML = `
				${renderHeader(d)}
				${renderHoldings(d)}
				${renderAttribution(d)}
				${renderRisk(d)}
			`;
			wire();
		}

		function renderHeader(d) {
			const nw = d.net_worth || {};
			const realized = nw.realized_pnl_sol ?? 0;
			const unrealized = nw.unrealized_pnl_sol ?? 0;
			const usd = formatUsd(nw.usd ?? 0) || '$0.00';
			const spark = sparkline(state.spark);
			return `<div class="awh-card">
				<div class="awh-port-nw">
					<div class="awh-port-nw-main">
						<div class="awh-port-nw-label">Net worth ${state.live ? '<span class="awh-live">live</span>' : ''}</div>
						<div class="awh-port-nw-usd">${escapeHtml(usd)}</div>
						<div class="awh-port-nw-sol">${escapeHtml(formatSol(nw.sol))} SOL${d.sol_usd ? ` · SOL ${escapeHtml(formatUsd(d.sol_usd) || '')}` : ''}</div>
					</div>
					${spark ? `<div class="awh-port-spark">${spark}</div>` : ''}
				</div>
				<div class="awh-port-pnl-row">
					<span class="awh-port-pnl">Realized <b class="${pnlClass(realized)}">${escapeHtml(fmtSolSigned(realized))}</b></span>
					<span class="awh-port-pnl">Unrealized <b class="${pnlClass(unrealized)}">${escapeHtml(fmtSolSigned(unrealized))}</b></span>
				</div>
			</div>`;
		}

		function renderHoldings(d) {
			const rows = d.holdings || [];
			if (!rows.length) {
				return `<div class="awh-card"><h2 class="awh-card-h">Holdings</h2>
					<div class="awh-empty">No holdings yet — deposits and buys appear here.</div></div>`;
			}
			const body = rows.map((h) => {
				const sym = escapeHtml(h.symbol || '?');
				const sub = h.isNative ? 'Native' : (h.is_three ? '$THREE' : (h.stable ? 'Stable' : escapeHtml(h.name || '')));
				const img = h.logo
					? `<img src="${escapeHtml(h.logo)}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'ph',textContent:'${sym.slice(0, 2)}'}))">`
					: `<span class="ph">${sym.slice(0, 2)}</span>`;
				const value = h.usd_value != null ? (formatUsd(h.usd_value) || '—') : '<span class="awh-muted">unpriced</span>';
				const amt = h.amount != null ? formatNum(h.amount) : '—';
				const basis = h.cost_basis_sol != null ? `${formatSol(h.cost_basis_sol)}◎` : '<span class="awh-muted">—</span>';
				let upnl = '<span class="awh-muted">—</span>';
				if (h.unrealized_sol != null) {
					const pct = h.unrealized_pct != null ? ` (${h.unrealized_pct > 0 ? '+' : ''}${h.unrealized_pct}%)` : '';
					upnl = `<span class="${pnlClass(h.unrealized_sol)}">${escapeHtml(fmtSolSigned(h.unrealized_sol))}${pct}</span>`;
				}
				const warn = h.liquidity_warning ? `<span class="awh-port-warn" title="No live market price — value shown is unknown, never guessed.">illiquid</span>` : '';
				const tradeBtn = h.isNative
					? ''
					: `<button class="awh-btn awh-port-trade" type="button" data-trade="${escapeHtml(h.mint || '')}">Trade ↗</button>`;
				return `<tr>
					<td>
						<div class="awh-port-asset">${img}
							<span style="min-width:0;">
								<span class="awh-port-sym">${sym}${warn}</span><br>
								<span class="awh-port-sub">${sub}</span>
							</span>
						</div>
					</td>
					<td class="col-amt">${escapeHtml(amt)}</td>
					<td>${value}</td>
					<td class="col-basis">${basis}</td>
					<td>${upnl}</td>
					<td>${tradeBtn}</td>
				</tr>`;
			}).join('');
			return `<div class="awh-card">
				<h2 class="awh-card-h">Holdings <span class="awh-port-sub">${rows.length}</span></h2>
				<div style="overflow-x:auto;">
				<table class="awh-port-table">
					<thead><tr>
						<th>Asset</th><th class="col-amt">Amount</th><th>Value</th>
						<th class="col-basis">Cost basis</th><th>Unrealized</th><th></th>
					</tr></thead>
					<tbody>${body}</tbody>
				</table>
				</div>
			</div>`;
		}

		function renderAttribution(d) {
			const rows = (d.attribution || []).filter((a) => !a.is_outflow);
			const outflows = (d.attribution || []).filter((a) => a.is_outflow);
			if (!rows.length && !outflows.length) {
				return `<div class="awh-card"><h2 class="awh-card-h">P&amp;L attribution</h2>
					<div class="awh-empty">No closed or open trades to attribute yet.</div></div>`;
			}
			const maxAbs = Math.max(1, ...rows.map((a) => Math.abs(a.total_sol ?? 0)));
			const body = rows.map((a) => {
				const total = a.total_sol ?? 0;
				const w = Math.min(100, (Math.abs(total) / maxAbs) * 100);
				const col = total >= 0 ? 'var(--success,#4ade80)' : 'var(--danger,#f87171)';
				const realized = a.realized_sol ?? 0;
				const unreal = a.unrealized_sol ?? 0;
				return `<div class="awh-attr-row">
					<span class="awh-attr-label">${escapeHtml(a.label)}</span>
					<span class="awh-attr-sub">R ${escapeHtml(fmtSolSigned(realized))} · U ${escapeHtml(fmtSolSigned(unreal))}</span>
					<span class="awh-attr-val ${pnlClass(total)}">${escapeHtml(fmtSolSigned(total))}</span>
					<span class="awh-attr-bar"><span style="width:${w}%; background:${col};"></span></span>
				</div>`;
			}).join('');
			const out = outflows.map((a) =>
				`<div class="awh-attr-row">
					<span class="awh-attr-label awh-muted">${escapeHtml(a.label)}</span>
					<span class="awh-attr-sub">outflow</span>
					<span class="awh-attr-val awh-muted">${escapeHtml(formatSol(a.spent_sol))} SOL</span>
				</div>`).join('');
			return `<div class="awh-card">
				<h2 class="awh-card-h">P&amp;L attribution</h2>
				<div class="awh-attr">${body}${out}</div>
				<div class="awh-port-note">${escapeHtml(d.basis_note || '')}</div>
			</div>`;
		}

		function renderRisk(d) {
			const r = d.risk || {};
			const cells = [
				['Concentration', r.top_position_pct != null ? `${r.top_position_pct}%` : '—', 'Largest position share'],
				['Diversification', r.concentration_hhi != null ? hhiLabel(r.concentration_hhi) : '—', 'HHI of weights'],
				['Tape exposure', r.exposure_pct != null ? `${r.exposure_pct}%` : '—', 'In volatile memecoins'],
				['Max drawdown', r.max_drawdown_pct != null ? `${r.max_drawdown_pct}%` : '—', 'Realized, from peak'],
				['Realized vol', r.realized_volatility_pct != null ? `${r.realized_volatility_pct}%` : '—', 'Per-trade return σ'],
			];
			const grid = cells.map(([k, v]) =>
				`<div class="awh-risk-cell"><div class="awh-risk-k">${escapeHtml(k)}</div><div class="awh-risk-v">${escapeHtml(v)}</div></div>`).join('');
			const flags = (d.risk_flags || []).map((f) =>
				`<li class="awh-flag is-${escapeHtml(f.level)}">${escapeHtml(f.text)}</li>`).join('');
			return `<div class="awh-card">
				<h2 class="awh-card-h">Risk</h2>
				<div class="awh-risk-grid">${grid}</div>
				${flags ? `<ul class="awh-flags">${flags}</ul>` : ''}
			</div>`;
		}

		function wire() {
			panel.querySelectorAll('[data-trade]').forEach((b) => {
				b.addEventListener('click', async () => {
					const mint = b.dataset.trade;
					if (mint) await copyToClipboard(mint);
					ctx.openTab('trade');
					toast('Mint copied — paste it into Trade to load this coin.');
				});
			});
		}

		async function fetchSnapshot() {
			const net = ctx.getNetwork();
			const url = `/api/agents/${encodeURIComponent(ctx.agentId)}/portfolio?network=${encodeURIComponent(net)}`;
			const r = await fetch(url, { credentials: 'include' });
			const j = await r.json().catch(() => ({}));
			if (!r.ok) {
				const code = typeof j?.error === 'string' ? j.error : j?.error?.code || `error ${r.status}`;
				throw new Error(j?.error_description || j?.error?.message || code);
			}
			return j.data;
		}

		async function reload() {
			state.loaded = false;
			state.error = null;
			render();
			try {
				const d = await fetchSnapshot();
				if (destroyed) return;
				state.data = d;
				pushSpark(d?.net_worth?.usd);
				state.error = null;
			} catch (e) {
				state.error = e?.message || 'network error';
			} finally {
				state.loaded = true;
				render();
				if (!state.error) openStream();
			}
		}

		function openStream() {
			closeStream();
			if (destroyed || !visible) return;
			const net = ctx.getNetwork();
			try {
				es = new EventSource(
					`/api/agents/${encodeURIComponent(ctx.agentId)}/portfolio/stream?network=${encodeURIComponent(net)}`,
					{ withCredentials: true },
				);
			} catch { es = null; return; }
			es.addEventListener('snapshot', (msg) => {
				let ev;
				try { ev = JSON.parse(msg.data); } catch { return; }
				if (destroyed || !ev) return;
				state.data = { ...state.data, ...ev };
				pushSpark(ev?.net_worth?.usd);
				state.live = true;
				render();
			});
			es.addEventListener('error', () => {
				state.live = false;
				// EventSource auto-reconnects; if the server closed permanently, stop.
				if (es && es.readyState === EventSource.CLOSED) closeStream();
			});
		}
		function closeStream() {
			if (es) { try { es.close(); } catch { /* noop */ } es = null; }
			state.live = false;
		}

		detachNet = ctx.onNetworkChange(() => {
			state.spark = [];
			closeStream();
			reload();
		});

		render();

		return {
			onShow() {
				visible = true;
				if (!state.loaded || state.error) reload();
				else { render(); openStream(); }
			},
			onHide() {
				visible = false;
				closeStream();
			},
			destroy() {
				destroyed = true;
				closeStream();
				detachNet?.();
			},
		};
	},
});

function formatNum(n) {
	if (n == null || !Number.isFinite(n)) return '—';
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
	if (n >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
	if (n >= 1) return n.toLocaleString('en-US', { maximumFractionDigits: 4 });
	return Number(n.toPrecision(4)).toString();
}

function hhiLabel(hhi) {
	// HHI 0..1 → plain reading: <0.15 diversified, 0.15-0.4 moderate, >0.4 concentrated.
	if (hhi < 0.15) return 'Broad';
	if (hhi < 0.4) return 'Moderate';
	return 'Concentrated';
}
