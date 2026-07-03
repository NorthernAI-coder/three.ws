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

/**
 * Ensure the user has accepted the current Risk Disclosure — shows the
 * acknowledgment dialog if not. Resolves true when accepted, false when
 * declined; the caller must abort the money action on false.
 * @param {{context?: string}} [opts]
 * @returns {Promise<boolean>}
 */
export async function ensureRiskAck(opts) {
	const m = await _mod();
	return m.ensureRiskAck(opts);
}

/** @returns {Promise<boolean>} whether the current disclosure version is already accepted */
export async function hasRiskAck() {
	const m = await _mod();
	return m.hasRiskAck();
}
