/**
 * risk-ack — bundler-side wrapper around the canonical /risk-ack.js module.
 *
 * The implementation lives in public/risk-ack.js so plain public/ scripts and
 * third-party embeds (x402.js on merchant sites) can import it at runtime from
 * the three.ws origin. App code imports THIS wrapper; the @vite-ignore dynamic
 * import defers resolution to the browser, where /risk-ack.js is served from
 * the public root in both dev and production.
 *
 * Gate every money-committing action:
 *
 *   import { ensureRiskAck } from '../shared/risk-ack.js';
 *   if (!(await ensureRiskAck({ context: 'trade' }))) return; // user declined
 *
 * Failure policy: this wrapper NEVER rejects. Money features must not brick
 * because the acknowledgment machinery had a bad day. If /risk-ack.js cannot
 * be loaded (broken deploy, blocked request), the gate degrades to a native
 * confirm() carrying the core acceptance text — the user is still asked, the
 * feature still works. The degraded acceptance is remembered only for this
 * page session (no version constant to trust without the module).
 */

function _mod() {
	// Resolve at runtime from the origin (public/risk-ack.js). Rollup resolves a
	// string LITERAL even with @vite-ignore and fails the build ("failed to
	// resolve import /risk-ack.js"); routing the specifier through a variable
	// keeps the import non-analyzable, so it's left as a runtime import — exactly
	// the browser-side deferral this wrapper is documented to provide.
	const spec = '/risk-ack.js';
	return import(/* @vite-ignore */ spec);
}

// Same core wording as RISK_ACK_CONFIRM_TEXT in public/risk-ack.js — inlined
// because this path only runs when that module failed to load.
const DEGRADED_CONFIRM_TEXT =
	'Real funds — risk acknowledgment\n\n' +
	'three.ws is experimental software. Losses can be total, fast, and irreversible; ' +
	'autonomous features can trade and pay on your behalf without asking again; nothing here is financial advice; ' +
	'and three.ws is not responsible for any losses. Full text: three.ws/legal/risk\n\n' +
	'Press OK to accept that you use real funds entirely at your own risk, or Cancel to stop.';

let _degradedSessionAck = false;

function _degradedConfirm() {
	if (_degradedSessionAck) return true;
	try {
		_degradedSessionAck = globalThis.confirm?.(DEGRADED_CONFIRM_TEXT) === true;
	} catch {
		_degradedSessionAck = false;
	}
	return _degradedSessionAck;
}

/**
 * Ensure the user has accepted the current Risk Disclosure — shows the
 * acknowledgment dialog if not. Resolves true when accepted, false when
 * declined; the caller must abort the money action on false. Never rejects.
 * @param {{context?: string}} [opts]
 * @returns {Promise<boolean>}
 */
export async function ensureRiskAck(opts) {
	let m;
	try {
		m = await _mod();
	} catch (err) {
		console.error('[risk-ack] module failed to load, degrading to confirm()', err);
		return _degradedConfirm();
	}
	try {
		return await m.ensureRiskAck(opts);
	} catch (err) {
		console.error('[risk-ack] gate failed, degrading to confirm()', err);
		return _degradedConfirm();
	}
}

/** @returns {Promise<boolean>} whether the current disclosure version is already accepted. Never rejects. */
export async function hasRiskAck() {
	try {
		const m = await _mod();
		return m.hasRiskAck();
	} catch {
		return _degradedSessionAck;
	}
}
