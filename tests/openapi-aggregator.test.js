// Tests for GET /openapi.json's aggregator coverage: every endpoint registered
// in api/v1/_providers.js (providerCatalog()) must show up as a real OpenAPI
// path/operation, generated live (never hand-enumerated) — see
// api/openapi-json.js `aggregatorPaths()`. Also guards the pre-existing
// hand-authored /api/mcp, /api/x402/* etc. paths stay intact.

import { describe, it, expect, beforeAll } from 'vitest';
import openapiHandler from '../api/openapi-json.js';
import { providerCatalog } from '../api/v1/_providers.js';

function mockRes() {
	return {
		statusCode: 200,
		_headers: {},
		_body: '',
		setHeader(k, v) {
			this._headers[k.toLowerCase()] = v;
		},
		getHeader(k) {
			return this._headers[k.toLowerCase()];
		},
		end(b) {
			this._body = b || '';
		},
		get headersSent() {
			return false;
		},
		get writableEnded() {
			return false;
		},
	};
}

function mockReq() {
	return {
		method: 'GET',
		url: '/openapi.json',
		headers: { accept: 'application/json', origin: 'https://three.ws' },
		socket: { remoteAddress: '127.0.0.1' },
	};
}

describe('GET /openapi.json — aggregator coverage', () => {
	let doc;

	beforeAll(async () => {
		const res = mockRes();
		await openapiHandler(mockReq(), res);
		expect(res.statusCode).toBe(200);
		// Body must be valid JSON — a parse failure here means the document is
		// broken, not just incomplete.
		doc = JSON.parse(res._body);
	});

	it('is a well-formed OpenAPI 3.1 document', () => {
		expect(doc.openapi).toBe('3.1.0');
		expect(doc.info?.title).toBeTruthy();
		expect(typeof doc.paths).toBe('object');
		expect(Array.isArray(doc.servers)).toBe(true);
	});

	it('declares the aggregator tag', () => {
		const tagNames = (doc.tags || []).map((t) => t.name);
		expect(tagNames).toContain('Crypto API (aggregator)');
	});

	it('covers every registered aggregator endpoint with a real path + operation', () => {
		const catalog = providerCatalog();
		let total = 0;
		for (const provider of catalog) {
			for (const ep of provider.endpoints) {
				total += 1;
				const pathItem = doc.paths[ep.path];
				expect(pathItem, `missing OpenAPI path for ${ep.path}`).toBeTruthy();

				const operation = pathItem[ep.method.toLowerCase()];
				expect(operation, `missing ${ep.method} operation for ${ep.path}`).toBeTruthy();
				expect(operation.tags).toContain('Crypto API (aggregator)');
				expect(operation.summary).toContain(provider.name);
				expect(operation.responses?.['402']).toBeTruthy();

				// Price in the OpenAPI doc must match the registry's priceAtomics,
				// not a hand-copied number that can drift.
				const expectedUsd = (Number(ep.price_usdc_atomics) / 1e6).toString();
				const declaredUsd = operation['x-payment-info']?.price?.amount;
				expect(Number(declaredUsd)).toBeCloseTo(Number(expectedUsd), 6);

				if (ep.method === 'GET') {
					expect(Array.isArray(operation.parameters)).toBe(true);
					// Every documented "(required)" param must be flagged required.
					for (const [name, desc] of Object.entries(ep.params || {})) {
						const param = operation.parameters.find((p) => p.name === name);
						expect(param, `missing OpenAPI param "${name}" for ${ep.path}`).toBeTruthy();
						expect(param.required).toBe(/\(required\)/.test(desc));
					}
				} else {
					expect(operation.requestBody).toBeTruthy();
				}
			}
		}
		// Sanity: the registry isn't empty (would make this test vacuous).
		expect(total).toBeGreaterThan(10);
	});

	it('still carries the hand-authored, non-aggregator paths', () => {
		expect(doc.paths['/api/mcp']).toBeTruthy();
		expect(doc.paths['/api/x402/skill-marketplace']).toBeTruthy();
	});

	it('free-tier endpoints note their quota in x-payment-info', () => {
		const priced = doc.paths['/api/v1/x/coingecko/price']?.get;
		expect(priced['x-payment-info'].note).toMatch(/30\/min/);
		expect(priced['x-payment-info'].note).toMatch(/2000\/day/);
	});
});
