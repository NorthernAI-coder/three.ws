// $THREE access — client helper + lock UI (Token Utility v1).
//
// One module any page imports to make the hold-to-access lever real in the UI:
//   • getAccess(feature?)   — GET /api/three/access (the gated-feature matrix or
//                             a single feature), short-cached.
//   • getTierPass()         — POST /api/three/tier-pass, cached until ~1 min before
//                             expiry; the portable, RPC-free proof of holder tier.
//   • tierPassHeader()      — the cached pass string for the x-three-tier-pass
//                             header (sync; null when none), so a gated request can
//                             attach an eligible holder's entitlement with no await.
//   • attachTierPass(h)     — adds that header to a headers object when a pass is
//                             cached; no-op + returns it unchanged otherwise.
//   • primeTierPass()       — fetch the pass in the background (fire-and-forget).
//   • mountTierBadge(el)    — render the signed-in holder's tier chip (Bronze+).
//   • onGate(payload)       — open the upsell from a 402 three_hold_required body
//                             (the intent-named entry; showThreeGate is the impl).
//   • showThreeGate(gate)   — the upsell modal: Get $THREE + what you hold vs. need.
//   • renderInlineLock(el)  — a compact lock/unlock chip beside a gated control.
//
// Everything degrades to a safe locked/anonymous state on any network failure —
// the UI never throws and the server stays the only authority on eligibility.

const ACCESS_TTL_MS = 30_000;
let _matrix = { at: 0, data: null };
let _tierPass = null; // { pass, tier, exp(ms) }
let _stylesInjected = false;

const ECONOMY_URL = '/three';

function escapeHtml(s) {
	return String(s ?? '').replace(
		/[&<>"']/g,
		(c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
	);
}

// base64url → JSON (the tier-pass payload is the part before the first '.').
function decodePassExpMs(pass) {
	try {
		let b = String(pass).split('.')[0].replace(/-/g, '+').replace(/_/g, '/');
		while (b.length % 4) b += '=';
		const json = JSON.parse(atob(b));
		const exp = Number(json.exp) || 0;
		return exp > 0 ? exp * 1000 : 0;
	} catch {
		return 0;
	}
}

// ── Data ──────────────────────────────────────────────────────────────────────

/**
 * Fetch the access matrix (no arg) or a single feature's access.
 * Returns null on failure so callers render a safe locked state.
 * Matrix shape: { signed_in, wallet_linked, tier:{level,id,label,held_usd}, features:[…] }
 * Feature shape: { signed_in, wallet_linked, tier, access:{…} }
 */
export async function getAccess(feature, { fresh = false } = {}) {
	if (!fresh && !feature && _matrix.data && Date.now() - _matrix.at < ACCESS_TTL_MS) {
		return _matrix.data;
	}
	const url = feature
		? `/api/three/access?feature=${encodeURIComponent(feature)}`
		: '/api/three/access';
	try {
		const r = await fetch(url, { credentials: 'include' });
		if (!r.ok) return null;
		const data = await r.json();
		if (!feature) _matrix = { at: Date.now(), data };
		return data;
	} catch {
		return null;
	}
}

/**
 * Mint (or reuse) the signed $THREE tier pass. Cached until ~1 min before expiry.
 * Returns null when the user is anonymous / has no linked wallet (401/403) or on
 * any failure — the caller simply proceeds with no pass attached.
 */
export async function getTierPass() {
	const now = Date.now();
	if (_tierPass && _tierPass.exp - 60_000 > now) return _tierPass;
	try {
		const r = await fetch('/api/three/tier-pass', { method: 'POST', credentials: 'include' });
		if (!r.ok) {
			_tierPass = null;
			return null;
		}
		const data = await r.json();
		if (!data?.pass) return null;
		const expMs = decodePassExpMs(data.pass) || now + 9 * 60_000;
		_tierPass = { pass: data.pass, tier: data.tier || null, exp: expMs };
		return _tierPass;
	} catch {
		return null;
	}
}

/** The cached pass string for the x-three-tier-pass header, or null. Synchronous. */
export function tierPassHeader() {
	return _tierPass && _tierPass.exp - 60_000 > Date.now() ? _tierPass.pass : null;
}

/**
 * Attach the cached $THREE tier pass to a request headers object so an eligible
 * holder's entitlement rides along on a gated call. Synchronous and side-effect
 * free when no valid pass is cached — the request simply proceeds at the base
 * entitlement and the server stays the authority. Returns the same object for
 * chaining: `fetch(url, { headers: attachTierPass({ 'content-type': '…' }) })`.
 */
export function attachTierPass(headers = {}) {
	const pass = tierPassHeader();
	if (pass) headers['x-three-tier-pass'] = pass;
	return headers;
}

/** Fetch the pass in the background so it's ready when a gated request fires. */
export function primeTierPass() {
	getTierPass();
}

// ── Tier badge ─────────────────────────────────────────────────────────────────

/** Render the signed-in user's tier chip into `target`. Hides it for anonymous users. */
export async function mountTierBadge(target) {
	const el = typeof target === 'string' ? document.querySelector(target) : target;
	if (!el) return;
	injectStyles();
	const data = await getAccess();
	// Show the chip only for an actual holder (Bronze+). Anonymous visitors and
	// signed-in non-holders (Member, level 0) hold no $THREE, so the green holder
	// chip would read as a false signal — they get the upsell on /three instead.
	if (!data || !data.signed_in || !data.tier || (Number(data.tier.level) || 0) < 1) {
		el.hidden = true;
		el.innerHTML = '';
		return;
	}
	el.hidden = false;
	const t = data.tier;
	const held =
		t.held_usd > 0
			? ` · $${Number(t.held_usd).toLocaleString('en-US', { maximumFractionDigits: 0 })} held`
			: '';
	el.innerHTML = `<a class="tg-badge tg-tier-${escapeHtml(t.id)}" href="${ECONOMY_URL}#tiers" title="Your $THREE holder tier — what it unlocks${held}">◆ ${escapeHtml(t.label)}</a>`;
}

// ── Inline lock chip (beside a gated control) ─────────────────────────────────

/**
 * Render a compact lock/unlock chip into `target` from a single-feature access
 * payload (the `.access` object from getAccess(feature)). Null clears it.
 */
export function renderInlineLock(target, access) {
	const el = typeof target === 'string' ? document.querySelector(target) : target;
	if (!el) return;
	injectStyles();
	if (!access) {
		el.innerHTML = '';
		el.hidden = true;
		return;
	}
	el.hidden = false;
	if (access.eligible) {
		el.innerHTML = `<span class="tg-chip tg-chip--ok" role="status">✓ Unlocked · ${escapeHtml(access.held?.label || 'Holder')}</span>`;
		return;
	}
	const req = access.required?.label || 'a higher tier';
	el.innerHTML =
		`<span class="tg-chip tg-chip--lock"><span class="tg-lock" aria-hidden="true">🔒</span> ${escapeHtml(req)} holder perk` +
		` · <a href="${ECONOMY_URL}">Get $THREE →</a></span>`;
}

// ── Upsell modal (402 three_hold_required) ────────────────────────────────────

/**
 * Show the holder-gate upsell from a `three_hold_required` payload:
 *   { feature, required:{level,id,label}, held:{level,id,label,usd?}, why,
 *     get_three_url?, acquire?, usd_to_go?, pay_per_use?:{action,usd}|null, message? }
 * @param {object} gate
 * @param {{ onPayPerUse?: (pay)=>void }} [opts]  when provided AND gate.pay_per_use
 *        is present, a working "Pay per generation" button is rendered.
 */
export function showThreeGate(gate, opts = {}) {
	injectStyles();
	if (!gate || typeof document === 'undefined') return;
	closeThreeGate(); // never stack

	const required = gate.required || { label: 'a higher tier' };
	const held = gate.held || { label: 'Member', level: 0 };
	const getUrl = gate.get_three_url || ECONOMY_URL;
	const heldUsd = Number(held.usd) || 0;
	const reason = gate.reason || (held.level > 0 ? 'insufficient_tier' : '');

	const sub =
		reason === 'sign_in'
			? 'Sign in and link a Solana wallet to check your tier.'
			: reason === 'link_wallet'
				? 'Link a Solana wallet to your account so we can read your $THREE.'
				: `You hold <strong>${escapeHtml(held.label)}</strong>${heldUsd > 0 ? ` (≈ $${heldUsd.toLocaleString('en-US', { maximumFractionDigits: 0 })})` : ''}. Reach <strong>${escapeHtml(required.label)}</strong> to unlock this.`;

	const payBtn =
		gate.pay_per_use && typeof opts.onPayPerUse === 'function'
			? `<button class="tg-btn tg-btn--ghost" id="tg-pay" type="button">Pay $${Number(gate.pay_per_use.usd).toFixed(2)} per generation</button>`
			: '';

	const overlay = document.createElement('div');
	overlay.className = 'tg-overlay';
	overlay.id = 'tg-overlay';
	overlay.innerHTML = `
		<div class="tg-modal" role="dialog" aria-modal="true" aria-labelledby="tg-title" aria-describedby="tg-desc">
			<button class="tg-x" id="tg-close" type="button" aria-label="Close">✕</button>
			<div class="tg-badge-lg" aria-hidden="true">◆</div>
			<h2 class="tg-title" id="tg-title">${escapeHtml(gate.message ? required.label + ' perk' : 'Hold $THREE to unlock')}</h2>
			<p class="tg-feature">${escapeHtml(gate.label || gate.message || 'This is a $THREE holder feature.')}</p>
			<p class="tg-desc" id="tg-desc">${sub}</p>
			${gate.why ? `<p class="tg-why">${escapeHtml(gate.why)}</p>` : ''}
			<div class="tg-actions">
				<a class="tg-btn tg-btn--primary" id="tg-get" href="${escapeHtml(getUrl)}">Get $THREE</a>
				${payBtn}
				<a class="tg-btn tg-btn--ghost" href="${ECONOMY_URL}#tiers">See holder tiers</a>
			</div>
			<p class="tg-foot">$THREE is the only coin on three.ws. Draft &amp; Standard generation stay free, forever.</p>
		</div>`;

	document.body.appendChild(overlay);
	const modal = overlay.querySelector('.tg-modal');
	const close = () => closeThreeGate();
	overlay.addEventListener('click', (e) => {
		if (e.target === overlay) close();
	});
	overlay.querySelector('#tg-close').addEventListener('click', close);
	const payEl = overlay.querySelector('#tg-pay');
	if (payEl) {
		payEl.addEventListener('click', () => {
			close();
			opts.onPayPerUse(gate.pay_per_use);
		});
	}
	const onKey = (e) => {
		if (e.key === 'Escape') close();
	};
	overlay._onKey = onKey;
	document.addEventListener('keydown', onKey);
	requestAnimationFrame(() => {
		overlay.classList.add('tg-in');
		(overlay.querySelector('#tg-get') || modal).focus();
	});
}

export function closeThreeGate() {
	const overlay = document.getElementById('tg-overlay');
	if (!overlay) return;
	if (overlay._onKey) document.removeEventListener('keydown', overlay._onKey);
	overlay.classList.remove('tg-in');
	const remove = () => overlay.remove();
	overlay.addEventListener('transitionend', remove, { once: true });
	setTimeout(remove, 260); // fallback when transitions are disabled
}

/**
 * Open the holder-gate upsell from a `three_hold_required` 402 response body — the
 * entry point a gated request's error path calls when the server rejects a stale
 * or missing pass. The 402 payload already carries everything the modal needs
 * ({ feature, label, required, held, why, pay_per_use, reason }), so it is passed
 * straight through to {@link showThreeGate}. A thin, intent-named alias so call
 * sites read as "on gate → upsell" rather than reaching for the modal directly.
 * @param {object} payload  the parsed `three_hold_required` 402 body
 * @param {{ onPayPerUse?: (pay)=>void }} [opts]
 */
export function onGate(payload, opts) {
	return showThreeGate(payload, opts);
}

// ── Styles ────────────────────────────────────────────────────────────────────

function injectStyles() {
	if (_stylesInjected || typeof document === 'undefined') return;
	_stylesInjected = true;
	const css = `
	.tg-badge{display:inline-flex;align-items:center;gap:6px;font:600 12px/1 Inter,system-ui,sans-serif;
		color:#6ee7a8;border:1px solid rgba(110,231,168,.3);background:rgba(110,231,168,.07);
		border-radius:999px;padding:6px 11px;text-decoration:none;transition:.16s cubic-bezier(.22,1,.36,1);white-space:nowrap;}
	.tg-badge:hover{transform:translateY(-1px);border-color:rgba(110,231,168,.55);background:rgba(110,231,168,.12);}
	.tg-tier-gold,.tg-tier-genesis{color:#f5c451;border-color:rgba(245,196,81,.32);background:rgba(245,196,81,.08);}
	.tg-tier-silver{color:#cfd6e4;border-color:rgba(207,214,228,.3);background:rgba(207,214,228,.06);}
	.tg-chip{display:inline-flex;align-items:center;gap:6px;font:600 11.5px/1.3 Inter,system-ui,sans-serif;
		border-radius:999px;padding:5px 10px;}
	.tg-chip--lock{color:#f0d488;background:rgba(245,196,81,.1);border:1px solid rgba(245,196,81,.24);}
	.tg-chip--lock a{color:#6ee7a8;text-decoration:none;font-weight:700;}
	.tg-chip--lock a:hover{text-decoration:underline;}
	.tg-chip--ok{color:#6ee7a8;background:rgba(110,231,168,.1);border:1px solid rgba(110,231,168,.24);}
	.tg-lock{font-size:11px;}
	.tg-overlay{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;
		padding:20px;background:rgba(4,4,7,.66);backdrop-filter:blur(7px);opacity:0;transition:opacity .2s ease;}
	.tg-overlay.tg-in{opacity:1;}
	.tg-modal{position:relative;width:min(440px,100%);background:linear-gradient(180deg,#0e0e13,#0a0a0e);
		border:1px solid #23232c;border-radius:20px;padding:34px 30px 26px;text-align:center;color:#f6f6f8;
		font-family:Inter,system-ui,sans-serif;box-shadow:0 30px 80px -30px rgba(0,0,0,.8);
		transform:translateY(10px) scale(.98);transition:transform .24s cubic-bezier(.22,1,.36,1);}
	.tg-overlay.tg-in .tg-modal{transform:none;}
	.tg-x{position:absolute;top:12px;right:12px;width:32px;height:32px;border-radius:9px;border:1px solid #23232c;
		background:transparent;color:#9a9aa4;cursor:pointer;font-size:13px;transition:.15s;}
	.tg-x:hover{color:#f6f6f8;border-color:#34343f;}
	.tg-badge-lg{font-size:34px;color:#6ee7a8;filter:drop-shadow(0 0 14px rgba(110,231,168,.5));margin-bottom:8px;}
	.tg-title{font-size:22px;font-weight:820;letter-spacing:-.02em;margin:2px 0 8px;}
	.tg-feature{font-size:14.5px;color:#c9c9d2;margin:0 0 10px;line-height:1.45;}
	.tg-desc{font-size:13.5px;color:#9a9aa4;margin:0 0 8px;line-height:1.5;}
	.tg-desc strong{color:#f6f6f8;}
	.tg-why{font-size:12.5px;color:#80808b;margin:0 0 18px;line-height:1.5;font-style:italic;}
	.tg-actions{display:flex;flex-direction:column;gap:9px;margin-top:6px;}
	.tg-btn{display:inline-flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;
		padding:12px 18px;border-radius:12px;text-decoration:none;cursor:pointer;border:1px solid #2a2a33;
		transition:.16s cubic-bezier(.22,1,.36,1);}
	.tg-btn--primary{background:#6ee7a8;color:#06120c;border-color:#6ee7a8;}
	.tg-btn--primary:hover{background:#8af0c0;transform:translateY(-1px);}
	.tg-btn--ghost{background:#0e0e13;color:#f6f6f8;}
	.tg-btn--ghost:hover{border-color:#3a3a44;transform:translateY(-1px);}
	.tg-foot{font-size:11px;color:#6a6a74;margin:16px 0 0;line-height:1.5;}
	:where(.tg-btn,.tg-badge,.tg-x):focus-visible{outline:2px solid #6ee7a8;outline-offset:2px;}
	@media (prefers-reduced-motion: reduce){
		.tg-overlay,.tg-modal,.tg-badge,.tg-btn{transition:none;}
		.tg-modal{transform:none;}
	}`;
	const el = document.createElement('style');
	el.id = 'tg-styles';
	el.textContent = css;
	document.head.appendChild(el);
}
