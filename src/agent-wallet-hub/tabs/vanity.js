/**
 * Agent Wallet hub — Vanity tab.
 *
 * Owner-only. Opt-in: grind a custom vanity address for the agent's custodial
 * Solana wallet, with a per-agent prefix/suffix the owner chooses. The grind runs
 * server-side (the secret key never leaves the server) via
 * POST /api/agents/:id/solana/vanity. If the wallet already holds funds, every
 * asset is swept to the new address before the stored key is swapped — funds are
 * never stranded (the swap is aborted if the sweep fails).
 *
 * Server-side grinding is bounded to short patterns (≤3 combined chars). Longer,
 * harder patterns are ground in the browser at /vanity-wallet (GPU + workers, up
 * to 8 chars) and assigned from there — this tab links out for that path.
 */

import { registerWalletTab } from '../registry.js';
import { consumeCsrfToken } from '../../api.js';

const MAX_CHARS = 3;
const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]*$/;

const VN_STYLE_ID = 'awh-vanity-style';
const VN_STYLE = `
.awh-vn-head{display:flex;align-items:center;gap:10px;margin-bottom:var(--space-4,16px);}
.awh-vn-addr{font-family:var(--font-mono,ui-monospace,monospace);font-size:var(--text-md,.8125rem);color:var(--ink,#e8e8e8);word-break:break-all;}
.awh-vn-addr b{color:#a78bfa;}
.awh-vn-tag{font-size:var(--text-2xs,.6875rem);font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#a78bfa;background:rgba(139,92,246,.15);border:1px solid rgba(139,92,246,.4);border-radius:999px;padding:2px 8px;}
.awh-vn-grid{display:flex;gap:10px;}
.awh-vn-grid .awh-fld{flex:1;}
.awh-vn-est{font-size:var(--text-sm,.764rem);color:var(--ink-dim,#888);margin:2px 0 var(--space-3,12px);}
.awh-vn-est b{color:var(--ink,#e8e8e8);}
.awh-vn-est.warn{color:var(--warn,#fbbf24);}
.awh-vn-toggle{display:flex;align-items:center;gap:8px;font-size:var(--text-sm,.764rem);color:var(--ink-dim,#888);margin-bottom:var(--space-3,12px);cursor:pointer;}
.awh-vn-warn{background:color-mix(in srgb, var(--warn,#fbbf24) 10%, transparent);border:1px solid color-mix(in srgb, var(--warn,#fbbf24) 28%, transparent);color:var(--warn,#fbbf24);border-radius:var(--radius-md,10px);padding:10px 12px;font-size:var(--text-sm,.764rem);margin-bottom:var(--space-3,12px);line-height:1.45;}
.awh-vn-out{font-family:var(--font-mono,ui-monospace,monospace);font-size:var(--text-2xs,.6875rem);color:var(--ink-dim,#888);}
`;

function injectStyle() {
	if (typeof document === 'undefined' || document.getElementById(VN_STYLE_ID)) return;
	const tag = document.createElement('style');
	tag.id = VN_STYLE_ID;
	tag.textContent = VN_STYLE;
	document.head.appendChild(tag);
}

async function call(url, { method = 'GET', body = null } = {}) {
	try {
		const opts = { method, credentials: 'include', headers: {} };
		if (body != null) {
			opts.headers['content-type'] = 'application/json';
			opts.body = JSON.stringify(body);
		}
		// Grinding a vanity address swaps the keypair and sweeps funds — the POST is
		// state-changing, so carry a single-use CSRF token (server burns it on use).
		if (method !== 'GET') {
			const token = await consumeCsrfToken();
			if (token) opts.headers['x-csrf-token'] = token;
		}
		const r = await fetch(url, opts);
		let j = null;
		try { j = await r.json(); } catch { /* empty body */ }
		if (!r.ok) return { ok: false, status: r.status, code: j?.error || 'error', message: j?.error_description || `request failed (${r.status})` };
		return { ok: true, status: r.status, data: j?.data ?? j };
	} catch (err) {
		return { ok: false, status: 0, code: 'network_error', message: err?.message || 'network error' };
	}
}

// Expected attempts ≈ alphabet^len. Matches the server estimate.
function estimate(prefix, suffix, ignoreCase) {
	const len = (prefix?.length || 0) + (suffix?.length || 0);
	if (len === 0) return 1;
	return Math.pow(ignoreCase ? 33 : 58, len);
}

registerWalletTab({
	id: 'vanity',
	label: 'Vanity',
	order: 50,
	ownerOnly: true,
	mount({ panel, ctx }) {
		injectStyle();
		const esc = ctx.escapeHtml;
		const { toast } = ctx;
		const base = `/api/agents/${encodeURIComponent(ctx.agentId)}/solana/vanity`;

		let destroyed = false;
		const state = {
			status: null,       // { address, vanity_prefix, vanity_suffix, is_vanity } | { error }
			prefix: '',
			suffix: '',
			ignoreCase: false,
			phase: 'form',      // 'form' | 'grinding' | 'success'
			result: null,
			err: null,
		};

		function currentAddrHTML() {
			const s = state.status;
			if (!s || s.error || !s.address) return '';
			const a = s.address;
			const p = s.vanity_prefix;
			const sf = s.vanity_suffix;
			let html = esc(a);
			if (p && a.startsWith(p)) html = `<b>${esc(p)}</b>${esc(a.slice(p.length))}`;
			if (sf && a.endsWith(sf)) {
				const body = p && a.startsWith(p) ? a.slice(p.length) : a;
				const mid = body.slice(0, body.length - sf.length);
				const pre = p && a.startsWith(p) ? `<b>${esc(p)}</b>` : '';
				html = `${pre}${esc(mid)}<b>${esc(sf)}</b>`;
			}
			return html;
		}

		function render() {
			if (destroyed) return;
			if (state.status === null) {
				panel.innerHTML = `<div class="awh-card"><div class="awh-skel-line" style="width:45%"></div><div class="awh-skel-line"></div><div class="awh-skel-line" style="width:70%"></div></div>`;
				return;
			}
			if (state.phase === 'success') { panel.innerHTML = renderSuccess(); wireSuccess(); return; }

			const s = state.status;
			const isVanity = !!(s && !s.error && s.is_vanity);
			const combined = state.prefix.length + state.suffix.length;
			const tooHard = combined > MAX_CHARS;
			const est = estimate(state.prefix, state.suffix, state.ignoreCase);

			panel.innerHTML = `
				<div class="awh-card">
					${s?.error ? `<div class="awh-err">Couldn’t load wallet. <div class="why">${esc(s.error)}</div></div>` : `
					<div class="awh-vn-head">
						<div>
							<div class="awh-card-h" style="margin-bottom:4px;">Current address ${isVanity ? '<span class="awh-vn-tag">vanity</span>' : ''}</div>
							<div class="awh-vn-addr">${currentAddrHTML() || '<span class="awh-empty">No wallet yet — grinding one will provision it.</span>'}</div>
						</div>
					</div>`}

					<p class="awh-empty" style="margin-top:0;">
						Grind a custom address for this agent's wallet. You pick the pattern; the key is generated and stored server-side — it never leaves three.ws.
					</p>

					<div class="awh-vn-grid">
						<div class="awh-fld">
							<label for="awh-vn-prefix">Starts with</label>
							<input class="awh-in awh-mono" id="awh-vn-prefix" autocomplete="off" spellcheck="false" maxlength="3" placeholder="e.g. ${esc((ctx.agent?.name || 'ag').toLowerCase().replace(/[^1-9a-hj-np-za-km-z]/gi, '').slice(0, 3) || 'ag')}" value="${esc(state.prefix)}">
						</div>
						<div class="awh-fld">
							<label for="awh-vn-suffix">Ends with</label>
							<input class="awh-in awh-mono" id="awh-vn-suffix" autocomplete="off" spellcheck="false" maxlength="3" placeholder="optional" value="${esc(state.suffix)}">
						</div>
					</div>

					<label class="awh-vn-toggle">
						<input type="checkbox" id="awh-vn-ic" ${state.ignoreCase ? 'checked' : ''}>
						Case-insensitive (faster, matches any capitalization)
					</label>

					<div class="awh-vn-est ${tooHard ? 'warn' : ''}" id="awh-vn-est">
						${combined === 0
							? 'Enter a prefix and/or suffix (base58 — no 0, O, I or l).'
							: tooHard
								? `Too hard for instant grinding (${combined} chars). <a href="/vanity-wallet" target="_blank" rel="noopener" style="color:var(--warn,#fbbf24);text-decoration:underline;">Grind up to 8 chars in your browser →</a> and assign it.`
								: `≈ <b>${est.toLocaleString()}</b> attempts — usually a few seconds.`}
					</div>

					${isVanity || (s && !s.error && s.address)
						? `<div class="awh-vn-warn">⚠ This replaces the agent's current address. Any SOL or tokens it holds are <b>automatically swept to the new address</b> first — the swap only completes once funds have moved. Apps pointed at the old address must be updated.</div>`
						: ''}

					<div class="awh-err" id="awh-vn-err" hidden></div>
					<button class="awh-btn awh-btn--primary" id="awh-vn-go" type="button" style="width:100%;" ${state.phase === 'grinding' ? 'disabled' : ''}>
						${state.phase === 'grinding' ? '<span class="awh-spin"></span>Grinding & applying…' : 'Grind &amp; apply vanity address'}
					</button>
				</div>`;

			wireForm();
		}

		function renderSuccess() {
			const r = state.result || {};
			const net = ctx.getNetwork();
			const explorer = net === 'devnet'
				? `https://explorer.solana.com/address/${r.address}?cluster=devnet`
				: `https://solscan.io/account/${r.address}`;
			const sweptLine = r.swept
				? `<div class="awh-empty" style="padding:0 0 8px;">Migrated ${r.swept.sol ? `${r.swept.sol} SOL` : 'funds'}${r.swept.tokens?.length ? ` + ${r.swept.tokens.length} token${r.swept.tokens.length > 1 ? 's' : ''}` : ''} from the old address.</div>`
				: '';
			return `
				<div class="awh-card awh-ok">
					<div class="ic">✦</div>
					<div style="font-size:var(--text-md,.8125rem);font-weight:600;color:var(--ink-bright,#fff);margin-bottom:6px;">Vanity address applied</div>
					<div class="awh-vn-addr" style="margin-bottom:8px;">${(() => {
						const a = r.address || '';
						const p = r.vanity_prefix; const sf = r.vanity_suffix;
						let h = esc(a);
						if (p && a.startsWith(p)) h = `<b>${esc(p)}</b>${esc(a.slice(p.length))}`;
						if (sf && a.endsWith(sf)) { const mid = (p && a.startsWith(p) ? a.slice(p.length) : a); h = `${p && a.startsWith(p) ? `<b>${esc(p)}</b>` : ''}${esc(mid.slice(0, mid.length - sf.length))}<b>${esc(sf)}</b>`; }
						return h;
					})()}</div>
					${sweptLine}
					${r.iterations != null ? `<div class="awh-vn-out">Found in ${Number(r.iterations).toLocaleString()} attempts${r.duration_ms != null ? ` · ${(r.duration_ms / 1000).toFixed(1)}s` : ''}</div>` : ''}
					<div style="margin-top:14px;display:flex;gap:8px;justify-content:center;">
						<a class="awh-btn awh-btn--primary" href="${esc(explorer)}" target="_blank" rel="noopener" style="text-decoration:none;">View on explorer ↗</a>
						<button class="awh-btn" id="awh-vn-again" type="button">Change again</button>
					</div>
				</div>`;
		}

		function wireSuccess() {
			panel.querySelector('#awh-vn-again')?.addEventListener('click', () => {
				state.phase = 'form'; state.result = null; state.prefix = ''; state.suffix = '';
				loadStatus();
			});
		}

		function wireForm() {
			const pIn = panel.querySelector('#awh-vn-prefix');
			const sIn = panel.querySelector('#awh-vn-suffix');
			const ic = panel.querySelector('#awh-vn-ic');
			const errEl = panel.querySelector('#awh-vn-err');
			const estEl = panel.querySelector('#awh-vn-est');

			function clean(v) { return (v || '').replace(/[^1-9A-HJ-NP-Za-km-z]/g, '').slice(0, 3); }
			function refreshEst() {
				const combined = state.prefix.length + state.suffix.length;
				const tooHard = combined > MAX_CHARS;
				const est = estimate(state.prefix, state.suffix, state.ignoreCase);
				estEl.className = `awh-vn-est ${tooHard ? 'warn' : ''}`;
				estEl.innerHTML = combined === 0
					? 'Enter a prefix and/or suffix (base58 — no 0, O, I or l).'
					: tooHard
						? `Too hard for instant grinding (${combined} chars). <a href="/vanity-wallet" target="_blank" rel="noopener" style="color:var(--warn,#fbbf24);text-decoration:underline;">Grind up to 8 chars in your browser →</a> and assign it.`
						: `≈ <b>${est.toLocaleString()}</b> attempts — usually a few seconds.`;
			}
			pIn?.addEventListener('input', () => { const c = clean(pIn.value); if (c !== pIn.value) pIn.value = c; state.prefix = c; refreshEst(); });
			sIn?.addEventListener('input', () => { const c = clean(sIn.value); if (c !== sIn.value) sIn.value = c; state.suffix = c; refreshEst(); });
			ic?.addEventListener('change', () => { state.ignoreCase = ic.checked; refreshEst(); });

			panel.querySelector('#awh-vn-go')?.addEventListener('click', async () => {
				errEl.hidden = true;
				const combined = state.prefix.length + state.suffix.length;
				if (combined === 0) { errEl.hidden = false; errEl.textContent = 'Enter a prefix and/or suffix first.'; return; }
				if (combined > MAX_CHARS) { errEl.hidden = false; errEl.textContent = `Server grinding supports up to ${MAX_CHARS} combined characters. Use the browser grinder for longer patterns.`; return; }
				state.phase = 'grinding';
				render();
				const res = await call(base, {
					method: 'POST',
					body: { prefix: state.prefix || undefined, suffix: state.suffix || undefined, ignoreCase: state.ignoreCase, network: ctx.getNetwork() },
				});
				if (destroyed) return;
				if (!res.ok) {
					state.phase = 'form';
					render();
					const e = panel.querySelector('#awh-vn-err');
					if (e) { e.hidden = false; e.textContent = res.message; }
					return;
				}
				state.result = res.data;
				state.phase = 'success';
				toast('Vanity address applied');
				render();
			});
		}

		async function loadStatus() {
			state.status = null;
			render();
			const res = await call(base);
			if (destroyed) return;
			state.status = res.ok ? res.data : { error: res.message };
			render();
		}

		loadStatus();

		return {
			onShow() { if (state.status === null) loadStatus(); },
			destroy() { destroyed = true; },
		};
	},
});
