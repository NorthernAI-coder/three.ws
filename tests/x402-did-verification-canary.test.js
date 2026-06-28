import { describe, it, expect } from 'vitest';

// USE-069: DID Verification Canary. validateDidDocument is the correctness core
// of the paid POST /api/x402/did verify mode — it decides `malformed`, which
// drives the `verified` verdict the autonomous loop records. These tests pin its
// behaviour against the real document shapes buildDidDocument() emits (jws +
// eip712) and the failure shapes a regression would produce.
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
process.env.X402_ASSET_MINT_SOLANA = USDC;

const { validateDidDocument } = await import('../api/x402/did.js');
const { getFullRegistry } = await import('../api/_lib/x402/autonomous-registry.js');

const goodJws = {
	'@context': [
		'https://www.w3.org/ns/did/v1',
		'https://w3id.org/security/suites/jws-2020/v1',
		'https://w3id.org/security/suites/secp256k1recovery-2020/v1',
	],
	id: 'did:web:three.ws',
	verificationMethod: [
		{
			id: 'did:web:three.ws#key-1',
			type: 'JsonWebKey2020',
			controller: 'did:web:three.ws',
			publicKeyJwk: { kty: 'OKP', crv: 'Ed25519', x: 'abc', alg: 'EdDSA' },
		},
	],
	assertionMethod: ['did:web:three.ws#key-1'],
	authentication: ['did:web:three.ws#key-1'],
	service: [{ id: 'did:web:three.ws#x402', type: 'x402PaymentService', serviceEndpoint: 'https://three.ws' }],
};

const goodEip712 = {
	'@context': [
		'https://www.w3.org/ns/did/v1',
		'https://w3id.org/security/suites/secp256k1recovery-2020/v1',
	],
	id: 'did:web:three.ws',
	verificationMethod: [
		{
			id: 'did:pkh:eip155:1:0xabc#key-1',
			type: 'EcdsaSecp256k1RecoveryMethod2020',
			controller: 'did:web:three.ws',
			blockchainAccountId: 'eip155:1:0xabc',
		},
	],
	assertionMethod: ['did:pkh:eip155:1:0xabc#key-1'],
	authentication: ['did:pkh:eip155:1:0xabc#key-1'],
	service: [{ id: 'did:web:three.ws#x402', type: 'x402PaymentService', serviceEndpoint: 'https://three.ws' }],
};

describe('validateDidDocument', () => {
	it('accepts a well-formed JWS did:web document', () => {
		const c = validateDidDocument(goodJws);
		expect(c.valid).toBe(true);
		expect(c.has_did_context).toBe(true);
		expect(c.assertion_resolves).toBe(true);
		expect(c.has_x402_service).toBe(true);
	});

	it('accepts a well-formed EIP-712 did:web document', () => {
		expect(validateDidDocument(goodEip712).valid).toBe(true);
	});

	it('rejects a null / non-object document', () => {
		expect(validateDidDocument(null).valid).toBe(false);
		expect(validateDidDocument('nope').valid).toBe(false);
		expect(validateDidDocument([]).valid).toBe(false);
	});

	it('rejects the not_configured error body (404 from the resolver)', () => {
		const c = validateDidDocument({ error: 'not_configured', message: 'no signing key' });
		expect(c.valid).toBe(false);
		expect(c.has_did_id).toBe(false);
	});

	it('rejects a document missing the W3C DID v1 context', () => {
		const c = validateDidDocument({ ...goodJws, '@context': ['https://example.com/v1'] });
		expect(c.has_did_context).toBe(false);
		expect(c.valid).toBe(false);
	});

	it('rejects an assertionMethod that references no real verification method', () => {
		const c = validateDidDocument({ ...goodJws, assertionMethod: ['did:web:three.ws#missing'] });
		expect(c.assertion_resolves).toBe(false);
		expect(c.valid).toBe(false);
	});

	it('rejects a document missing the x402 service binding', () => {
		const c = validateDidDocument({ ...goodJws, service: [] });
		expect(c.has_x402_service).toBe(false);
		expect(c.valid).toBe(false);
	});

	it('rejects a verification method missing the id/type/controller triple', () => {
		const c = validateDidDocument({ ...goodJws, verificationMethod: [{ id: 'x' }] });
		expect(c.has_verification_method).toBe(false);
		expect(c.valid).toBe(false);
	});
});

describe('did-verification-canary registry entry', () => {
	const entry = getFullRegistry().find((e) => e.id === 'did-verification-canary');

	it('is registered as an enabled paid POST canary', () => {
		expect(entry).toBeTruthy();
		expect(entry.enabled).toBe(true);
		expect(entry.method).toBe('POST');
		expect(entry.path).toBe('/api/x402/did');
		expect(entry.pipeline).toBe('health');
		expect(entry.body).toEqual({ did: 'did:three:canary', mode: 'verify' });
		expect(entry.cooldown_s).toBeGreaterThanOrEqual(300);
	});

	it('extractSignal lifts the verdict from a real verify response payload', () => {
		const response = {
			verified: true,
			latency_ms: 142,
			did: 'did:three:canary',
			mode: 'verify',
			resolved_did: 'did:web:three.ws',
			http_status: 200,
			within_latency: true,
			malformed: false,
			configured: true,
			checks: validateDidDocument(goodJws),
			ts: new Date().toISOString(),
		};
		expect(entry.extractSignal(response)).toEqual({
			verified: true,
			latency_ms: 142,
			resolved_did: 'did:web:three.ws',
			http_status: 200,
			malformed: false,
			within_latency: true,
			configured: true,
		});
	});

	it('extractSignal degrades to nulls on an empty/failed response', () => {
		expect(entry.extractSignal(null)).toEqual({
			verified: null,
			latency_ms: null,
			resolved_did: null,
			http_status: null,
			malformed: null,
			within_latency: null,
			configured: null,
		});
	});
});
