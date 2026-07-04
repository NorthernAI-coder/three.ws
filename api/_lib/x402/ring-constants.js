// Single source of truth for the x402 ring's price/cap constants.
//
// These numbers are consumed in three places that must agree or the config
// validator's `ring_price_exceeds_run_cap` check false-positives (or, worse,
// misses a real contradiction): the ring-settle endpoint's default price, the
// volume loop's per-run cap, and the pure `ring-config.js` validator. Before
// this module each kept its own hand-copied literal. Import from here instead —
// this file is dependency-free (no db/pay/web3), so even the pure config module
// can import it without dragging the pipeline's load-time deps in.

/**
 * ring-settle default price in USDC atomic units ($35.00). Deliberately large so
 * the closed-loop ring carries real volume with FEW transactions (SOL fee scales
 * with tx count, not size). At the default one-settle-per-minute cadence this
 * targets ~$50k/day of settled ring volume (1440 ticks × $35). Lower it only if
 * you want more, smaller settlements; env `X402_PRICE_RING_SETTLE` overrides it.
 */
export const RING_SETTLE_DEFAULT_PRICE_ATOMICS = '35000000';

/**
 * Volume-loop per-run cap default in USDC atomic units ($40.00). Must stay
 * ≥ RING_SETTLE_DEFAULT_PRICE_ATOMICS or the config validator raises
 * `ring_price_exceeds_run_cap` and the ring skips ring-settle every tick. Env
 * `X402_VOLUME_PER_RUN_CAP_ATOMIC` overrides it.
 */
export const VOLUME_PER_RUN_CAP_ATOMIC_DEFAULT = 40_000_000;

/** Resolve the per-run cap, honoring the env override. */
export function volumePerRunCapAtomic() {
	return Math.max(0, Number(process.env.X402_VOLUME_PER_RUN_CAP_ATOMIC || VOLUME_PER_RUN_CAP_ATOMIC_DEFAULT));
}
