// /.well-known/did.json — W3C DID Document for the x402 Offer & Receipt
// extension signing key (USE-17).
//
// Verifiers use this to resolve our `kid` back to a public key when checking
// EIP-712 / JWS signatures on offers and receipts. Per spec §4.5.1, the
// resolved key is "authorized to sign for the service identified by the
// payload's resourceUrl" so listing the signer address (eip712) or public JWK
// (jws) here is the binding between our HTTPS origin and the signing material.
//
// Routed via `vercel.json`:
//   /.well-known/did.json  →  /api/x402/did
//
// When no issuer is configured, we return 404 — there's nothing to publish.

import { cors, json, method, error } from '../_lib/http.js';
import { env } from '../_lib/env.js';
import { getIssuer } from '../_lib/x402/offer-receipt-issuer.js';

export default async function handler(req, res) {
	if (cors(req, res, { methods: 'GET,OPTIONS', origins: '*' })) return;
	if (!method(req, res, ['GET'])) return;

	let built;
	try {
		built = await getIssuer();
	} catch (err) {
		return error(res, 500, 'issuer_misconfigured', err.message);
	}
	if (!built) {
		return error(
			res,
			404,
			'not_configured',
			'no offer-receipt signing key is configured for this deployment',
		);
	}

	const domain = env.SERVER_DOMAIN;
	const id = `did:web:${domain}`;
	const verificationMethod = [];

	if (built.format === 'eip712') {
		// did:pkh authorization for EIP-712 verifiers. The recovered signer
		// address from any EIP-712 signature MUST match the address embedded
		// in this entry's blockchainAccountId for the offer/receipt to be
		// accepted as originating from this resource server.
		verificationMethod.push({
			id: built.kid,
			// EcdsaSecp256k1RecoveryMethod2020 covers Ethereum-style key
			// recovery; verifiers that pin to a specific scheme (e.g. did:pkh
			// resolvers) will accept this without further interpretation.
			type: 'EcdsaSecp256k1RecoveryMethod2020',
			controller: id,
			blockchainAccountId: `eip155:1:${built.signerAddress}`,
		});
	} else if (built.format === 'jws' && built.publicKey) {
		verificationMethod.push({
			id: built.kid,
			type: 'JsonWebKey2020',
			controller: id,
			publicKeyJwk: {
				...built.publicKey.jwk,
				alg: built.publicKey.alg,
			},
		});
	}

	const doc = {
		'@context': [
			'https://www.w3.org/ns/did/v1',
			'https://w3id.org/security/suites/jws-2020/v1',
			'https://w3id.org/security/suites/secp256k1recovery-2020/v1',
		],
		id,
		verificationMethod,
		// The same key authorizes both offer and receipt signing — assertionMethod
		// is the W3C term that maps cleanly onto "this key signs claims about the
		// service". authentication is included so DID-aware clients can also use
		// the key for SIWX-style flows if we wire them up later.
		assertionMethod: [built.kid],
		authentication: [built.kid],
		service: [
			{
				id: `${id}#x402`,
				type: 'x402PaymentService',
				serviceEndpoint: env.APP_ORIGIN,
			},
		],
	};

	json(res, 200, doc, {
		'content-type': 'application/did+json; charset=utf-8',
		'cache-control': 'public, max-age=300',
	});
}
