// x402 buyer wiring — pay any x402 endpoint from a local Solana keypair.
//
// Mirrors the canonical three.ws buyer (api/_lib/x402-user-payer.js) but for a
// self-custodial standalone: the signer is YOUR key (SOLANA_SECRET_KEY or a
// per-call `secret`), not a custodial wallet. Real `@x402/*` libraries do the
// 402 dance and sign the Solana `exact`-scheme payment — nothing is mocked.
//
// The flow:
//   1. x402Client + ExactSvmScheme(signer) registered for solana:*
//   2. wrapFetchWithPayment(fetch, client) → a fetch that, on a 402, signs and
//      retries with the X-PAYMENT header, then exposes the settlement response.

import bs58 from 'bs58';

import { SOLANA_DEFAULT_SECRET } from '../config.js';

/** Decode a base58 string OR a JSON byte array into raw secret-key bytes. */
function secretKeyBytes(secret) {
	const s = String(secret || '').trim();
	if (!s) {
		throw Object.assign(new Error('No Solana signer configured. Set SOLANA_SECRET_KEY or pass `secret`.'), {
			code: 'no_signer',
		});
	}
	if (s.startsWith('[')) {
		let arr;
		try {
			arr = JSON.parse(s);
		} catch {
			throw Object.assign(new Error('SOLANA_SECRET_KEY looks like a JSON array but failed to parse.'), {
				code: 'bad_secret',
			});
		}
		return Uint8Array.from(arr);
	}
	try {
		return bs58.decode(s);
	} catch {
		throw Object.assign(new Error('SOLANA_SECRET_KEY must be a base58 string or a JSON byte array.'), {
			code: 'bad_secret',
		});
	}
}

/**
 * Build a Solana signer (from @solana/kit) for the given secret. Returns the
 * kit signer (its `.address` is the base58 pubkey).
 */
export async function getSigner(secretOverride) {
	const { createKeyPairSignerFromBytes } = await import('@solana/kit');
	const bytes = secretKeyBytes(secretOverride || SOLANA_DEFAULT_SECRET);
	return createKeyPairSignerFromBytes(bytes);
}

/**
 * Build a payment-aware fetch bound to a Solana signer. The returned `payingFetch`
 * behaves like global fetch but transparently settles a 402 challenge in USDC.
 *
 * @returns {Promise<{ payingFetch: typeof fetch, httpClient: any, address: string }>}
 */
export async function buildPayingFetch(secretOverride) {
	const [{ x402Client, x402HTTPClient }, { ExactSvmScheme }, { wrapFetchWithPayment }] = await Promise.all([
		import('@x402/core/client'),
		import('@x402/svm/exact/client'),
		import('@x402/fetch'),
	]);
	const signer = await getSigner(secretOverride);
	const client = new x402Client();
	client.register('solana:*', new ExactSvmScheme(signer));
	const httpClient = new x402HTTPClient(client);
	const payingFetch = wrapFetchWithPayment(globalThis.fetch, client);
	return { payingFetch, httpClient, address: String(signer.address) };
}

/** Decode the settlement receipt from a paid response's `x-payment-response` header. */
export async function decodeSettlement(response) {
	const header = response?.headers?.get?.('x-payment-response');
	if (!header) return null;
	try {
		const { decodePaymentResponseHeader } = await import('@x402/fetch');
		return decodePaymentResponseHeader(header);
	} catch {
		try {
			return JSON.parse(Buffer.from(header, 'base64').toString('utf8'));
		} catch {
			return null;
		}
	}
}

/**
 * Fetch an x402 endpoint WITHOUT paying and return its 402 challenge (the
 * `accepts` payment requirements) decoded, or the plain result if it's free.
 */
export async function probeChallenge(url, { method = 'GET', body, timeoutMs = 30000 } = {}) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	let res;
	try {
		res = await fetch(url, {
			method,
			headers: {
				accept: 'application/json',
				...(body !== undefined ? { 'content-type': 'application/json' } : {}),
			},
			body: body !== undefined ? JSON.stringify(body) : undefined,
			signal: controller.signal,
		});
	} catch (err) {
		clearTimeout(timer);
		if (err?.name === 'AbortError') throw Object.assign(new Error(`${url} timed out`), { code: 'timeout' });
		throw Object.assign(new Error(`${url} request failed: ${err?.message || err}`), { code: 'network_error' });
	}
	clearTimeout(timer);
	const text = await res.text();
	let parsed;
	try {
		parsed = text ? JSON.parse(text) : null;
	} catch {
		parsed = text;
	}
	if (res.status !== 402) {
		return { paid: false, status: res.status, ok: res.ok, result: parsed };
	}
	const accepts = Array.isArray(parsed?.accepts) ? parsed.accepts : [];
	return { paid: true, status: 402, accepts, challenge: parsed };
}
