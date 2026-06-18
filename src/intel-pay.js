// Pay-per-use for the $THREE Intel Deep Report — the client flow that lets anyone
// pay $THREE for one synthesized per-token dossier. Drives the same server-
// authoritative quote → sign → settle rail Forge uses (src/token-pay.js →
// /api/token/quote|settle) behind a designed status modal, then hands the settled
// { paymentId, refId } back so the caller can redeem it at /api/three-intel/deep-report.
//
// One entry point:
//   import { payForDeepReport } from './intel-pay.js';
//   const r = await payForDeepReport({ usd: 0.1, symbol: 'THREE' });
//   if (r.ok) fetchReport({ paymentId: r.paymentId, refId: r.refId });
//
// Every state is designed: confirm, the live phases (pricing → approve → confirming
// → verifying), and the recoverable errors (no wallet, sign-in, cancelled, not
// enough $THREE → Get $THREE, settlement failure → retry). Resolves { ok:false } on
// cancel/error and { ok:true, paymentId, refId } on a verified on-chain payment.

import { payWithToken } from './token-pay.js';

const ECONOMY_URL = '/three';
const SIGN_IN_URL = '/login';
const WALLET_URL = 'https://phantom.app/';

let _stylesInjected = false;

function escapeHtml(s) {
	return String(s ?? '').replace(
		/[&<>"']/g,
		(c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
	);
}

function clientNonce() {
	const id =
		(typeof crypto !== 'undefined' && crypto.randomUUID && crypto.randomUUID()) ||
		`${Date.now()}-${Math.random().toString(16).slice(2)}`;
	return `intel-deep-${id}`;
}

const usdLabel = (usd) => `$${(Number(usd) || 0).toFixed(2)}`;

const PHASE_COPY = {
	quoting: 'Pricing in $THREE…',
	awaiting_signature: 'Approve the payment in your wallet…',
	confirming: 'Confirming on Solana…',
	settling: 'Verifying your payment…',
};

function classifyError(err) {
	const code = err?.code || '';
	const msg = String(err?.message || '');
	if (code === 'no_wallet' || code === 'not_connected' || code === 'no_pubkey') {
		return {
			title: 'No Solana wallet',
			detail: 'Connect a Solana wallet (Phantom) to pay in $THREE, then try again.',
			cta: { label: 'Get Phantom', href: WALLET_URL, external: true },
		};
	}
	if (code === 'unauthorized') {
		return {
			title: 'Sign in to pay',
			detail: 'Sign in to three.ws first so we can issue your $THREE payment quote.',
			cta: { label: 'Sign in', href: SIGN_IN_URL },
		};
	}
	if (/reject|denied|cancel|declin|user.*reject/i.test(msg)) {
		return {
			title: 'Payment cancelled',
			detail: 'You dismissed the wallet request — no $THREE was spent.',
			cta: { label: 'Try again', retry: true },
		};
	}
	if (code === 'insufficient_funds' || /insufficient|0x1\b|not enough|debit|exceeds.*balance/i.test(msg)) {
		return {
			title: 'Not enough $THREE',
			detail: "Your wallet doesn't hold enough $THREE for this report.",
			cta: { label: 'Get $THREE', href: ECONOMY_URL },
		};
	}
	if (code === 'price_unavailable') {
		return {
			title: 'Price feed unavailable',
			detail: 'We couldn’t price $THREE just now. Try again in a moment.',
			cta: { label: 'Try again', retry: true },
		};
	}
	return {
		title: 'Payment didn’t go through',
		detail:
			msg && msg.length < 160
				? msg
				: 'Something interrupted the payment. Try again — no $THREE is spent unless it settles.',
		cta: { label: 'Try again', retry: true },
	};
}

function injectStyles() {
	if (_stylesInjected) return;
	_stylesInjected = true;
	const css = `
.ipay-overlay{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;padding:20px;
  background:rgba(6,7,12,.66);backdrop-filter:blur(6px);opacity:0;transition:opacity .22s ease}
.ipay-overlay.ipay-in{opacity:1}
.ipay-modal{width:min(420px,94vw);background:linear-gradient(180deg,#15161d,#0e0f15);
  border:1px solid rgba(255,255,255,.1);border-radius:18px;padding:22px;color:#f2f3f7;
  box-shadow:0 30px 80px rgba(0,0,0,.6);transform:translateY(8px) scale(.99);transition:transform .22s ease}
.ipay-overlay.ipay-in .ipay-modal{transform:none}
.ipay-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:4px}
.ipay-title{font:600 15px/1.3 system-ui,sans-serif;letter-spacing:.2px}
.ipay-x{appearance:none;background:transparent;border:0;color:#9aa0ad;font-size:20px;line-height:1;
  cursor:pointer;padding:4px;border-radius:8px}
.ipay-x:hover{color:#fff;background:rgba(255,255,255,.07)}
.ipay-x:focus-visible{outline:2px solid #7cc4ff;outline-offset:2px}
.ipay-sub{font:400 13px/1.5 system-ui,sans-serif;color:#aeb4c2;margin:8px 0 16px}
.ipay-status{font:500 13.5px/1.5 system-ui,sans-serif;color:#cdd2dd;min-height:20px;
  display:flex;align-items:center;gap:9px;margin-bottom:14px}
.ipay-status--ok{color:#6ee7a8}
.ipay-spinner{width:15px;height:15px;border-radius:50%;border:2px solid rgba(255,255,255,.22);
  border-top-color:#7cc4ff;animation:ipay-spin .7s linear infinite;flex:0 0 auto}
@keyframes ipay-spin{to{transform:rotate(360deg)}}
.ipay-err-title{font:600 14px/1.4 system-ui,sans-serif;color:#ffb4b4;margin-bottom:5px}
.ipay-err-detail{font:400 13px/1.5 system-ui,sans-serif;color:#b9bdc8;margin-bottom:14px}
.ipay-actions{display:flex;gap:9px;flex-wrap:wrap}
.ipay-btn{appearance:none;border:0;border-radius:11px;padding:10px 16px;cursor:pointer;
  font:600 13.5px/1 system-ui,sans-serif;transition:filter .15s ease,transform .1s ease}
.ipay-btn:active{transform:translateY(1px)}
.ipay-btn:focus-visible{outline:2px solid #7cc4ff;outline-offset:2px}
.ipay-btn--primary{background:linear-gradient(180deg,#8a7bff,#6c5cf0);color:#fff}
.ipay-btn--primary:hover{filter:brightness(1.08)}
.ipay-btn--ghost{background:rgba(255,255,255,.06);color:#cdd2dd}
.ipay-btn--ghost:hover{background:rgba(255,255,255,.11)}
@media (prefers-reduced-motion:reduce){.ipay-overlay,.ipay-modal,.ipay-spinner{transition:none;animation:none}}`;
	const style = document.createElement('style');
	style.setAttribute('data-intel-pay', '');
	style.textContent = css;
	document.head.appendChild(style);
}

/**
 * Run the pay-per-use flow for one Intel Deep Report.
 * @param {{ usd:number, symbol?:string }} params
 * @returns {Promise<{ ok:true, paymentId:string, refId:string } | { ok:false, cancelled?:boolean }>}
 */
export function payForDeepReport({ usd, symbol = '' }) {
	injectStyles();
	return new Promise((resolve) => {
		const refId = clientNonce();
		let settled = false;

		const overlay = document.createElement('div');
		overlay.className = 'ipay-overlay';
		overlay.setAttribute('role', 'dialog');
		overlay.setAttribute('aria-modal', 'true');
		overlay.setAttribute('aria-label', 'Pay for a Deep Report in $THREE');
		const subj = symbol ? `${escapeHtml(symbol)} ` : '';
		overlay.innerHTML = `
<div class="ipay-modal">
  <div class="ipay-head">
    <div class="ipay-title">Deep Report</div>
    <button type="button" class="ipay-x" data-ipay-x aria-label="Close">×</button>
  </div>
  <div class="ipay-sub">A synthesized ${subj}dossier: on-chain signals, live market, sentiment, and a scored read — paid once in $THREE.</div>
  <div class="ipay-status"></div>
  <div class="ipay-actions"></div>
</div>`;
		document.body.appendChild(overlay);

		const statusEl = overlay.querySelector('.ipay-status');
		const actionsEl = overlay.querySelector('.ipay-actions');

		const cleanup = () => {
			if (overlay._onKey) document.removeEventListener('keydown', overlay._onKey);
			overlay.classList.remove('ipay-in');
			const remove = () => overlay.remove();
			overlay.addEventListener('transitionend', remove, { once: true });
			setTimeout(remove, 280);
		};
		const finish = (result) => {
			if (overlay._done) return;
			overlay._done = true;
			cleanup();
			resolve(result);
		};
		const close = () => finish({ ok: false, cancelled: true });

		function showStatus(text, { busy = false, ok = false } = {}) {
			statusEl.className = 'ipay-status' + (ok ? ' ipay-status--ok' : '');
			statusEl.innerHTML = busy
				? `<span class="ipay-spinner" aria-hidden="true"></span><span>${escapeHtml(text)}</span>`
				: escapeHtml(text);
		}

		function showConfirm() {
			showStatus(`One Deep Report for ${symbol ? escapeHtml(symbol) : 'this token'}, paid in $THREE.`);
			actionsEl.innerHTML =
				`<button type="button" class="ipay-btn ipay-btn--primary" data-ipay-pay>Pay ${usdLabel(usd)}</button>` +
				`<button type="button" class="ipay-btn ipay-btn--ghost" data-ipay-cancel>Cancel</button>`;
			actionsEl.querySelector('[data-ipay-pay]').addEventListener('click', startPayment);
			actionsEl.querySelector('[data-ipay-cancel]').addEventListener('click', close);
			actionsEl.querySelector('[data-ipay-pay]').focus();
		}

		function showError(err) {
			const { title, detail, cta } = classifyError(err);
			statusEl.className = 'ipay-status';
			statusEl.innerHTML = `<div><div class="ipay-err-title">${escapeHtml(title)}</div><div class="ipay-err-detail">${escapeHtml(detail)}</div></div>`;
			actionsEl.innerHTML = '';
			if (cta?.retry) {
				const b = document.createElement('button');
				b.className = 'ipay-btn ipay-btn--primary';
				b.textContent = cta.label;
				b.addEventListener('click', showConfirm);
				actionsEl.appendChild(b);
			} else if (cta?.href) {
				const a = document.createElement('a');
				a.className = 'ipay-btn ipay-btn--primary';
				a.textContent = cta.label;
				a.href = cta.href;
				if (cta.external) {
					a.target = '_blank';
					a.rel = 'noopener';
				}
				actionsEl.appendChild(a);
			}
			const cancel = document.createElement('button');
			cancel.className = 'ipay-btn ipay-btn--ghost';
			cancel.textContent = 'Close';
			cancel.addEventListener('click', close);
			actionsEl.appendChild(cancel);
		}

		async function startPayment() {
			actionsEl.innerHTML = '';
			showStatus(PHASE_COPY.quoting, { busy: true });
			try {
				const result = await payWithToken({
					purpose: 'consumption',
					usd,
					refType: 'intel',
					refId,
					onStatus: (phase) => showStatus(PHASE_COPY[phase] || 'Working…', { busy: true }),
				});
				if (!result?.ok || !result.payment_id) {
					throw Object.assign(new Error('Payment could not be verified.'), {
						code: 'verification_failed',
					});
				}
				settled = true;
				showStatus('Payment confirmed — building your report…', { ok: true });
				setTimeout(() => finish({ ok: true, paymentId: result.payment_id, refId }), 700);
			} catch (err) {
				if (settled) return;
				showError(err);
			}
		}

		overlay.addEventListener('click', (e) => {
			if (e.target === overlay) close();
		});
		overlay.querySelector('[data-ipay-x]').addEventListener('click', close);
		const onKey = (e) => {
			if (e.key === 'Escape') close();
		};
		overlay._onKey = onKey;
		document.addEventListener('keydown', onKey);

		requestAnimationFrame(() => {
			overlay.classList.add('ipay-in');
			showConfirm();
		});
	});
}
