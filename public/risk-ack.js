// risk-ack.js — the real-funds risk acknowledgment gate for three.ws.
//
// three.ws is an experiment in innovation. Before ANY feature commits real
// money (trades, snipes, withdrawals, launches, swaps, x402 payments, fiat
// onramp), the user must have accepted the Risk Disclosure (/legal/risk):
// they use real funds entirely at their own risk and three.ws is not
// responsible for losses.
//
// This file is dependency-free on purpose. It lives in public/ so it is
// importable at runtime from BOTH worlds:
//   - Vite-bundled app modules, via the src/shared/risk-ack.js wrapper
//     (dynamic import of '/risk-ack.js')
//   - plain public/ scripts and third-party embeds (x402.js on merchant
//     sites), where root-relative import resolves against the three.ws origin
//
// Usage — gate any money-committing action:
//
//   import { ensureRiskAck } from '/risk-ack.js';
//   async function onTrade() {
//     if (!(await ensureRiskAck({ context: 'trade' }))) return; // declined
//     … move real funds …
//   }
//
// Acceptance is versioned. Bump RISK_ACK_VERSION when the disclosure changes
// materially and every user re-acknowledges on their next money action.
// Acceptance persists in localStorage and is recorded server-side
// (POST /api/legal/risk-ack → audit_log) for record-keeping.

export const RISK_ACK_VERSION = 1;
export const RISK_ACK_STORAGE_KEY = 'threews:risk-ack';
export const RISK_ACK_ENDPOINT = '/api/legal/risk-ack';

/**
 * Parse a raw stored acceptance record. Pure — safe to unit-test.
 * @param {string|null|undefined} raw
 * @returns {{version:number, acceptedAt:string, context?:string}|null}
 */
export function parseAckRecord(raw) {
	if (!raw || typeof raw !== 'string') return null;
	try {
		const rec = JSON.parse(raw);
		if (!rec || typeof rec !== 'object') return null;
		const version = Number(rec.version);
		if (!Number.isInteger(version) || version < 1) return null;
		if (typeof rec.acceptedAt !== 'string' || Number.isNaN(Date.parse(rec.acceptedAt))) return null;
		const out = { version, acceptedAt: rec.acceptedAt };
		if (typeof rec.context === 'string') out.context = rec.context;
		return out;
	} catch {
		return null;
	}
}

/**
 * Is a parsed acceptance record current for the given disclosure version?
 * Pure — safe to unit-test.
 * @param {{version:number}|null} record
 * @param {number} [version]
 */
export function isAckCurrent(record, version = RISK_ACK_VERSION) {
	return !!record && Number.isInteger(record.version) && record.version >= version;
}

// localStorage can be unavailable (private mode, embeds with blocked storage).
// Keep an in-memory fallback so one acceptance at least covers the page session.
let _sessionAck = null;

function _readStored() {
	try {
		return parseAckRecord(globalThis.localStorage?.getItem(RISK_ACK_STORAGE_KEY));
	} catch {
		return null;
	}
}

/** Has the user accepted the current version of the Risk Disclosure? */
export function hasRiskAck() {
	return isAckCurrent(_readStored()) || isAckCurrent(_sessionAck);
}

function _persist(record) {
	_sessionAck = record;
	try {
		globalThis.localStorage?.setItem(RISK_ACK_STORAGE_KEY, JSON.stringify(record));
	} catch {
		/* storage blocked — session fallback above still applies */
	}
}

function _recordServerSide(record) {
	try {
		// Resolve against this module's origin so third-party embeds (x402.js on
		// merchant sites) record to three.ws, not the host page. Same-origin
		// requests carry the session cookie; cross-origin ones record anonymously.
		const url = new URL(RISK_ACK_ENDPOINT, import.meta.url);
		fetch(url, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			credentials: 'same-origin',
			keepalive: true,
			body: JSON.stringify({
				version: record.version,
				context: record.context || null,
				path: globalThis.location ? globalThis.location.pathname : null,
			}),
		}).catch(() => {});
	} catch {
		/* best-effort — client-side acceptance already stands */
	}
}

const STYLE_ID = 'risk-ack-styles';

function _ensureStyles() {
	if (document.getElementById(STYLE_ID)) return;
	const style = document.createElement('style');
	style.id = STYLE_ID;
	style.textContent = `
.risk-ack {
	border: none; padding: 0; background: transparent; color: inherit;
	max-width: min(560px, calc(100vw - 2rem));
	max-height: calc(100svh - 2rem);
	opacity: 1; transform: scale(1) translateY(0);
	transition: opacity .2s ease, transform .2s ease;
	font-family: var(--sans, -apple-system, system-ui, 'Segoe UI', sans-serif);
}
.risk-ack::backdrop { background: var(--modal-backdrop, rgba(0, 0, 0, .72)); }
@starting-style {
	.risk-ack[open] { opacity: 0; transform: scale(.96) translateY(10px); }
}
.risk-ack--closing { opacity: 0 !important; transform: scale(.96) translateY(10px) !important; }
.risk-ack-inner {
	background: var(--modal-bg, rgba(10, 11, 18, .97));
	border: 1px solid var(--modal-border, rgba(255, 255, 255, .14));
	border-radius: var(--modal-radius, 16px);
	box-shadow: var(--modal-shadow, 0 24px 64px rgba(0, 0, 0, .6));
	display: flex; flex-direction: column;
	max-height: calc(100svh - 4rem); overflow: hidden;
}
.risk-ack-header {
	display: flex; align-items: center; gap: .6rem;
	padding: 1rem 1.5rem;
	border-bottom: 1px solid var(--modal-border, rgba(255, 255, 255, .14));
}
.risk-ack-badge {
	font-size: 1.15rem; line-height: 1;
	color: var(--amber, #f2c063);
}
.risk-ack-title {
	margin: 0; font-size: 1.05rem; font-weight: 600;
	color: var(--ink, #f5f7fa); line-height: 1.25;
}
.risk-ack-body {
	padding: 1.25rem 1.5rem; overflow-y: auto;
	color: var(--ink-dim, rgba(245, 247, 250, .68));
	font-size: .92rem; line-height: 1.55;
}
.risk-ack-body p { margin: 0 0 .75rem; }
.risk-ack-body ul { margin: 0 0 .75rem; padding-left: 1.2rem; }
.risk-ack-body li { margin-bottom: .45rem; }
.risk-ack-body strong { color: var(--ink, #f5f7fa); font-weight: 600; }
.risk-ack-body a { color: var(--accent, #a4f0bc); }
.risk-ack-check {
	display: flex; align-items: flex-start; gap: .6rem;
	margin-top: .9rem; padding: .75rem .85rem;
	background: var(--surface-2, rgba(255, 255, 255, .05));
	border: 1px solid var(--line, rgba(255, 255, 255, .12));
	border-radius: var(--radius-md, 10px);
	cursor: pointer; user-select: none;
	color: var(--ink, #f5f7fa); font-size: .88rem; line-height: 1.45;
	transition: border-color .15s;
}
.risk-ack-check:hover { border-color: var(--ink-dim, rgba(245, 247, 250, .4)); }
.risk-ack-check:focus-within { outline: 2px solid var(--accent, #a4f0bc); outline-offset: 2px; }
.risk-ack-check input {
	margin: .15rem 0 0; flex-shrink: 0;
	width: 1rem; height: 1rem;
	accent-color: var(--accent, #a4f0bc);
	cursor: pointer;
}
.risk-ack-actions {
	display: flex; justify-content: flex-end; gap: .75rem; flex-wrap: wrap;
	padding: 1rem 1.5rem;
	border-top: 1px solid var(--modal-border, rgba(255, 255, 255, .14));
}
.risk-ack-btn {
	font: inherit; font-size: .9rem; font-weight: 600;
	padding: .55rem 1.1rem; border-radius: var(--radius-md, 10px);
	cursor: pointer; transition: background .15s, color .15s, opacity .15s;
	border: 1px solid var(--line, rgba(255, 255, 255, .16));
	background: transparent; color: var(--ink-dim, rgba(245, 247, 250, .68));
}
.risk-ack-btn:hover { color: var(--ink, #f5f7fa); background: var(--surface-2, rgba(255, 255, 255, .06)); }
.risk-ack-btn:focus-visible { outline: 2px solid var(--accent, #a4f0bc); outline-offset: 2px; }
.risk-ack-btn--accept {
	border-color: transparent;
	background: var(--accent, #a4f0bc); color: var(--accent-ink, #08130c);
}
.risk-ack-btn--accept:hover:not(:disabled) { background: var(--accent, #a4f0bc); color: var(--accent-ink, #08130c); opacity: .88; }
.risk-ack-btn--accept:disabled { opacity: .4; cursor: not-allowed; }
`;
	(document.head || document.documentElement).appendChild(style);
}

function _buildDialog() {
	const dialog = document.createElement('dialog');
	dialog.className = 'risk-ack';
	dialog.setAttribute('aria-modal', 'true');
	dialog.setAttribute('aria-labelledby', 'risk-ack-title');
	dialog.setAttribute('aria-describedby', 'risk-ack-body');
	dialog.innerHTML = `
		<div class="risk-ack-inner">
			<div class="risk-ack-header">
				<span class="risk-ack-badge" aria-hidden="true">&#9888;</span>
				<h2 class="risk-ack-title" id="risk-ack-title">Real funds — risk acknowledgment</h2>
			</div>
			<div class="risk-ack-body" id="risk-ack-body">
				<p><strong>three.ws is experimental software</strong> — an attempt at innovation, provided
				&ldquo;as is&rdquo;, with no warranties of any kind. Before using any feature that moves real
				money, you must acknowledge:</p>
				<ul>
					<li><strong>You can lose everything you commit.</strong> Digital assets are volatile;
					losses can be total, fast, and irreversible.</li>
					<li><strong>Autonomous features act on your behalf.</strong> Agents, snipers, strategies,
					and autopilot can execute trades and payments without asking you again.</li>
					<li><strong>Nothing here is advice.</strong> No content on three.ws is financial,
					investment, legal, or tax advice.</li>
					<li><strong>three.ws is not responsible for losses.</strong> The operators accept no
					liability for any loss of funds, however it occurs.</li>
					<li><strong>Only use funds you can fully afford to lose</strong>, and only where lawful
					in your jurisdiction.</li>
				</ul>
				<p>Full text: <a href="/legal/risk" target="_blank" rel="noopener">Risk Disclosure</a> ·
				<a href="/legal/tos" target="_blank" rel="noopener">Terms of Service</a></p>
				<label class="risk-ack-check">
					<input type="checkbox" data-risk-ack-check />
					<span>I have read and understood the Risk Disclosure. I accept that three.ws is not
					responsible for any losses and that I use real funds entirely at my own risk.</span>
				</label>
			</div>
			<div class="risk-ack-actions">
				<button type="button" class="risk-ack-btn" data-risk-ack-decline>Not now</button>
				<button type="button" class="risk-ack-btn risk-ack-btn--accept" data-risk-ack-accept disabled>
					I accept the risks
				</button>
			</div>
		</div>
	`;
	return dialog;
}

let _inFlight = null;

/**
 * Ensure the user has accepted the current Risk Disclosure. Resolves
 * immediately with true if already accepted; otherwise shows the
 * acknowledgment dialog and resolves with the user's decision.
 *
 * Concurrent calls share one dialog and one resulting promise.
 *
 * @param {object} [opts]
 * @param {string} [opts.context] — short slug of the gated action ('trade',
 *   'snipe', 'withdraw', 'swap', 'launch', 'x402-pay', 'onramp', …), stored
 *   with the acceptance record for audit.
 * @returns {Promise<boolean>} true = accepted (now or previously), false = declined
 */
export function ensureRiskAck({ context = 'real-funds' } = {}) {
	if (hasRiskAck()) return Promise.resolve(true);
	if (typeof document === 'undefined') return Promise.resolve(false);
	if (_inFlight) return _inFlight;

	_inFlight = new Promise((resolve) => {
		// The gate must never brick a feature: if the dialog can't render or open
		// (no <dialog> support, detached document, CSP on injected styles), fall
		// back to the plain-confirm acknowledgment instead of throwing.
		try {
			_openDialog({ context, resolve });
		} catch {
			_inFlight = null;
			resolve(fallbackConfirmAck({ context }));
		}
	});

	return _inFlight;
}

/**
 * Last-resort acknowledgment when the dialog cannot render: a native confirm()
 * carrying the core acceptance text. Accepting persists + records exactly like
 * the dialog path. Exported so wrappers (src/shared/risk-ack.js, x402.js) can
 * reuse the same wording if this module itself fails to load.
 * @param {{context?: string}} [opts]
 * @returns {boolean}
 */
export function fallbackConfirmAck({ context = 'real-funds' } = {}) {
	try {
		const ok = globalThis.confirm?.(RISK_ACK_CONFIRM_TEXT) === true;
		if (ok) {
			const record = { version: RISK_ACK_VERSION, acceptedAt: new Date().toISOString(), context };
			_persist(record);
			_recordServerSide(record);
		}
		return ok;
	} catch {
		return false;
	}
}

export const RISK_ACK_CONFIRM_TEXT =
	'Real funds — risk acknowledgment\n\n' +
	'three.ws is experimental software. Losses can be total, fast, and irreversible; ' +
	'autonomous features can trade and pay on your behalf without asking again; nothing here is financial advice; ' +
	'and three.ws is not responsible for any losses. Full text: three.ws/legal/risk\n\n' +
	'Press OK to accept that you use real funds entirely at your own risk, or Cancel to stop.';

function _openDialog({ context, resolve }) {
	_ensureStyles();
	const dialog = _buildDialog();
	document.body.appendChild(dialog);

	const checkbox = dialog.querySelector('[data-risk-ack-check]');
	const acceptBtn = dialog.querySelector('[data-risk-ack-accept]');
	const declineBtn = dialog.querySelector('[data-risk-ack-decline]');
	const prevOverflow = document.body.style.overflow;
	const trigger = document.activeElement;
	let settled = false;

	const finish = (accepted) => {
		if (settled) return;
		settled = true;
		dialog.classList.add('risk-ack--closing');
		setTimeout(() => {
			if (dialog.open) dialog.close();
			dialog.remove();
			document.body.style.overflow = prevOverflow;
			if (trigger instanceof Element) trigger.focus?.();
		}, 210);
		_inFlight = null;
		resolve(accepted);
	};

	checkbox.addEventListener('change', () => {
		acceptBtn.disabled = !checkbox.checked;
	});
	acceptBtn.addEventListener('click', () => {
		if (settled || !checkbox.checked) return;
		const record = {
			version: RISK_ACK_VERSION,
			acceptedAt: new Date().toISOString(),
			context,
		};
		_persist(record);
		_recordServerSide(record);
		finish(true);
	});
	declineBtn.addEventListener('click', () => finish(false));
	dialog.addEventListener('cancel', (e) => {
		e.preventDefault();
		finish(false);
	});
	dialog.addEventListener('click', (e) => {
		// Only a click on the <dialog> element itself can be a ::backdrop click —
		// clicks on inner content target the inner nodes. Checking coordinates
		// alone misfires on keyboard/programmatic activations, which report (0,0).
		if (e.target !== dialog) return;
		const rect = dialog.getBoundingClientRect();
		const outside =
			e.clientX < rect.left || e.clientX > rect.right ||
			e.clientY < rect.top || e.clientY > rect.bottom;
		if (outside) finish(false);
	});

	document.body.style.overflow = 'hidden';
	dialog.showModal();
	checkbox.focus();
}

