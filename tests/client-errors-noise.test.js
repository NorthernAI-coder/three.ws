import { describe, it, expect } from 'vitest';
import { isNonActionableNoise } from '../api/client-errors.js';

const ev = (over) => ({ type: 'unhandledrejection', name: 'Object', message: '', stack: '', ...over });

describe('isNonActionableNoise — injected wallet-provider RPC noise', () => {
	// The exact signature seen in production: an injected EVM wallet rejects
	// window.ethereum.request() with EIP-1474 "Internal JSON-RPC error." as a plain
	// object (caught name "Object"), surfacing as an unhandledrejection on pages
	// that merely co-exist with a wallet extension (e.g. /trending).
	it('drops "Internal JSON-RPC error." with and without trailing period', () => {
		expect(isNonActionableNoise(ev({ message: 'Internal JSON-RPC error.' }))).toBe(true);
		expect(isNonActionableNoise(ev({ message: 'Internal JSON-RPC error' }))).toBe(true);
	});

	it('drops wallet user-cancellation messages (not faults)', () => {
		expect(isNonActionableNoise(ev({ message: 'User rejected the request.' }))).toBe(true);
		expect(isNonActionableNoise(ev({ message: 'User denied transaction signature' }))).toBe(true);
		expect(isNonActionableNoise(ev({ message: "Already processing eth_requestAccounts. Please wait." }))).toBe(true);
		expect(isNonActionableNoise(ev({ message: "Request of type 'wallet_switchEthereumChain' already pending" }))).toBe(true);
	});

	it('drops the same wallet noise reported as a top-level error event', () => {
		expect(isNonActionableNoise(ev({ type: 'error', message: 'Internal JSON-RPC error.' }))).toBe(true);
	});

	it('keeps genuine first-party faults that merely contain similar words', () => {
		expect(isNonActionableNoise(ev({ message: 'Internal server error' }))).toBe(false);
		expect(isNonActionableNoise(ev({ message: 'An internal error occurred while rendering' }))).toBe(false);
		expect(isNonActionableNoise(ev({ message: 'Failed to load avatar' }))).toBe(false);
		expect(isNonActionableNoise(ev({ type: 'error', name: 'TypeError', message: 'x is not a function' }))).toBe(false);
	});

	it('still drops the pre-existing noise classes', () => {
		expect(isNonActionableNoise(ev({ message: 'Script error.' }))).toBe(true);
		expect(isNonActionableNoise(ev({ name: 'AbortError', message: 'aborted' }))).toBe(true);
	});

	it('never touches resource/csp telemetry events', () => {
		expect(isNonActionableNoise(ev({ type: 'resource', message: 'Internal JSON-RPC error.' }))).toBe(false);
		expect(isNonActionableNoise(ev({ type: 'csp', message: 'Internal JSON-RPC error.' }))).toBe(false);
	});
});
