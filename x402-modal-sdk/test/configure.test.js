import { test } from 'node:test';
import assert from 'node:assert/strict';
import { configure, getConfig, version, pay, init } from '../src/x402-modal.js';

test('public API surface is intact', () => {
	assert.equal(typeof pay, 'function');
	assert.equal(typeof init, 'function');
	assert.equal(typeof configure, 'function');
	assert.match(version, /^\d+\.\d+\.\d+$/);
});

test('init() is a no-op without a document (does not throw in Node)', () => {
	assert.doesNotThrow(() => init());
});

test('pay() rejects without an endpoint', async () => {
	await assert.rejects(() => pay({}), /endpoint is required/);
});

test('defaults are vendor-neutral (no origin, no brand, no builder-code echo)', () => {
	const base = getConfig();
	// Out of the box the modal settles any 402 with zero configuration: no
	// hardcoded backend origin, no footer attribution, no builder-code echo.
	assert.equal(base.apiOrigin, null);
	assert.equal(base.brand, null);
	assert.equal(base.builderCode, null);
});

test('configure merges brand and builderCode without dropping siblings', () => {
	// Opt into a brand, then a partial override must keep the untouched sibling.
	configure({ brand: { label: 'Powered by Acme', href: 'https://acme.com' } });
	configure({ brand: { label: 'Acme Pay' } });
	const afterBrand = getConfig();
	assert.equal(afterBrand.brand.label, 'Acme Pay');
	// href left intact since only label was overridden
	assert.equal(afterBrand.brand.href, 'https://acme.com');
	// null clears the brand back to neutral
	configure({ brand: null });
	assert.equal(getConfig().brand, null);

	configure({ apiOrigin: 'https://pay.example.com' });
	assert.equal(getConfig().apiOrigin, 'https://pay.example.com');

	configure({ builderCode: { wallet: 'acme', service: 'acme_pay' } });
	configure({ builderCode: { service: 'acme_checkout' } });
	const afterBuilder = getConfig();
	assert.equal(afterBuilder.builderCode.service, 'acme_checkout');
	assert.equal(afterBuilder.builderCode.wallet, 'acme');

	// null disables the echo entirely
	configure({ builderCode: null });
	assert.equal(getConfig().builderCode, null);

	// restore neutral defaults for any later test run in the same process
	configure({ apiOrigin: null, brand: null, builderCode: null });
});

test("configure honours an explicit empty-string apiOrigin (same-origin)", () => {
	configure({ apiOrigin: '' });
	assert.equal(getConfig().apiOrigin, '');
	configure({ apiOrigin: null });
});
